'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createPinnedAuthVerifierV74}=require('../server/pinned-auth-contract-v74.cjs');
const {assembleUnboundTenantHttpV69}=require('../server/unbound-tenant-stack-v69.cjs');

const ISS='https://issuer.test/auth/v1',JWKS=ISS+'/.well-known/jwks.json',NOW=1792752000;
const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUBJECT='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SESSION='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const a=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const b=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const publicKey=(pair,kid)=>({kid,alg:'ES256',use:'sig',
  ...pair.publicKey.export({format:'jwk'})});
const base64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function signed({key=a,kid='original',claims={}}={}) {
 const h=base64({typ:'JWT',alg:'ES256',kid});
 const p=base64({iss:ISS,aud:'authenticated',sub:SUBJECT,session_id:SESSION,
  iat:NOW-10,exp:NOW+120,...claims});
 return h+'.'+p+'.'+sign('sha256',Buffer.from(h+'.'+p),
  {key:key.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
}
function createFixture() {
 let keys=[publicKey(a,'original')],state='active',checkedAt=NOW,redirected=false;
 let reads=0,seenJwks=0,seenSessions=0,transportFailure=false,hangKeys=null;
 const auth=createPinnedAuthVerifierV74({issuer:ISS,audience:'authenticated',
  nowSec:()=>NOW,nowMs:()=>1234,keyTimeoutMs:15,sessionTimeoutMs:15,
  refreshIntervalSec:10,
  requestJwks:async request=>{
   seenJwks++;
   if(transportFailure)throw Error('PRIVATE_NETWORK');
   if(hangKeys)return hangKeys;
   assert.equal(request.url,JWKS);
   return {status:200,finalUrl:JWKS,redirected,
    mediaType:'application/json',body:JSON.stringify({keys})};
  },
  readSession:async ({subject,sessionId})=>{
   seenSessions++;
   return {active:state==='active',revocationChecked:true,subject,sessionId,
    checkedAtSec:checkedAt,expiresAtSec:NOW+1000};
  }});
 const stack=assembleUnboundTenantHttpV69({verifyAccessToken:auth.verifyAccessToken,
  query:async ({text,values})=>{
   reads++;
   if(text.includes('mg_organizations'))return {rows:values[0]===ORG?[{id:ORG,status:'active'}]:[]};
   if(text.includes('mg_sites'))return {rows:values[0]===SITE?[{id:SITE,organizationId:ORG,status:'draft'}]:[]};
   if(text.includes('mg_memberships'))return {rows:[{userId:SUBJECT,organizationId:ORG,
    role:'CLIENT_VIEWER',status:'active'}]};
   if(text.includes('mg_membership_site_scopes'))return {rows:[{userId:SUBJECT,
    organizationId:ORG,siteId:SITE}]};
   throw Error('Unexpected fake SQL');
  },makeRequestId:()=> 'v74-id'});
 async function send(token=signed(),headers=null){
  const req=Object.assign(new EventEmitter(),{
   method:'GET',url:'/api/v1/organizations/'+ORG+'/sites/'+SITE+'/access',
   rawHeaders:headers||['Authorization','Bearer '+token],rawTrailers:[],
   complete:false,readableEnded:false,socket:{remoteAddress:'127.0.0.1'}
  });
  const res={destroyed:false,writableEnded:false,headersSent:false,
   writeHead(s,h){this.status=s;this.headers=h;this.headersSent=true;},
   end(body){this.body=body;this.writableEnded=true;}};
  const run=stack.onRequest(req,res);
  req.complete=true;req.readableEnded=true;req.emit('end');
  await run;return res;
 }
 return {auth,stack,send,setKeys:k=>keys=k,revoke:()=>{state='revoked'},
  stale:()=>{checkedAt=NOW-10},redirect:()=>{redirected=true},
  transportFail:()=>{transportFailure=true},hang:p=>{hangKeys=p},
  counts:()=>({reads,seenJwks,seenSessions})};
}
test('real V60-V73 chain authorizes one signed tenant viewer via V74 contracts',async()=>{
 const f=createFixture(),r=await f.send();
 assert.equal(r.status,200);
 assert.deepEqual(JSON.parse(r.body),{ok:true,access:'granted',requestId:'v74-id'});
 assert.deepEqual(f.counts(),{reads:4,seenJwks:1,seenSessions:1});
});
test('active session must be rechecked on every signed request',async()=>{
 const f=createFixture();assert.equal((await f.send()).status,200);
 f.revoke();assert.equal((await f.send()).status,401);
 assert.equal(f.counts().reads,4);assert.equal(f.counts().seenSessions,2);
});
test('stale session evidence fails before any tenant database query',async()=>{
 const f=createFixture();f.stale();
 const r=await f.send();assert.equal(r.status,401);
 assert.equal(f.counts().reads,0);
});
test('forged issuer or audience blocks session and tenant lookup',async()=>{
 const f=createFixture();
 assert.equal((await f.send(signed({claims:{iss:'https://evil.test/auth/v1'}}))).status,401);
 assert.equal((await f.send(signed({claims:{aud:'service_role'}}))).status,401);
 assert.equal(f.counts().reads,0);assert.equal(f.counts().seenSessions,0);
});
test('wrong ES256 signature cannot invoke tenant SQL or session lookup',async()=>{
 const f=createFixture(),r=await f.send(signed({key:b}));
 assert.equal(r.status,401);assert.equal(f.counts().reads,0);
 assert.equal(f.counts().seenSessions,0);
});
test('rotation with explicit invalidation drops old key and accepts new signed key',async()=>{
 const f=createFixture();assert.equal((await f.send()).status,200);
 f.setKeys([publicKey(b,'new')]);f.auth.invalidateKeys();
 assert.equal((await f.send()).status,401);
 assert.equal((await f.send(signed({key:b,kid:'new'}))).status,200);
 assert.equal(f.counts().reads,8);
});
test('JWKS redirect is never followed or accepted even with correct key payload',async()=>{
 const f=createFixture();f.redirect();const r=await f.send();
 assert.equal(r.status,401);assert.equal(f.counts().reads,0);
});
test('JWKS provider exception is denied without disclosing internal details',async()=>{
 const f=createFixture();f.transportFail();
 const r=await f.send();assert.equal(r.status,401);
 assert.equal(f.counts().reads,0);assert.ok(!r.body.includes('PRIVATE_NETWORK'));
});
test('uncooperative JWKS provider times out and retains its bounded work slot',async()=>{
 let release;const hanging=new Promise(resolve=>release=resolve);
 const f=createFixture();f.hang(hanging);
 assert.equal((await f.send()).status,401);
 assert.equal(f.auth.providerStatus().keys.active,1);
 assert.equal((await f.send()).status,401);
 assert.equal(f.counts().seenJwks,1);
 release({status:200,finalUrl:JWKS,redirected:false,mediaType:'application/json',
  body:JSON.stringify({keys:[publicKey(a,'original')]})});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.auth.providerStatus().keys.active,0);
});
test('even signed role claims do not grant elevated tenant authority',async()=>{
 const f=createFixture(),r=await f.send(signed({claims:{role:'SUPERADMIN',
  user_metadata:{role:'SUPERADMIN'}}}));
 assert.equal(r.status,200);
 assert.equal(Object.hasOwn(JSON.parse(r.body),'role'),false);
});
test('no production connection, listening server, or deployment is authorized',()=>{
 const f=createFixture();
 assert.equal(f.auth.readiness.productionAuthorized,false);
 assert.equal(f.auth.readiness.authoritativeSessionStoreConnected,false);
 assert.equal(f.auth.readiness.decision,'NO_GO');
 assert.equal(typeof f.stack.listen,'undefined');
});
