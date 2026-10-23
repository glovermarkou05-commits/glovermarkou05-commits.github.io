'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createPgSessionReaderV75}=require('../server/pg-session-reader-v75.cjs');
const {createPinnedAuthVerifierV74}=require('../server/pinned-auth-contract-v74.cjs');
const {assembleUnboundTenantHttpV69}=require('../server/unbound-tenant-stack-v69.cjs');
const ISS='https://issuer.test/auth/v1',NOW=1792752000;
const SUBJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const kp=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const pub={kid:'v75',alg:'ES256',use:'sig',...kp.publicKey.export({format:'jwk'})};
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function jwt(claims={},key=kp.privateKey){
 const header=b64({typ:'JWT',alg:'ES256',kid:'v75'});
 const payload=b64({iss:ISS,aud:'authenticated',sub:SUBJECT,session_id:SESSION,
   iat:NOW-20,exp:NOW+90,...claims});
 return header+'.'+payload+'.'+sign('sha256',Buffer.from(header+'.'+payload),
   {key,dsaEncoding:'ieee-p1363'}).toString('base64url');
}
function fixture(){
 let dbRows=[{subject:SUBJECT,sessionId:SESSION,notAfterEpoch:null}],
     pgQueries=0,tenantQueries=0,jwksCalls=0,pgFails=false;
 const pg=createPgSessionReaderV75({nowSec:()=>NOW,proofTtlSec:2,
  query:async({text,values,signal})=>{
   pgQueries++;assert.ok(text.includes('FROM auth.sessions'));
   assert.deepEqual(values,[SESSION,SUBJECT]);assert.ok(signal instanceof AbortSignal);
   if(pgFails)throw Error('NEVER_LOG_DATABASE_URL');
   return {rows:dbRows};
  }});
 const auth=createPinnedAuthVerifierV74({issuer:ISS,audience:'authenticated',nowSec:()=>NOW,
  nowMs:()=>100,keyTimeoutMs:200,sessionTimeoutMs:200,
  requestJwks:async request=>{
   jwksCalls++;assert.equal(request.url,ISS+'/.well-known/jwks.json');
   return {status:200,redirected:false,finalUrl:request.url,mediaType:'application/json',
     body:JSON.stringify({keys:[pub]})};
  },readSession:pg.readSession});
 const app=assembleUnboundTenantHttpV69({verifyAccessToken:auth.verifyAccessToken,
  query:async ({text,values})=>{
   tenantQueries++;
   if(text.includes('mg_organizations'))return {rows:[{id:ORG,status:'active'}]};
   if(text.includes('mg_sites'))return {rows:[{id:SITE,organizationId:ORG,status:'draft'}]};
   if(text.includes('mg_memberships'))return {rows:[{userId:SUBJECT,
      organizationId:ORG,role:'CLIENT_VIEWER',status:'active'}]};
   if(text.includes('mg_membership_site_scopes'))return {rows:[{userId:SUBJECT,
      organizationId:ORG,siteId:SITE}]};
   throw Error('Unexpected SQL');
  },makeRequestId:()=> 'v75-id'});
 async function request(token=jwt(),other={}){
  const req=Object.assign(new EventEmitter(),{method:'GET',
   url:'/api/v1/organizations/'+ORG+'/sites/'+SITE+'/access',
   rawHeaders:['Authorization','Bearer '+token],rawTrailers:[],
   complete:false,readableEnded:false,socket:{remoteAddress:'127.0.0.1'},...other});
  const res={writableEnded:false,headersSent:false,destroyed:false,
   writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},
   end(body){this.body=body;this.writableEnded=true;}};
  const completion=app.onRequest(req,res);
  req.complete=true;req.readableEnded=true;req.emit('end');await completion;
  return res;
 }
 return {pg,auth,app,request,rows:x=>{dbRows=x},fail:()=>{pgFails=true},
   metrics:()=>({pgQueries,tenantQueries,jwksCalls})};
}
test('signed JWT + row in auth.sessions authorizes viewer, no native network',async()=>{
 const f=fixture(),res=await f.request();
 assert.equal(res.status,200);assert.deepEqual(JSON.parse(res.body),
   {ok:true,access:'granted',requestId:'v75-id'});
 assert.deepEqual(f.metrics(),{pgQueries:1,tenantQueries:4,jwksCalls:1});
});
test('second request checks auth.sessions again, no session caching',async()=>{
 const f=fixture();assert.equal((await f.request()).status,200);
 f.rows([]);assert.equal((await f.request()).status,401);
 assert.deepEqual(f.metrics(),{pgQueries:2,tenantQueries:4,jwksCalls:1});
});
test('not_after expired blocks valid signed JWT before tenant SQL',async()=>{
 const f=fixture();f.rows([{subject:SUBJECT,sessionId:SESSION,notAfterEpoch:String(NOW-2)}]);
 const res=await f.request();assert.equal(res.status,401);
 assert.equal(f.metrics().tenantQueries,0);
});
test('not_after future grants only a short-lived session attestation',async()=>{
 const f=fixture();f.rows([{subject:SUBJECT,sessionId:SESSION,notAfterEpoch:String(NOW+1)}]);
 assert.equal((await f.request()).status,200);
 const data=await f.pg.readSession({subject:SUBJECT,sessionId:SESSION,signal:new AbortController().signal});
 assert.equal(data.expiresAtSec,NOW+1);
});
test('malformed session row fails closed and does not authorize tenant',async()=>{
 const f=fixture();f.rows([{subject:SESSION,sessionId:SESSION,notAfterEpoch:null}]);
 assert.equal((await f.request()).status,401);assert.equal(f.metrics().tenantQueries,0);
});
test('database errors deny and never expose DB error message',async()=>{
 const f=fixture();f.fail();const res=await f.request();
 assert.equal(res.status,401);assert.equal(f.metrics().tenantQueries,0);
 assert.ok(!JSON.stringify(res).includes('DATABASE_URL'));
});
test('duplicate session rows cannot authorize tenant',async()=>{
 const f=fixture();f.rows(Array.from({length:2},()=>({subject:SUBJECT,
   sessionId:SESSION,notAfterEpoch:null})));
 assert.equal((await f.request()).status,401);assert.equal(f.metrics().tenantQueries,0);
});
test('tampered token cannot execute PG session query',async()=>{
 const f=fixture();const invalid=jwt({},generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey);
 assert.equal((await f.request(invalid)).status,401);
 assert.equal(f.metrics().pgQueries,0);assert.equal(f.metrics().tenantQueries,0);
});
test('token from different audience cannot execute PG session query',async()=>{
 const f=fixture();assert.equal((await f.request(jwt({aud:'service_role'}))).status,401);
 assert.equal(f.metrics().pgQueries,0);assert.equal(f.metrics().tenantQueries,0);
});
test('V75 still has NO_GO and no driver or publication side effects',()=>{
 const f=fixture();assert.equal(f.pg.readiness.decision,'NO_GO');
 assert.equal(f.pg.readiness.databaseConnected,false);assert.equal(f.auth.readiness.decision,'NO_GO');
 assert.equal(f.app.readiness.decision,'NO_GO');assert.equal(typeof f.app.listen,'undefined');
 assert.deepEqual(f.metrics(),{pgQueries:0,tenantQueries:0,jwksCalls:0});
});
