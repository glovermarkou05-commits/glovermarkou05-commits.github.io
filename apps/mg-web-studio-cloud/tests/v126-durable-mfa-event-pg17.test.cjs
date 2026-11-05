'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
if(process.env.CI!=='true'||process.env.V126_DISPOSABLE_ONLY!=='1'||
 process.env.V126_HOST!=='127.0.0.1'||process.env.V126_DB!=='qa_ledger'||
 !/^\d{2,5}$/.test(process.env.V126_PORT||'')||
 process.env.V126_ADMIN_PWD!=='v126-ci-admin-fixture'||
 process.env.V126_ISSUER_PWD!=='v126-ci-issuer-fixture'||
 process.env.V126_READER_PWD!=='v126-ci-reader-fixture'||
 process.env.V126_WRITER_PWD!=='v126-ci-writer-fixture'||
 process.env.V126_AUTH_READER_PWD!=='v126-ci-auth-fixture')
 throw Error('V126 only operates inside disposable PG17 GitHub CI');
for(const k of ['DATABASE_URL','SUPABASE_URL','SUPABASE_DB_URL','SUPABASE_SERVICE_ROLE_KEY',
 'SUPABASE_ACCESS_TOKEN','MG_AUTH_QA_URL'])if(process.env[k])
 throw Error('V126 no live Supabase settings allowed: '+k);
const {Client,Pool}=require('pg');
const {createV126DurableMfaEventStore,ISSUER,READER}=
 require('../server/v126-durable-mfa-event-store.cjs');
const {createV125UniqueVerificationGateway}=
 require('../server/v125-unique-verification-gateway.cjs');
const {createV126V2OnlySensitiveRoute}=require('../server/v126-v2-only-sensitive-route.cjs');
const {createV130PrivateVerifiedMfaComposition}=require('../server/v130-private-verified-mfa-composition.cjs');
const {createV132AuthServerSessionGate,QA_ISSUER}=require('../server/v132-auth-server-session-gate.cjs');
const {createV118ScopedLabWriterPool}=
 require('../qa/v118-scoped-writer-pool.cjs');
const {createV119AtomicBusinessLab}=
 require('../qa/v119-atomic-business-lab.cjs');
const {createV122PrivateAuthSessionRowReader}=
 require('../server/v122-private-auth-session-row-reader.cjs');
const conf={host:'127.0.0.1',port:Number(process.env.V126_PORT),database:'qa_ledger',
 connectionTimeoutMillis:8000,query_timeout:9000,application_name:'v126_ci_only'};
