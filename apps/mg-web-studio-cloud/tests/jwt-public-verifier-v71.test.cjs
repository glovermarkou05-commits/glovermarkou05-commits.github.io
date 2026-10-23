'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {generateKeyPairSync,sign, randomUUID} = require('node:crypto');
const {createJwtPublicVerifierV71} = require('../server/jwt-public-verifier-v71.cjs');
const ISS = 'https://issuer.test/auth/v1', AUD='authenticated';
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const NOW = 1792752000;
const ec=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const ec2=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const rsa=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:0x10001});
const weak=generateKeyPairSync('rsa',{modulusLength:1024,publicExponent:0x10001});
const key=(kid='kid-ec',alg='ES256',pair=ec)=>({kid,alg,jwk:pair.publicKey.export({format:'jwk'})});
const cfg=(o={})=>({issuer:ISS,audience:AUD,publicKeys:[key()],nowSec:()=>NOW,...o});
const b64=o=>Buffer.from(typeof o==='string'?o:JSON.stringify(o)).toString('base64url');
const claims=(extras={})=>({iss:ISS,aud:AUD,sub:USER,iat:NOW-100,exp:NOW+300,...extras});
function token({header={alg:'ES256',kid:'kid-ec',typ:'JWT'}, payload=claims(), pair=ec, bodyString, headerString, signature, algorithm}={}) {
  const parts=[b64(headerString??header),b64(bodyString??payload)];
  const signed=Buffer.from(parts.join('.'),'ascii');
  const sig=signature===undefined? sign('sha256',signed,{
    key:pair.privateKey,...((algorithm??header.alg)==='ES256'?{dsaEncoding:'ieee-p1363'}:{})
  }):signature;
  return parts.join('.')+'.'+sig.toString('base64url');
}
const verified=async(tok,opts)=>createJwtPublicVerifierV71(cfg(opts))(tok);
const deny=async(tok,opts)=>assert.equal(await verified(tok,opts),null);

