'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createRotatingSessionVerifierV72}=require('../server/rotating-session-verifier-v72.cjs');
const {assembleUnboundTenantHttpV69}=require('../server/unbound-tenant-stack-v69.cjs');
const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SID='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ISS='https://issuer.test/auth/v1', NOW=1792752000;
const kp1=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const kp2=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const entry=(kid, pair)=>({kid,alg:'ES256',jwk:pair.publicKey.export({format:'jwk'})});
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function signed({kid='first',pair=kp1,override={}}={}){
 const a=b64({typ:'JWT',alg:'ES256',kid});
 const b=b64({iss:ISS,aud:'authenticated',sub:USER,iat:NOW-60,exp:NOW+150,session_id:SID,...override});
 return a+'.'+b+'.'+sign('sha256',Buffer.from(a+'.'+b),{key:pair.privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
}
function setup(){
 let keys=[entry('first',kp1)],sessionActive=true,membershipActive=true,queries=0,sessions=0,now=NOW;
 const verified=createRotatingSessionVerifierV72({issuer:ISS,audience:'authenticated',nowSec:()=>now,
  refreshIntervalSec:10,loadPublicKeys:async()=>({keys}),
  checkSession:async({subject,sessionId})=>{sessions++;return {active:sessionActive,subject,sessionId};}});
 const stack=assembleUnboundTenantHttpV69({verifyAccessToken:verified.verifyAccessToken,
  query:async({text,values})=>{
   queries++;
   if(text.includes('mg_organizations'))return {rows:values[0]===ORG?[{id:ORG,status:'active'}]:[]};
   if(text.includes('mg_sites'))return {rows:values[0]===SITE?[{id:SITE,organizationId:ORG,status:'draft'}]:[]};
   if(text.includes('mg_memberships'))return {rows:[{userId:USER,organizationId:ORG,role:'CLIENT_VIEWER',status:membershipActive?'active':'revoked'}]};
   if(text.includes('mg_membership_site_scopes'))return {rows:[{userId:USER,organizationId:ORG,siteId:SITE}]};
   throw Error('unexpected SQL');
  },makeRequestId:()=> 'v72-id'});
 async function request(token=signed()){
  const req=Object.assign(new EventEmitter(),{method:'GET',url:/api/v1/organizations/${ORG}/sites/${SITE}/access,
   rawHeaders:['Authorization','Bearer '+token],rawTrailers:[],complete:false,readableEnded:false,socket:{remoteAddress:'127.0.0.1'}});
  const res={headersSent:false,writableEnded:false,destroyed:false,
   writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},
   end(body){this.body=body;this.writableEnded=true;}};
  const run=stack.onRequest(req,res);req.complete=true;req.readableEnded=true;req.emit('end');await run;return res;
 }
 return {request,verified,setKeys:k=>keys=k,revokeSession:()=>sessionActive=false,
  revokeMembership:()=>membershipActive=false,tick:n=>now+=n,stats:()=>({queries,sessions}),stack};
}
test('signed token and active session pass original V60-V69 read-only chain',async()=>{
 const f=setup();const res=await f.request();assert.equal(res.status,200);
 assert.deepEqual(JSON.parse(res.body),{ok:true,access:'granted',requestId:'v72-id'});
 assert.deepEqual(f.stats(),{queries:4,sessions:1});
});
test('revoked signed session fails before any tenant SQL read',async()=>{
 const f=setup();assert.equal((await f.request()).status,200);
 f.revokeSession();const before=f.stats().queries;
 assert.equal((await f.request()).status,401);assert.equal(f.stats().queries,before);
});
test('old signing key rejected after explicit key revocation',async()=>{
 const f=setup();assert.equal((await f.request()).status,200);
 f.setKeys([entry('second',kp2)]);f.verified.invalidateKeys();
 assert.equal((await f.request()).status,401);
 assert.equal((await f.request(signed({kid:'second',pair:kp2}))).status,200);
});
test('expired/invalid signed token cannot reach session or tenant DB',async()=>{
 const f=setup();assert.equal((await f.request(signed({override:{exp:NOW}}))).status,401);
 assert.deepEqual(f.stats(),{queries:0,sessions:0});
});
test('revoked tenant membership still fails after valid JWT and valid session',async()=>{
 const f=setup();assert.equal((await f.request()).status,200);
 f.revokeMembership();assert.equal((await f.request()).status,404);
});
test('no network server or external provider is attached by V72',()=>{
 const f=setup();assert.equal(typeof f.stack.listen,'undefined');
 assert.equal(f.stack.readiness.decision,'NO_GO');
 assert.equal(f.verified.readiness.decision,'NO_GO');
});