const login=(user,password,max=18)=>new Pool({...conf,user,password,max});
const admin=()=>new Client({...conf,user:'postgres',password:process.env.V126_ADMIN_PWD});
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WRONG='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SID='11111111-1111-4111-8111-111111111111';
const ORG='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REF='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REF2='ffffffff-ffff-4fff-8fff-ffffffffffff';
const RECEIPT='33333333-3333-4333-8333-333333333333';
const RECEIPT2='44444444-4444-4444-8444-444444444444';
const KEY=Buffer.alloc(32,126);
const request=(x={})=>({proofReference:REF,sessionId:SID,subject:USER,...x});
const gatewayRequest=(x={})=>({action:'publish',organizationId:ORG,proofReference:REF,siteId:SITE,...x});
const YES={recorded:true},NO={recorded:false};
const PASS={ok:true,atomicCommitConfirmed:true,productionAuthorized:false,formalV67Pass:0};
const DENY={ok:false,atomicCommitConfirmed:false,productionAuthorized:false,formalV67Pass:0};
const now=()=>Math.floor(Date.now()/1000);
const defaultAttestation=(input,receiptId=RECEIPT,t=now())=>({
 checkedAtSec:t,factorOwnershipVerified:true,method:'totp',
 proofReference:input.proofReference,provenanceReviewed:true,
 receiptId,sessionBoundByAuthorizedFlow:true,sessionId:input.sessionId,
 subject:input.subject,verified:true,verifiedAtSec:t-10
});
async function sql(s,params=[]){
 const c=admin();await c.connect();
 try{return await c.query(s,params);}finally{await c.end();}
}
async function rowByRef(ref=REF){
 const r=await sql('SELECT receipt_id,event_id,proof_reference,subject,session_id,method,verified_at_sec FROM mg_v126_fictional.verified_mfa_events WHERE proof_reference=$1',[ref]);
 return r.rows.length?r.rows[0]:null;
}
async function countRows(){
 const r=await sql('SELECT count(*)::int AS n FROM mg_v126_fictional.verified_mfa_events');
 return r.rows[0].n;
}
function fixture({attester,clock=now,issuerRole=ISSUER,readerRole=READER}={}){
 const issuer=login(issuerRole,issuerRole===READER?process.env.V126_READER_PWD:process.env.V126_ISSUER_PWD);
 const reader=login(readerRole,readerRole===ISSUER?process.env.V126_ISSUER_PWD:process.env.V126_READER_PWD);
 const state={checks:0};
 const confirmAuthenticMfaReceipt=async q=>{
  state.checks++;
  return attester?attester(q):defaultAttestation(q);
 };
 const store=createV126DurableMfaEventStore({
  issuerPool:issuer,readerPool:reader,confirmAuthenticMfaReceipt,nowSec:clock
 });
 return {store,issuer,reader,state,async close(){await Promise.all([issuer.end(),reader.end()]);}};
}
async function withFixture(fn,options={}){
 const f=fixture(options);try{return await fn(f);}finally{await f.close();}
}
async function authSession(present=true){
 if(present)await sql('INSERT INTO auth.sessions(id,user_id,not_after,private_refresh_token) VALUES ($1,$2,NULL,$3)',[SID,USER,'NONREADABLE']);
 else await sql('DELETE FROM auth.sessions WHERE id=$1',[SID]);
}
function transaction({hooks={},sessionReader}={}){
 const raw=login('mg_v118_ci_backend',process.env.V126_WRITER_PWD);
 const auth=login('mg_v122_ci_auth_reader',process.env.V126_AUTH_READER_PWD);
 const writer=createV118ScopedLabWriterPool(raw);
 const reader=createV122PrivateAuthSessionRowReader({pool:auth,trustedTokenExpiresAtSec:now()+120,nowSec:now});
 const tx=createV119AtomicBusinessLab({pool:writer,readPrimarySession:sessionReader||reader.readPrimarySession,
  authorizeResource:async a=>a.actorId===USER&&a.organizationId===ORG&&a.siteId===SITE&&a.action==='publish',
  hooks,clock:now});
 return {tx,writer,async close(){await Promise.all([raw.end(),auth.end()]);}};
}
const hmac=id=>createHmac('sha256',KEY).update('mg-v125-mfa-event-v2|'+id).digest('hex');
async function ledger(key){
 const a=await sql('SELECT count(*)::int AS n FROM mg_auth_ledger.mfa_redemptions WHERE event_key=$1',[key]);
 const b=await sql('SELECT count(*)::int AS n FROM mg_v119_fictional.completed_operations WHERE event_key=$1',[key]);
 return {ledger:a.rows[0].n,business:b.rows[0].n};
}
function gateway(store,tx){
 return createV125UniqueVerificationGateway({
  authenticatedSubject:USER,authenticatedSessionId:SID,ledgerHmacKey:KEY,
  readTrustedVerifiedEvent:store.readTrustedVerifiedEvent,runAtomicOperation:tx.execute,nowSec:now
 });
}
// Fixture superuser only. NEVER run TRUNCATE against a real project.
test.beforeEach(async()=>sql('TRUNCATE TABLE mg_v126_fictional.verified_mfa_events, mg_auth_ledger.mfa_redemptions, mg_v119_fictional.completed_operations, auth.sessions'));
test('V126 PG17 fixture has 2 nonadmin private proof roles and no public schema exposure',async()=>{
 const q=await sql("SELECT rolname,rolsuper,rolbypassrls,rolinherit FROM pg_roles WHERE rolname IN ('mg_v126_ci_issuer','mg_v126_ci_reader') ORDER BY rolname");
 assert.equal(q.rows.length,2);
 for(const r of q.rows){assert.equal(r.rolsuper,false);assert.equal(r.rolbypassrls,false);assert.equal(r.rolinherit,false);}
 for(const role of ['anon','authenticated','service_role']){
  const z=await sql("SELECT has_schema_privilege($1,'mg_v126_fictional','USAGE') AS usage",[role]);
  assert.equal(z.rows[0].usage,false);
 }
});
test('recording a trusted receipt persists one immutable DB-generated v4 UUID',async()=>{
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  const r=await rowByRef();
  assert.match(r.event_id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(r.receipt_id,RECEIPT);assert.equal(r.subject,USER);assert.equal(r.session_id,SID);
  assert.equal(await countRows(),1);
  const proof=await store.readTrustedVerifiedEvent(request());
  assert.equal(proof.eventId,r.event_id);
  assert.equal(proof.eventIdBoundToVerification,true);
  assert.equal(proof.verified,true);
  assert.ok(Object.isFrozen(proof));
 });
});
test('same verified receipt called repeatedly or after store restart retains same eventId',async()=>{
 const verifiedAtSec=now()-10;
 const stable=async q=>({...defaultAttestation(q),verifiedAtSec});
 let first;
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  first=(await store.readTrustedVerifiedEvent(request())).eventId;
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
 },{attester:stable});
 await withFixture(async({store})=>{
  assert.equal((await store.readTrustedVerifiedEvent(request())).eventId,first);
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  assert.equal((await store.readTrustedVerifiedEvent(request())).eventId,first);
 },{attester:stable});
 assert.equal(await countRows(),1);
});
test('two distinct verified receipts in exactly the same second get DISTINCT persisted events',async()=>{
 const stamp=now()-10;
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  assert.deepEqual(await store.recordVerifiedOnce(request({proofReference:REF2})),YES);
  const a=await store.readTrustedVerifiedEvent(request());
  const b=await store.readTrustedVerifiedEvent(request({proofReference:REF2}));
  assert.equal(a.verifiedAtSec,b.verifiedAtSec);
  assert.notEqual(a.eventId,b.eventId);
  assert.equal(await countRows(),2);
 },{attester:async x=>defaultAttestation(x,x.proofReference===REF?RECEIPT:RECEIPT2,stamp+10)});
});
test('same proof reference with DIFFERENT receipt id cannot silently mint second event',async()=>{
 let receipt=RECEIPT,first;
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  first=(await store.readTrustedVerifiedEvent(request())).eventId;
  receipt=RECEIPT2;
  assert.deepEqual(await store.recordVerifiedOnce(request()),NO);
  assert.equal((await store.readTrustedVerifiedEvent(request())).eventId,first);
 },{attester:async x=>defaultAttestation(x,receipt)});
 assert.equal(await countRows(),1);
});
test('same receipt ID under another proofReference cannot be rebound or reminted',async()=>{
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  assert.deepEqual(await store.recordVerifiedOnce(request({proofReference:REF2})),NO);
  assert.equal(await store.readTrustedVerifiedEvent(request({proofReference:REF2})),null);
  assert.equal(await countRows(),1);
 });
});
test('same receipt ID with changed method or timestamp is denied, original remains immutable',async()=>{
 let method='totp',seconds=now()-10;
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  method='mfa/phone';
  assert.deepEqual(await store.recordVerifiedOnce(request()),NO);
  method='totp';seconds++;
  assert.deepEqual(await store.recordVerifiedOnce(request()),NO);
  assert.equal(await countRows(),1);
 },{attester:async x=>({...defaultAttestation(x),method,verifiedAtSec:seconds})});
});
test('16 simultaneous issue calls for one receipt converge to exactly one persisted event',async()=>{
 // A real verified receipt has one immutable verification time across retries.
 const verifiedAtSec=now()-10;
 await withFixture(async({store})=>{
  const results=await Promise.all(Array.from({length:16},()=>store.recordVerifiedOnce(request())));
  // Under contention, a timed-out/error request may fail closed. The
  // invariant is one immutable event and no fabricated accepted response.
  assert.ok(results.some(x=>x.recorded===true));
  assert.ok(results.every(x=>x.recorded===true||x.recorded===false));
  const p=await store.readTrustedVerifiedEvent(request());
  assert.equal(await countRows(),1);
  assert.equal((await store.readTrustedVerifiedEvent(request())).eventId,p.eventId);
 },{attester:async q=>({...defaultAttestation(q),verifiedAtSec})});
});
test('reader cannot mint an event; absent proof remains absent until trusted issuance',async()=>{
 await withFixture(async({store,state})=>{
  assert.equal(await store.readTrustedVerifiedEvent(request()),null);
  assert.equal(state.checks,0);
  assert.equal(await countRows(),0);
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  assert.notEqual(await store.readTrustedVerifiedEvent(request()),null);
 });
});
test('wrong subject or session cannot see a valid, already recorded event',async()=>{
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  assert.equal(await store.readTrustedVerifiedEvent(request({subject:WRONG})),null);
  assert.equal(await store.readTrustedVerifiedEvent(request({sessionId:WRONG})),null);
  assert.equal(await countRows(),1);
 });
});
test('untrusted attestation or mismatched reference denied before borrowing DB connection',async()=>{
 for(const change of [{verified:false},{factorOwnershipVerified:false},
  {provenanceReviewed:false},{sessionBoundByAuthorizedFlow:false},
  {subject:WRONG},{sessionId:WRONG},{proofReference:REF2},{receiptId:'bad'},
  {checkedAtSec:now()-10},{verifiedAtSec:now()-301}]){
  await withFixture(async({store,issuer})=>{
   assert.deepEqual(await store.recordVerifiedOnce(request()),NO);
   assert.equal(issuer.totalCount,0);
  },{attester:async x=>({...defaultAttestation(x),...change})});
 }
 assert.equal(await countRows(),0);
});
test('no clients can pass eventId, JWT, SQL, role or extra claims to issuance or retrieval',async()=>{
 await withFixture(async({store,issuer,reader})=>{
  for(const change of [{eventId:RECEIPT},{eventKey:'f'.repeat(64)},{jwt:'fake'},
   {role:'postgres'},{sql:'DELETE FROM auth.sessions'},{verifiedAtSec:now()}]){
   assert.deepEqual(await store.recordVerifiedOnce(request(change)),NO);
   assert.equal(await store.readTrustedVerifiedEvent(request(change)),null);
  }
  assert.equal(issuer.totalCount,0);assert.equal(reader.totalCount,0);
 });
});
test('issuer and read-only roles have different, effective column and write privileges',async()=>{
 await withFixture(async({issuer,reader})=>{
  const read=await reader.connect();
  try{
   await assert.rejects(read.query("INSERT INTO mg_v126_fictional.verified_mfa_events(receipt_id) VALUES($1)",[RECEIPT]),e=>e.code==='42501');
   await assert.rejects(read.query('UPDATE mg_v126_fictional.verified_mfa_events SET method=method'),e=>e.code==='42501');
   await assert.rejects(read.query('DELETE FROM mg_v126_fictional.verified_mfa_events'),e=>e.code==='42501');
   await assert.rejects(read.query('SELECT private_refresh_token FROM auth.sessions'),e=>e.code==='42501');
  }finally{read.release(true);}
  const write=await issuer.connect();
  try{
   await assert.rejects(write.query('UPDATE mg_v126_fictional.verified_mfa_events SET method=method'),e=>e.code==='42501');
   await assert.rejects(write.query('DELETE FROM mg_v126_fictional.verified_mfa_events'),e=>e.code==='42501');
   await assert.rejects(write.query('SELECT id FROM auth.sessions'),e=>e.code==='42501');
  }finally{write.release(true);}
 });
});
test('reader cannot impersonate issuer and issuer cannot use writer role',async()=>{
 await withFixture(async({issuer,reader})=>{
  const a=await reader.connect(),b=await issuer.connect();
  try{
   await assert.rejects(a.query('SET ROLE mg_v126_ci_issuer'),e=>e.code==='42501');
   await assert.rejects(b.query('SET ROLE mg_auth_ledger_writer'),e=>e.code==='42501');
  }finally{a.release(true);b.release(true);}
 });
});
test('issuer/reader principals are verified on SAME physical connection before SQL',async()=>{
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),NO);
 },{issuerRole:READER});
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  assert.equal(await store.readTrustedVerifiedEvent(request()),null);
 },{readerRole:ISSUER});
});
test('expired proof is not reusable through new reader, even though its immutable row remains',async()=>{
 let t=now();
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  assert.notEqual(await store.readTrustedVerifiedEvent(request()),null);
  t+=302;
  assert.equal(await store.readTrustedVerifiedEvent(request()),null);
  assert.equal(await countRows(),1);
 },{clock:()=>t,attester:async x=>defaultAttestation(x,RECEIPT,t)});
});
test('synthetic verified MFA issuance plus V125/V119/V122: business committed exactly once',async()=>{
 await authSession();
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  const proof=await store.readTrustedVerifiedEvent(request());
  const trans=transaction();
  try{
   const gate=gateway(store,trans.tx);
   assert.deepEqual(await gate.execute(gatewayRequest()),PASS);
   assert.deepEqual(await gate.execute(gatewayRequest()),DENY);
   assert.deepEqual(await ledger(hmac(proof.eventId)),{ledger:1,business:1});
  }finally{await trans.close();}
 });
});
test('two distinct persistent MFA receipts within the SAME second both authorize fictional business',async()=>{
 await authSession();
 const stamp=now(),attester=x=>defaultAttestation(x,x.proofReference===REF?RECEIPT:RECEIPT2,stamp);
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  assert.deepEqual(await store.recordVerifiedOnce(request({proofReference:REF2})),YES);
  const a=await store.readTrustedVerifiedEvent(request());
  const b=await store.readTrustedVerifiedEvent(request({proofReference:REF2}));
  const trans=transaction();
  try{
   const g=gateway(store,trans.tx);
   assert.deepEqual(await g.execute(gatewayRequest()),PASS);
   assert.deepEqual(await g.execute(gatewayRequest({proofReference:REF2})),PASS);
   assert.notEqual(a.eventId,b.eventId);
   assert.deepEqual(await ledger(hmac(a.eventId)),{ledger:1,business:1});
   assert.deepEqual(await ledger(hmac(b.eventId)),{ledger:1,business:1});
  }finally{await trans.close();}
 },{attester});
});
test('16 concurrent full-stack requests for a persistent event yield one DB business commit',async()=>{
 await authSession();
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  const event=await store.readTrustedVerifiedEvent(request());
  const trans=transaction();
  try{
   const g=gateway(store,trans.tx);
   const answers=await Promise.all(Array.from({length:16},()=>g.execute(gatewayRequest())));
   assert.equal(answers.filter(x=>x.ok).length,1);
   assert.equal(answers.filter(x=>!x.ok).length,15);
   assert.deepEqual(await ledger(hmac(event.eventId)),{ledger:1,business:1});
  }finally{await trans.close();}
 });
});
test('logout after issuing persistent proof denies business and preserves proof history',async()=>{
 await authSession();
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  const proof=await store.readTrustedVerifiedEvent(request());
  await authSession(false);
  const trans=transaction();
  try{
   assert.deepEqual(await gateway(store,trans.tx).execute(gatewayRequest()),DENY);
   assert.deepEqual(await ledger(hmac(proof.eventId)),{ledger:0,business:0});
   assert.equal(await countRows(),1);
  }finally{await trans.close();}
 });
});
test('logout during fictional business insert reverses ledger + business, keeps issued event',async()=>{
 await authSession();
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  const proof=await store.readTrustedVerifiedEvent(request());
  const trans=transaction({hooks:{afterBusiness:async()=>authSession(false)}});
  try{
   assert.deepEqual(await gateway(store,trans.tx).execute(gatewayRequest()),DENY);
   assert.deepEqual(await ledger(hmac(proof.eventId)),{ledger:0,business:0});
   assert.equal(await countRows(),1);
  }finally{await trans.close();}
 });
});
test('real Supabase verifier, retention approval and production remain explicitly unavailable',async()=>{
 await withFixture(async({store})=>{
  assert.deepEqual(store.readiness,{
   labOnly:true,realSupabaseVerifierIntegrated:false,proofIssuerAudited:false,
   eventRetentionReviewed:false,revocationLinearizable:false,
   productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
  });
 });
});