test('ES256 authentic JWT returns only verified UUID subject, never payload roles',async()=>{
  const jwt=token({payload:claims({role:'SUPERADMIN',aal:'aal2',user_metadata:{admin:true}})});
  assert.deepEqual(await verified(jwt),{verified:true,subject:USER});
});
test('RSA RS256 2048 verifies using only injected public JWK',async()=>{
  const jwt=token({header:{alg:'RS256',kid:'kid-rsa',typ:'JWT'},pair:rsa,algorithm:'RS256'});
  assert.deepEqual(await verified(jwt,{publicKeys:[key('kid-rsa','RS256',rsa)]}),{verified:true,subject:USER});
});
test('ES256 and RS256 can coexist under distinct kid',async()=>{
  const opts={publicKeys:[key(),key('kid-rsa','RS256',rsa)]};
  assert.ok(await verified(token(),opts));
  assert.ok(await verified(token({header:{alg:'RS256',kid:'kid-rsa',typ:'JWT'},pair:rsa,algorithm:'RS256'}),opts));
});
test('public JWKS rotation is explicit; unknown kid does not trigger lookup',async()=>{
  await deny(token({header:{alg:'ES256',kid:'kid-new',typ:'JWT'},pair:ec2}));
  assert.ok(await verified(token({header:{alg:'ES256',kid:'kid-new',typ:'JWT'},pair:ec2}),
    {publicKeys:[key('kid-new','ES256',ec2)]}));
});
test('modified payload invalidates signature',async()=>{
  const jwt=token();const parts=jwt.split('.');parts[1]=b64(claims({sub:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}));
  await deny(parts.join('.'));
});
test('modified header invalidates signature',async()=>{
  const jwt=token();const parts=jwt.split('.');parts[0]=b64({alg:'ES256',kid:'kid-new',typ:'JWT'});
  await deny(parts.join('.'),{publicKeys:[key(),key('kid-new','ES256',ec2)]});
});
test('signature from different EC key is rejected',async()=>deny(token({pair:ec2})));
test('signature from different RSA key is rejected',async()=>{
  const pair2=generateKeyPairSync('rsa',{modulusLength:2048});
  await deny(token({header:{alg:'RS256',kid:'kid-rsa',typ:'JWT'},pair:pair2,algorithm:'RS256'}),
    {publicKeys:[key('kid-rsa','RS256',rsa)]});
});
test('unsupported alg none/HS256/RS512/EdDSA rejected',async()=>{
  for(const alg of ['none','HS256','RS512','EdDSA','ES384'])await deny(token({header:{alg,kid:'kid-ec',typ:'JWT'}}));
});
test('header jku, jwk, x5u, x5c, crit, b64 or unexpected fields rejected',async()=>{
  for(const field of ['jku','jwk','x5u','x5c','crit','b64','role']){
    await deny(token({header:{alg:'ES256',kid:'kid-ec',typ:'JWT',[field]:'https://evil.test'}}));
  }
});
test('missing or non JWT typ, missing kid, invalid kid are rejected',async()=>{
  for(const hdr of [{alg:'ES256',kid:'kid-ec'},{alg:'ES256',kid:'kid-ec',typ:'JWS'},
    {alg:'ES256',typ:'JWT'},{alg:'ES256',kid:'../evil',typ:'JWT'},
    {alg:'ES256',kid:'kid-rsa',typ:'JWT'}])await deny(token({header:hdr}));
});
test('algorithm-key confusion RS256 JWT cannot use EC key and reverse',async()=>{
  await deny(token({header:{alg:'RS256',kid:'kid-ec',typ:'JWT'},pair:rsa,algorithm:'RS256'}));
  await deny(token({header:{alg:'ES256',kid:'kid-rsa',typ:'JWT'},pair:ec}),
    {publicKeys:[key('kid-rsa','RS256',rsa)]});
});
test('expired exp is rejected without default grace',async()=>deny(token({payload:claims({exp:NOW})})));
test('future nbf rejected',async()=>deny(token({payload:claims({nbf:NOW+2})})));
test('future iat rejected',async()=>deny(token({payload:claims({iat:NOW+1})})));
test('max token age enforced',async()=>deny(token({payload:claims({iat:NOW-4000,exp:NOW+10})})));
test('exp must strictly exceed iat',async()=>deny(token({payload:claims({iat:NOW+10,exp:NOW+10})})));
test('wrong issuer rejected',async()=>deny(token({payload:claims({iss:'https://other.test/auth/v1'})})));
test('wrong audience rejected',async()=>deny(token({payload:claims({aud:'service_role'})})));
test('array audience accepted if exact value included',async()=>{
  assert.ok(await verified(token({payload:claims({aud:['foo','authenticated']})})));
});
test('malformed audience array rejected',async()=>{
  for(const aud of [[],[1,AUD],[AUD,...Array(8).fill('x')],{aud:AUD}])await deny(token({payload:claims({aud})}));
});
test('invalid subject or non UUID subject rejected',async()=>{
  for(const sub of [null,'admin','',5,'00000000-1111','x'.repeat(200)]) await deny(token({payload:claims({sub})}));
});
test('missing numeric claims rejected',async()=>{
  for(const field of ['iat','exp','iss','aud','sub']){const c=claims();delete c[field];await deny(token({payload:c}));}
});
test('fractional, string and overflow temporal claims rejected',async()=>{
  for(const x of [NOW+0.5,'1792752000',2**64,null,-1])await deny(token({payload:claims({exp:x})}));
});
test('config rejects missing audience, issuer, public keys and clock',()=>{
  for(const options of [{issuer:''},{issuer:'http://issuer.test/auth/v1'},
    {issuer:'https://user:password@issuer.test/auth/v1'},
    {issuer:'https://issuer.test/auth/v1?x=1'},
    {issuer:'https://issuer.test/auth/v1#frag'},
    {audience:''},{publicKeys:[]},{publicKeys:[{}]},{nowSec:null},
    {clockToleranceSec:61},{maxTokenAgeSec:0},{maxTokenAgeSec:100000}]) {
    assert.throws(()=>createJwtPublicVerifierV71(cfg(options)),TypeError);
  }
});
test('config rejects weak RSA modulus',()=>{
  assert.throws(()=>createJwtPublicVerifierV71(cfg({publicKeys:[key('weak','RS256',weak)]})),TypeError);
});
test('config rejects duplicate kid and private key material',()=>{
  assert.throws(()=>createJwtPublicVerifierV71(cfg({publicKeys:[key(),key()]})),TypeError);
  const jwk=ec.privateKey.export({format:'jwk'});
  assert.throws(()=>createJwtPublicVerifierV71(cfg({publicKeys:[{kid:'bad',alg:'ES256',jwk}]})),TypeError);
});
test('config rejects mixed or wrong key type, curve and key_ops',()=>{
  const bad=[{kid:'a',alg:'RS256',jwk:ec.publicKey.export({format:'jwk'})},
    {kid:'a',alg:'ES256',jwk:rsa.publicKey.export({format:'jwk'})},
    {...key(),jwk:{...key().jwk,key_ops:['sign']}},
    {...key(),jwk:{...key().jwk,alg:'RS256'}}];
  for(const k of bad)assert.throws(()=>createJwtPublicVerifierV71(cfg({publicKeys:[k]})),TypeError);
});
test('rejected token segments and invalid encoding always return null',async()=>{
  for(const t of ['',null,12,'a.b.c','..',token()+'.extra','a.b','a=b.c.d',
    token().replaceAll('.','/')])await deny(t);
});
test('missing JSON object, invalid UTF-8 or oversized parts rejected',async()=>{
  await deny(token({headerString:'[]'}));
  await deny(token({bodyString:'null'}));
  await deny(token({bodyString:'{"sub":'}));
  const jwt=token().split('.');jwt[0]=Buffer.from([0xff]).toString('base64url');await deny(jwt.join('.'));
  await deny(token({payload:claims({junk:'x'.repeat(5000)})}));
});
test('64-byte EC signature encoding required',async()=>{
  await deny(token({signature:Buffer.alloc(65)}));
  await deny(token({signature:Buffer.alloc(63)}));
});
test('RSA signature length checked before verification',async()=>{
  await deny(token({header:{alg:'RS256',kid:'kid-rsa',typ:'JWT'},pair:rsa,
    signature:Buffer.alloc(10)}),{publicKeys:[key('kid-rsa','RS256',rsa)]});
});
test('clock skew works only when explicitly configured and remains bounded',async()=>{
  const jwt=token({payload:claims({exp:NOW})});
  assert.ok(await verified(jwt,{clockToleranceSec:30}));
  await deny(jwt,{clockToleranceSec:0});
});
test('invalid/throwing clock fails closed',async()=>{
  for(const fn of [()=>NaN,()=>-1,()=>{throw new Error('private key leaked');}])await deny(token(),{nowSec:fn});
});
test('JWT never triggers network: verifier has no remote key resolver',async()=>{
  const v=createJwtPublicVerifierV71(cfg());assert.equal(v.length,1);
  assert.deepEqual(await v(token()),{verified:true,subject:USER});
});
