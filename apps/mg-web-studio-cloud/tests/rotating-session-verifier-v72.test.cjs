'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createRotatingSessionVerifierV72}=require('../server/rotating-session-verifier-v72.cjs');
const ISS='https://issuer.test/auth/v1',AUD='authenticated',NOW=1792752000;
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const a=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const b=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const rsa=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:65537});
const pub=(kid='first',pair=a,alg='ES256')=>({kid,alg,jwk:pair.publicKey.export({format:'jwk'})});
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token({kid='first',pair=a,alg='ES256',claims={}}={}){
 const h=b64({typ:'JWT',kid,alg}),p=b64({iss:ISS,aud:AUD,sub:USER,session_id:SID,iat:NOW-20,exp:NOW+200,...claims});
 return h+'.'+p+'.'+sign('sha256',Buffer.from(h+'.'+p),{key:pair.privateKey,
  ...(alg==='ES256'?{dsaEncoding:'ieee-p1363'}:{})}).toString('base64url');
}
function fixture(extra={}){
 let now=NOW,keys=[pub()],loads=0,checks=0,enabled=true,loadFails=false,sessionFails=false;
 const loadPublicKeys=async()=>{loads++;if(loadFails)throw Error('PRIVATE');return {keys};};
 const checkSession=async({subject,sessionId})=>{checks++;if(sessionFails)throw Error('PRIVATE');return {active:enabled,subject,sessionId};};
 const v=createRotatingSessionVerifierV72({issuer:ISS,audience:AUD,nowSec:()=>now,
  refreshIntervalSec:10,loadPublicKeys,checkSession,...extra});
 return {v,time:n=>now=n,keys:k=>keys=k,revoke:()=>enabled=false,
  breakKeys:x=>loadFails=x,breakSession:x=>sessionFails=x,loads:()=>loads,checks:()=>checks};
}
test('verified ES256 subject only, never signed role or user metadata',async()=>{
 const f=fixture(),out=await f.v.verifyAccessToken(token({claims:{role:'SUPERADMIN',aal:'aal2'}}));
 assert.deepEqual(out,{verified:true,subject:USER});assert.ok(Object.isFrozen(out));
 assert.equal(f.checks(),1);assert.equal(f.v.readiness.decision,'NO_GO');
});
test('second request checks session even with unchanged key snapshot',async()=>{
 const f=fixture();assert.ok(await f.v.verifyAccessToken(token()));f.revoke();
 assert.equal(await f.v.verifyAccessToken(token()),null);assert.equal(f.loads(),1);assert.equal(f.checks(),2);
});
test('session provider exception always denies',async()=>{
 const f=fixture();f.breakSession(true);assert.equal(await f.v.verifyAccessToken(token()),null);
});
test('incorrect signature cannot call session provider',async()=>{
 const f=fixture();assert.equal(await f.v.verifyAccessToken(token({pair:b})),null);assert.equal(f.checks(),0);
});
test('wrong issuer, audience and expired token deny without session read',async()=>{
 const f=fixture();for(const claims of [{iss:'https://wrong.test/'},{aud:'service_role'},{exp:NOW}])
  assert.equal(await f.v.verifyAccessToken(token({claims})),null);
 assert.equal(f.checks(),0);
});
test('valid signed token with missing session_id denies',async()=>{
 const f=fixture();assert.equal(await f.v.verifyAccessToken(token({claims:{session_id:null}})),null);
 assert.equal(f.checks(),0);
});
test('unknown key ID does not cause on-demand unbounded fetch',async()=>{
 const f=fixture();assert.equal(await f.v.verifyAccessToken(token({kid:'second',pair:b})),null);assert.equal(f.loads(),1);
});
test('key refresh rejects removed signing key and grants newly pinned key',async()=>{
 const f=fixture();assert.ok(await f.v.verifyAccessToken(token()));
 f.keys([pub('second',b)]);f.time(NOW+10);
 assert.equal(await f.v.verifyAccessToken(token()),null);
 assert.deepEqual(await f.v.verifyAccessToken(token({kid:'second',pair:b})),{verified:true,subject:USER});
 assert.equal(f.loads(),2);
});
test('overlap in explicit trusted snapshot supports rolling migration',async()=>{
 const f=fixture();f.keys([pub(),pub('second',b)]);
 assert.ok(await f.v.verifyAccessToken(token()));
 assert.ok(await f.v.verifyAccessToken(token({kid:'second',pair:b})));
});
test('forced invalidation removes key before normal refresh deadline',async()=>{
 const f=fixture();assert.ok(await f.v.verifyAccessToken(token()));
 f.keys([pub('second',b)]);f.v.invalidateKeys();
 assert.equal(await f.v.verifyAccessToken(token()),null);
 assert.ok(await f.v.verifyAccessToken(token({kid:'second',pair:b})));
});
test('failed snapshot refresh denies without serving stale trusted key',async()=>{
 const f=fixture();assert.ok(await f.v.verifyAccessToken(token()));f.time(NOW+10);f.breakKeys(true);
 assert.equal(await f.v.verifyAccessToken(token()),null);
});
test('loader recovers only after valid new snapshot',async()=>{
 const f=fixture();f.breakKeys(true);assert.equal(await f.v.verifyAccessToken(token()),null);
 f.breakKeys(false);assert.ok(await f.v.verifyAccessToken(token()));
});
test('clock rollback fails closed and forces refresh',async()=>{
 const f=fixture();assert.ok(await f.v.verifyAccessToken(token()));f.time(NOW-1);
 assert.equal(await f.v.verifyAccessToken(token()),null);f.time(NOW);
 assert.ok(await f.v.verifyAccessToken(token()));assert.equal(f.loads(),2);
});
test('duplicate or empty signing key snapshots deny',async()=>{
 for(const keys of [[],[pub(),pub()]]){const f=fixture();f.keys(keys);assert.equal(await f.v.verifyAccessToken(token()),null);}
});
test('no private keys or algorithm confusion accepted by trusted loader',async()=>{
 for(const keys of [[{kid:'first',alg:'ES256',jwk:a.privateKey.export({format:'jwk'})}],
  [{kid:'first',alg:'RS256',jwk:a.publicKey.export({format:'jwk'})}]]) {
  const f=fixture();f.keys(keys);assert.equal(await f.v.verifyAccessToken(token()),null);
 }
});
test('RSA RS256 2048 signature and active session both required',async()=>{
 const f=fixture();f.keys([pub('rsa',rsa,'RS256')]);
 assert.deepEqual(await f.v.verifyAccessToken(token({kid:'rsa',pair:rsa,alg:'RS256'})),{verified:true,subject:USER});
});
test('invalid session response identity is never accepted',async()=>{
 for(const result of [{active:true},{active:false,subject:USER,sessionId:SID},
  {active:true,subject:SID,sessionId:SID},{active:true,subject:USER,sessionId:USER}]) {
  const f=fixture({checkSession:async()=>result});assert.equal(await f.v.verifyAccessToken(token()),null);
 }
});
test('factory rejects missing trusted loader/checker and invalid bounds',()=>{
 for(const x of [{loadPublicKeys:null},{checkSession:1},{issuer:'http://issuer.test/'},
  {audience:''},{refreshIntervalSec:9},{refreshIntervalSec:3601},{maxTokenAgeSec:50},{nowSec:0}])
  assert.throws(()=>fixture(x),TypeError);
});
test('parallel cold start loads signing keys only once',async()=>{
 let calls=0,release;const wait=new Promise(resolve=>release=resolve);
 const f=fixture({loadPublicKeys:async()=>{calls++;return wait;}});
 const first=f.v.verifyAccessToken(token()),second=f.v.verifyAccessToken(token());
 release({keys:[pub()]});assert.ok((await first)?.verified);assert.ok((await second)?.verified);assert.equal(calls,1);
});
test('invalidation during an asynchronous snapshot discards old keys',async()=>{
 let release,calls=0;const wait=new Promise(resolve=>release=resolve);
 const f=fixture({loadPublicKeys:async()=>++calls===1?wait:{keys:[pub('second',b)]}});
 const first=f.v.verifyAccessToken(token());f.v.invalidateKeys();
 release({keys:[pub()]});assert.equal(await first,null);
 assert.equal(await f.v.verifyAccessToken(token()),null);
 assert.ok(await f.v.verifyAccessToken(token({kid:'second',pair:b})));
});
test('key invalidation while session check runs denies in-flight request',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 const f=fixture({checkSession:()=>pending});const first=f.v.verifyAccessToken(token());
 for(let i=0;i<8;i++)await Promise.resolve();
 f.v.invalidateKeys();release({active:true,subject:USER,sessionId:SID});
 assert.equal(await first,null);
});
test('output never contains tokens, emails, session id or privileges',async()=>{
 const f=fixture();const out=await f.v.verifyAccessToken(token({claims:{email:'secret@example.test',role:'ADMIN'}}));
 assert.equal(JSON.stringify(out).includes('secret'),false);
 assert.equal(JSON.stringify(out).includes(SID),false);
 assert.deepEqual(Object.keys(out),['verified','subject']);
});