test('V126 V2-only reference route cannot downgrade or replay persisted MFA events',async()=>{
 await authSession();
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  const trans=transaction();
  try{
   const route=createV126V2OnlySensitiveRoute({
    verificationStore:store,authenticatedSubject:USER,
    authenticatedSessionId:SID,ledgerHmacKey:KEY,runAtomicOperation:trans.tx.execute,nowSec:now
   });
   assert.equal(route.readiness.protocol,'V125_EVENT_ID_V2_ONLY');
   assert.equal(route.readiness.legacyV109Allowed,false);
   assert.equal(route.readiness.legacyV121Allowed,false);
   assert.deepEqual(await route.execute(gatewayRequest()),PASS);
   assert.deepEqual(await route.execute(gatewayRequest()),DENY);
   assert.equal(await countRows(),1);
  }finally{await trans.close();}
 });
});
test('V126 V2-only route blocks client-selected protocol, legacy event key and session fields',async()=>{
 await authSession();
 await withFixture(async({store})=>{
  assert.deepEqual(await store.recordVerifiedOnce(request()),YES);
  const trans=transaction();
  try{
   const route=createV126V2OnlySensitiveRoute({
    verificationStore:store,authenticatedSubject:USER,authenticatedSessionId:SID,
    ledgerHmacKey:KEY,runAtomicOperation:trans.tx.execute,nowSec:now
   });
   for(const input of [{protocol:'v1'},{protocolVersion:'V109'},{allowLegacy:true},
    {eventKey:'a'.repeat(64)},{sessionId:SID},{receiptId:RECEIPT},{jwt:'fake'},
    {verifiedAtSec:now()},{version:'v121'}]){
    assert.deepEqual(await route.execute(gatewayRequest(input)),DENY);
   }
   assert.deepEqual(await route.execute(gatewayRequest()),PASS);
  }finally{await trans.close();}
 });
});
test('V126 route will not accept a mock legacy reader or mint an unissued proof',async()=>{
 const fake={readTrustedVerifiedEvent:async()=>null,
  readiness:{labOnly:false,realSupabaseVerifierIntegrated:false,productionAuthorized:false}};
 assert.throws(()=>createV126V2OnlySensitiveRoute({verificationStore:fake,
  authenticatedSubject:USER,authenticatedSessionId:SID,ledgerHmacKey:KEY,
  runAtomicOperation:async()=>PASS,nowSec:now}),TypeError);
 await authSession();
 await withFixture(async({store,state})=>{
  const trans=transaction();
  try{
   const route=createV126V2OnlySensitiveRoute({
    verificationStore:store,authenticatedSubject:USER,authenticatedSessionId:SID,
    ledgerHmacKey:KEY,runAtomicOperation:trans.tx.execute,nowSec:now
   });
   assert.deepEqual(await route.execute(gatewayRequest()),DENY);
   assert.equal(state.checks,0);
   assert.equal(await countRows(),0);
  }finally{await trans.close();}
 });
});

