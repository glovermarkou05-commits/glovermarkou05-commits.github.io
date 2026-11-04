'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createV127NativeMfaBridge}=require('../server/v127-supabase-native-mfa-bridge.cjs');
const NOW=2000000000;
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FACTOR='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REF='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CH='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const NO={ok:false,productionAuthorized:false,formalV67Pass:0};
const BEGIN={ok:true,proofReference:REF,productionAuthorized:false,formalV67Pass:0};
const now=()=>NOW;
const active=()=>({active:true,primaryRead:true,revocationChecked:true,
 subject:USER,sessionId:SID,checkedAtSec:NOW,expiresAtSec:NOW+100});
function fixture({factors,challenge,verification,claims,persist,activeSession=active,
 issuer,clock=now,journal}={}){
 const calls={list:0,challenge:[],verify:[],active:0,stored:[],claimed:[],saved:[]};
 const map=new Map();
 const state=journal||{
  async createPending(r){calls.saved.push(r);map.set(r.proofReference,{...r,claimed:false});return {recorded:true};},
  async claimPending(q){
   calls.claimed.push(q);
   const r=map.get(q.proofReference);
   if(!r||r.claimed||r.subject!==q.subject||r.sessionId!==q.sessionId)return null;
   r.claimed=true;return {claimed:true,proofReference:r.proofReference,
    subject:r.subject,sessionId:r.sessionId,challengeId:r.challengeId,
    factorId:r.factorId,method:r.method,createdAtSec:r.createdAtSec};
  }
 };
 const auth={mfa:{
  async listFactors(){calls.list++;return factors||{data:{totp:[{id:FACTOR,status:'verified'}],phone:[]},error:null};},
  async challenge(x){calls.challenge.push(x);return challenge||{data:{id:CH},error:null};},
  async verify(x){calls.verify.push(x);return verification||{data:{access_token:'SIGNED-AAL2'},error:null};}
 }};
 const bridge=createV127NativeMfaBridge({
  auth,actor:{subject:USER,sessionId:SID,tokenExpiresAtSec:NOW+120},
  journal:state,receiptKey:Buffer.alloc(32,99),nowSec:clock,newReference:issuer||(()=>REF),
  readActiveSession:async x=>{calls.active++;return activeSession(x);},
  verifySignedJwt:async jwt=>claims?claims(jwt):{sub:USER,session_id:SID,aal:'aal2',exp:NOW+60},
  persistVerifiedReceipt:async r=>{calls.stored.push(r);return persist?persist(r):{recorded:true};}
 });
 return {bridge,calls,map};
}
test('V127 constructor refuses missing scoped Auth, journal, identity and secret',()=>{
 assert.throws(()=>createV127NativeMfaBridge(),TypeError);
 assert.throws(()=>createV127NativeMfaBridge({auth:{mfa:{}}}),TypeError);
});
test('native challenge binds verified factor to server session and stores only opaque proof ref',async()=>{
 const f=fixture();
 assert.deepEqual(await f.bridge.begin({factorId:FACTOR}),BEGIN);
 assert.deepEqual(f.calls.challenge,[{factorId:FACTOR}]);
 assert.deepEqual(f.calls.saved[0],{
  proofReference:REF,challengeId:CH,factorId:FACTOR,
  subject:USER,sessionId:SID,method:'totp',createdAtSec:NOW
 });
 assert.equal(f.calls.list,1);
});
test('verified MFA uses server-owned challenge and cryptographically checked AAL2 JWT',async()=>{
 const f=fixture();
 await f.bridge.begin({factorId:FACTOR});
 const r=await f.bridge.confirm({proofReference:REF,code:'123456'});
 assert.deepEqual(r,BEGIN);
 assert.deepEqual(f.calls.verify,[{factorId:FACTOR,challengeId:CH,code:'123456'}]);
 assert.equal(f.calls.stored.length,1);
 assert.match(f.calls.stored[0].receiptId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(f.calls.stored[0].proofReference,REF);
 assert.equal(f.calls.stored[0].sessionId,SID);
 assert.equal(f.calls.stored[0].verifiedAtSec,NOW);
 assert.equal(Object.isFrozen(f.calls.stored[0]),true);
});
test('unverified or wrong factor cannot create challenge',async()=>{
 for(const factors of [
  {data:{totp:[{id:FACTOR,status:'unverified'}],phone:[]},error:null},
  {data:{totp:[{id:USER,status:'verified'}],phone:[]},error:null},
  {data:{totp:[],phone:[]},error:null}
 ]){
  const f=fixture({factors});assert.deepEqual(await f.bridge.begin({factorId:FACTOR}),NO);
  assert.equal(f.calls.challenge.length,0);
 }
});
test('forged challengeId, session, subject, eventKey or arbitrary fields are rejected',async()=>{
 const f=fixture();
 for(const x of [{factorId:FACTOR,challengeId:CH},{factorId:FACTOR,subject:USER},
  {factorId:FACTOR,sessionId:SID},{factorId:FACTOR,role:'postgres'},
  {factorId:FACTOR,eventKey:'f'.repeat(64)},{factorId:'bad'}])
  assert.deepEqual(await f.bridge.begin(x),NO);
 assert.equal(f.calls.challenge.length,0);
});
test('six-digit code only; browser cannot supply challengeId or protocol override at confirmation',async()=>{
 const f=fixture();await f.bridge.begin({factorId:FACTOR});
 for(const q of [{proofReference:REF,code:'12345'}, {proofReference:REF,code:'1234567'},
  {proofReference:REF,code:'abcdef'}, {proofReference:REF,code:'123456',challengeId:CH},
  {proofReference:REF,code:'123456',protocol:'V109'}])
  assert.deepEqual(await f.bridge.confirm(q),NO);
 assert.equal(f.calls.verify.length,0);
});
test('one claimed challenge cannot be verified a second time',async()=>{
 const f=fixture();await f.bridge.begin({factorId:FACTOR});
 assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'123456'}),BEGIN);
 assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'123456'}),NO);
 assert.equal(f.calls.verify.length,1);assert.equal(f.calls.stored.length,1);
});
test('bad MFA code verification error cannot persist receipt',async()=>{
 const f=fixture({verification:{data:null,error:{message:'bad code'}}});
 await f.bridge.begin({factorId:FACTOR});
 assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'000000'}),NO);
 assert.equal(f.calls.stored.length,0);
});
test('JWT must have same subject, session, AAL2 and valid expiry',async()=>{
 for(const altered of [{aal:'aal1'},{sub:FACTOR},{session_id:FACTOR},{exp:NOW}]){
  const f=fixture({claims:async()=>({sub:USER,session_id:SID,aal:'aal2',exp:NOW+60,...altered})});
  await f.bridge.begin({factorId:FACTOR});
  assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'123456'}),NO);
  assert.equal(f.calls.stored.length,0);
 }
});
test('missing or revoked primary session blocks both issuing and confirming',async()=>{
 const f=fixture({activeSession:async()=>null});
 assert.deepEqual(await f.bridge.begin({factorId:FACTOR}),NO);
 assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'123456'}),NO);
 assert.equal(f.calls.challenge.length,0);assert.equal(f.calls.verify.length,0);
});
test('session revoked after challenge before verify blocks operation and never persists',async()=>{
 let activeFlag=true;
 const f=fixture({activeSession:async()=>activeFlag?active():null});
 assert.deepEqual(await f.bridge.begin({factorId:FACTOR}),BEGIN);
 activeFlag=false;
 assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'123456'}),NO);
 assert.equal(f.calls.verify.length,0);
});
test('session revocation after verify, before durable issuance denies receipt',async()=>{
 let checks=0;
 const f=fixture({activeSession:async()=>{checks++;return checks>=5?null:active();}});
 assert.deepEqual(await f.bridge.begin({factorId:FACTOR}),BEGIN);
 assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'123456'}),NO);
 assert.equal(f.calls.stored.length,0);
});
test('durable receipt write failure denies success and does not retry Supabase MFA verify',async()=>{
 const f=fixture({persist:async()=>{throw Error('synthetic database failure');}});
 await f.bridge.begin({factorId:FACTOR});
 assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'123456'}),NO);
 assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'123456'}),NO);
 assert.equal(f.calls.verify.length,1);
});
test('challenge reservation must be atomically claimed; missing pending record denies',async()=>{
 const f=fixture();
 assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'123456'}),NO);
 assert.equal(f.calls.verify.length,0);
});
test('expired pending challenge refuses verification',async()=>{
 let t=NOW;const f=fixture({clock:()=>t,activeSession:async()=>({
  ...active(),checkedAtSec:t,expiresAtSec:t+90
 })});
 await f.bridge.begin({factorId:FACTOR});t+=301;
 assert.deepEqual(await f.bridge.confirm({proofReference:REF,code:'123456'}),NO);
 assert.equal(f.calls.verify.length,0);
});
test('challenge failure and durable journal failure do not falsely report success',async()=>{
 const x=fixture({challenge:{data:null,error:{message:'down'}}});
 assert.deepEqual(await x.bridge.begin({factorId:FACTOR}),NO);
 const y=fixture({journal:{createPending:async()=>{throw Error('disk');},
  claimPending:async()=>null}});
 assert.deepEqual(await y.bridge.begin({factorId:FACTOR}),NO);
});
test('native two challenge IDs map to distinct stable receipt IDs',async()=>{
 const f1=fixture();
 await f1.bridge.begin({factorId:FACTOR});
 await f1.bridge.confirm({proofReference:REF,code:'123456'});
 const ch2='ffffffff-ffff-4fff-8fff-ffffffffffff';
 const f2=fixture({challenge:{data:{id:ch2},error:null}});
 await f2.bridge.begin({factorId:FACTOR});
 await f2.bridge.confirm({proofReference:REF,code:'123456'});
 assert.notEqual(f1.calls.stored[0].receiptId,f2.calls.stored[0].receiptId);
});
test('no production credential, no migration, route and readiness explicitly NO_GO',()=>{
 const f=fixture();
 assert.deepEqual(f.bridge.readiness,{
  labOnly:true,realSupabaseClientConnected:false,
  authMfaChallengesUsedViaOfficialApi:true,privateJournalImplemented:false,
  liveJwtVerifierConnected:false,issuanceCrashConsistencyAudited:false,
  productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 });
 const s=require('node:fs').readFileSync(require('node:path').resolve(__dirname,
  '../server/v127-supabase-native-mfa-bridge.cjs'),'utf8');
 for(const forbid of ['process.env',"require('@supabase/supabase-js')","require('pg')",
  'service_role','console.log(','CREATE ROLE','GRANT SELECT','productionAuthorized:true'])
  assert.equal(s.includes(forbid),false,forbid);
});