const V130_FACTOR='55555555-5555-4555-8555-555555555555';
const V130_CH='66666666-6666-4666-8666-666666666666';
function v130Composition({issuer,reader,verifyClaims,
 expectedIssuerRole,sessionReader}={}){
 let challenge=null,claimed=false,verifyCalls=0,verifyError=false;
 const journal={
  async createPending(p){
   if(challenge)return {recorded:false};
   challenge={...p};return {recorded:true};
  },
  async claimPending({proofReference,subject,sessionId}){
   if(!challenge||claimed||challenge.proofReference!==proofReference||
    challenge.subject!==subject||challenge.sessionId!==sessionId)return null;
   claimed=true;return {claimed:true,...challenge};
  }
 };
 const auth={mfa:{
  async listFactors(){return {data:{totp:[{id:V130_FACTOR,status:'verified'}],phone:[]},error:null};},
  async challenge(){return {data:{id:V130_CH},error:null};},
  async verify(){verifyCalls++;if(verifyError)throw Error('synthetic-network-unknown');
   return {data:{access_token:'SIGNED-AAL2-SYNTHETIC'},error:null};
  }
 }};
 const data={
  auth,actor:{subject:USER,sessionId:SID,tokenExpiresAtSec:now()+120},
  readActiveSession:sessionReader||(async()=>({
   active:true,primaryRead:true,revocationChecked:true,subject:USER,sessionId:SID,
   checkedAtSec:now(),expiresAtSec:now()+120
  })),
  verifySignedJwt:verifyClaims||(async()=>({
   aal:'aal2',exp:now()+120,sub:USER,session_id:SID
  })),
  journal,issuerPool:issuer,readerPool:reader,receiptKey:Buffer.alloc(32,130),
  newReference:()=>REF,nowSec:now
 };
 if(expectedIssuerRole)data.expectedIssuerRole=expectedIssuerRole;
 const flow=createV130PrivateVerifiedMfaComposition(data);
 return {flow,getVerifyCalls:()=>verifyCalls,failNetwork:()=>{verifyError=true;}};
}
test('V130 PG17: native challenge+verify, private callback and durable receipt persist together',async()=>{
 await withFixture(async({issuer,reader})=>{
  const {flow,getVerifyCalls}=v130Composition({issuer,reader});
  assert.equal((await flow.begin({factorId:V130_FACTOR})).ok,true);
  assert.equal((await flow.confirm({proofReference:REF,code:'123456'})).ok,true);
  const r=await rowByRef();
  assert.ok(r&&r.event_id);
  assert.equal(r.subject,USER);assert.equal(r.session_id,SID);
  assert.equal((await flow.readTrustedVerifiedEvent(request())).eventId,r.event_id);
  assert.equal(await countRows(),1);
  assert.equal(getVerifyCalls(),1);
  assert.equal((await flow.confirm({proofReference:REF,code:'123456'})).ok,false);
  assert.equal(getVerifyCalls(),1);
  assert.equal(flow.persistVerifiedReceipt,undefined);
  assert.equal(flow.readiness.liveAuthVerificationConfirmed,false);
 });
});
test('V130 PG17: invalid signed claims deny persistence and consume pending challenge',async()=>{
 await withFixture(async({issuer,reader})=>{
  const {flow,getVerifyCalls}=v130Composition({issuer,reader,
   verifyClaims:async()=>({aal:'aal1',exp:now()+120,sub:USER,session_id:SID})});
  assert.equal((await flow.begin({factorId:V130_FACTOR})).ok,true);
  assert.equal((await flow.confirm({proofReference:REF,code:'123456'})).ok,false);
  assert.equal((await flow.confirm({proofReference:REF,code:'123456'})).ok,false);
  assert.equal(getVerifyCalls(),1);
  assert.equal(await countRows(),0);
 });
});
test('V130 PG17: mixed QA issuer and CI reader are rejected before any Auth challenge',async()=>{
 await withFixture(async({issuer,reader})=>{
  assert.throws(()=>v130Composition({issuer,reader,
   expectedIssuerRole:'mg_qa_mfa_receipt_issuer'}),TypeError);
  assert.equal(await countRows(),0);
 });
});
test('V130 PG17: verified durable receipt goes through existing one-time business ledger',async()=>{
 await authSession();
 await withFixture(async({issuer,reader})=>{
  const {flow}=v130Composition({issuer,reader});
  assert.equal((await flow.begin({factorId:V130_FACTOR})).ok,true);
  assert.equal((await flow.confirm({proofReference:REF,code:'123456'})).ok,true);
  const e=await flow.readTrustedVerifiedEvent(request());
  const trans=transaction();
  try{
   const gate=gateway(flow,trans.tx);
   assert.deepEqual(await gate.execute(gatewayRequest()),PASS);
   assert.deepEqual(await gate.execute(gatewayRequest()),DENY);
   assert.deepEqual(await ledger(hmac(e.eventId)),{ledger:1,business:1});
  }finally{await trans.close();}
 });
});
test('V130 PG17: session revoked after challenge prevents receipt and business effect',async()=>{
 let revoked=false;
 await withFixture(async({issuer,reader})=>{
  const {flow}=v130Composition({issuer,reader,sessionReader:async()=>revoked?null:{
   active:true,primaryRead:true,revocationChecked:true,
   subject:USER,sessionId:SID,checkedAtSec:now(),expiresAtSec:now()+120
  }});
  assert.equal((await flow.begin({factorId:V130_FACTOR})).ok,true);
  revoked=true;
  assert.equal((await flow.confirm({proofReference:REF,code:'123456'})).ok,false);
  assert.equal(await countRows(),0);
 });
});

function v132AuthFixture(){
 let revoked=false,users=0;
 const token='SIGNED-INITIAL-AAL1-JWT-SYNTHETIC';
 const verifiedToken='SIGNED-AAL2-SYNTHETIC';
 const signedAt=now(),fixedExpiry=signedAt+120;
 const auth={
  async getClaims(t){
   // After MFA the SDK receives a distinct signed AAL2 JWT for the same session.
   // The real V132 gate still checks issuer, signature, revocation, subject and session.
   assert.ok(t===token||t===verifiedToken);
   const afterMfa=t===verifiedToken;
   return {data:{claims:{
    iss:QA_ISSUER,aud:'authenticated',aal:afterMfa?'aal2':'aal1',
    sub:USER,session_id:SID,exp:afterMfa?fixedExpiry+60:fixedExpiry,
    iat:signedAt-20
   }},error:null};
  },
  async getUser(t){
   assert.ok(t===token||t===verifiedToken);users++;
   return revoked?{data:{user:null},error:{message:'revoked'}}:
    {data:{user:{id:USER}},error:null};
  }
 };
 const gate=createV132AuthServerSessionGate({auth,accessToken:token,nowSec:now});
 return {gate,revoke(){revoked=true;},checks:()=>users};
}
test('V132 plus V130/V125/V119: Auth server confirmation avoids managed auth.sessions DB read',async()=>{
 const f=v132AuthFixture(),ctx=await f.gate.authenticate();
 assert.ok(ctx?.actor);
 // An auth.sessions row is NOT created. The app avoids managed Auth RLS entirely.
 await withFixture(async({issuer,reader})=>{
  const {flow}=v130Composition({issuer,reader,sessionReader:ctx.readActiveSession});
  assert.equal((await flow.begin({factorId:V130_FACTOR})).ok,true);
  assert.equal((await flow.confirm({proofReference:REF,code:'123456'})).ok,true);
  const e=await flow.readTrustedVerifiedEvent(request());
  const trans=transaction({sessionReader:ctx.readActiveSession});
  try{
   assert.deepEqual(await gateway(flow,trans.tx).execute(gatewayRequest()),PASS);
   assert.deepEqual(await ledger(hmac(e.eventId)),{ledger:1,business:1});
   assert.ok(f.checks()>=8,'Auth user checked repeatedly before business COMMIT');
   const absent=await sql('SELECT count(*)::int AS n FROM auth.sessions');
   assert.equal(absent.rows[0].n,0);
  }finally{await trans.close();}
 });
});
test('V132 plus V119: Auth server revocation during PG17 transaction causes rollback',async()=>{
 const f=v132AuthFixture(),ctx=await f.gate.authenticate();
 assert.ok(ctx);
 await withFixture(async({issuer,reader})=>{
  const {flow}=v130Composition({issuer,reader,sessionReader:ctx.readActiveSession});
  assert.equal((await flow.begin({factorId:V130_FACTOR})).ok,true);
  assert.equal((await flow.confirm({proofReference:REF,code:'123456'})).ok,true);
  const e=await flow.readTrustedVerifiedEvent(request());
  const trans=transaction({
   sessionReader:ctx.readActiveSession,
   hooks:{afterBusiness:async()=>f.revoke()}
  });
  try{
   assert.deepEqual(await gateway(flow,trans.tx).execute(gatewayRequest()),DENY);
   assert.deepEqual(await ledger(hmac(e.eventId)),{ledger:0,business:0});
   assert.equal(await countRows(),1);
  }finally{await trans.close();}
 });
});
