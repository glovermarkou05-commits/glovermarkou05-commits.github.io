'use strict';
// V124 isolated integration, NEVER a real Supabase Auth integration.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
if(process.env.CI!=='true'||process.env.V124_DISPOSABLE_ONLY!=='1'||
 process.env.V124_HOST!=='127.0.0.1'||process.env.V124_DB!=='qa_ledger'||
 !/^\d{2,5}$/.test(process.env.V124_PORT||'')||
 process.env.V124_ADMIN_PASSWORD!=='v124-synthetic-admin-fixture'||
 process.env.V124_READER_PASSWORD!=='v124-synthetic-reader-fixture'||
 process.env.V124_BACKEND_PASSWORD!=='v124-synthetic-backend-fixture')
 throw Error('V124 CI disposable PG17 boundary required');
for(const name of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
 'SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN','MG_AUTH_QA_URL'])
 if(process.env[name])throw Error('V124 live environment forbidden: '+name);
const {Client,Pool}=require('pg');
const {createV118ScopedLabWriterPool}=require('../qa/v118-scoped-writer-pool.cjs');
const {createV119AtomicBusinessLab}=require('../qa/v119-atomic-business-lab.cjs');
const {createV121TrustedMfaProofGateway}=require('../server/v121-trusted-mfa-proof-gateway.cjs');
const {createV122PrivateAuthSessionRowReader}=require('../server/v122-private-auth-session-row-reader.cjs');
const {createV125UniqueVerificationGateway}=require('../server/v125-unique-verification-gateway.cjs');
const cfg={host:'127.0.0.1',port:Number(process.env.V124_PORT),database:'qa_ledger',
 connectionTimeoutMillis:7000,query_timeout:8000,application_name:'v124_ephemeral_fixture'};
const admin=()=>new Client({...cfg,user:'postgres',password:process.env.V124_ADMIN_PASSWORD});
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REF='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SID1='11111111-1111-4111-8111-111111111111';
const SID2='22222222-2222-4222-8222-222222222222';
const KEY=Buffer.alloc(32,94);
const denied={ok:false,atomicCommitConfirmed:false,productionAuthorized:false,formalV67Pass:0};
const pass={ok:true,atomicCommitConfirmed:true,productionAuthorized:false,formalV67Pass:0};
const now=()=>Math.floor(Date.now()/1000);
const request=(change={})=>({action:'publish',organizationId:ORG,proofReference:REF,siteId:SITE,...change});
async function adminQuery(sql,params=[]){
 const c=admin();await c.connect();
 try{return await c.query(sql,params)}finally{await c.end()}
}
async function addSession(sid=SID1,user=USER,until=null){
 await adminQuery("INSERT INTO auth.sessions(id,user_id,not_after,private_refresh_token) VALUES($1,$2,$3,'SECRET_NOBODY_MAY_READ') ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,not_after=excluded.not_after",[sid,user,until]);
}
async function removeSession(sid=SID1){await adminQuery('DELETE FROM auth.sessions WHERE id=$1',[sid]);}
const eventHash=(user,sid,verifiedAtSec,method='totp')=>
 createHmac('sha256',KEY).update(['mg-v109-mfa-event-v1',user,sid,method,verifiedAtSec].join('|'),'utf8').digest('hex');
async function count(eventKey){
 const l=await adminQuery('SELECT count(*)::int AS count FROM mg_auth_ledger.mfa_redemptions WHERE event_key=$1',[eventKey]);
 const b=await adminQuery('SELECT count(*)::int AS count FROM mg_v119_fictional.completed_operations WHERE event_key=$1',[eventKey]);
 return {ledger:l.rows[0].count,business:b.rows[0].count};
}
function makeFixture({user=USER,sid=SID1,verifiedAtSec=now()-10,
 tokenExpiresAtSec=now()+90,proofReader,authorizeResource,hooks={}}={}){
 const rawWriter=new Pool({...cfg,user:'mg_v118_ci_backend',
  password:process.env.V124_BACKEND_PASSWORD,max:18});
 const readerPool=new Pool({...cfg,user:'mg_v122_ci_auth_reader',
  password:process.env.V124_READER_PASSWORD,max:18});
 const writer=createV118ScopedLabWriterPool(rawWriter);
 const session=createV122PrivateAuthSessionRowReader({
  pool:readerPool,trustedTokenExpiresAtSec:tokenExpiresAtSec,nowSec:now
 });
 const state={proofReads:0,authChecks:0,permissionChecks:0};
 const tx=createV119AtomicBusinessLab({
  pool:writer,readPrimarySession:async input=>{
   state.authChecks++;return session.readPrimarySession(input);
  },
  authorizeResource:async input=>{
   state.permissionChecks++;
   return authorizeResource?authorizeResource(input):
    input.actorId===user&&input.action==='publish'&&input.organizationId===ORG&&input.siteId===SITE;
  },
  hooks,clock:now
 });
 const gate=createV121TrustedMfaProofGateway({
  authenticatedSubject:user,authenticatedSessionId:sid,
  ledgerHmacKey:KEY,nowSec:now,
  readTrustedMfaProof:async input=>{
   state.proofReads++;
   return proofReader?proofReader(input):{
    checkedAtSec:now(),factorOwnershipVerified:true,method:'totp',
    provenanceReviewed:true,sessionBoundByAuthorizedFlow:true,
    sessionId:sid,subject:user,verified:true,verifiedAtSec
   };
  },
  runAtomicOperation:tx.execute
 });
 async function close(){
  await Promise.all([rawWriter.end(),readerPool.end()]);
 }
 return {gate,tx,session,writer,rawWriter,readerPool,state,
  close,verifiedAtSec,hash:eventHash(user,sid,verifiedAtSec)};
}
async function withFixture(fn,options){
 const x=makeFixture(options);
 try{return await fn(x)}finally{await x.close()}
}
// Each scenario is independent. The same synthetic MFA second must not leak
// from an earlier scenario and produce a false duplicate event in a later one.
// Fixture superuser ONLY; no code path in the backend gets TRUNCATE privileges.
test.beforeEach(async()=>{
 await adminQuery('TRUNCATE TABLE mg_auth_ledger.mfa_redemptions, mg_v119_fictional.completed_operations, auth.sessions');
});
test('V124 disposable database is PG17 and both backend principals are nonadmin',async()=>{
 const pg=await adminQuery("SELECT current_database() AS db,current_setting('server_version') AS version");
 assert.equal(pg.rows[0].db,'qa_ledger');
 assert.match(pg.rows[0].version,/^17\./);
 const roles=await adminQuery("SELECT rolname,rolsuper,rolcreaterole,rolbypassrls,rolinherit FROM pg_roles WHERE rolname IN ('mg_v118_ci_backend','mg_v122_ci_auth_reader') ORDER BY rolname");
 assert.equal(roles.rows.length,2);
 for(const r of roles.rows){
  assert.equal(r.rolsuper,false);assert.equal(r.rolcreaterole,false);
  assert.equal(r.rolbypassrls,false);assert.equal(r.rolinherit,false);
 }
});
test('roles are actually segregated: reader cannot write ledger, writer cannot read Auth',async()=>{
 await withFixture(async({rawWriter,readerPool})=>{
  const reader=await readerPool.connect();
  try{
   await assert.rejects(reader.query("INSERT INTO mg_auth_ledger.mfa_redemptions(event_key) VALUES('x')"),e=>e.code==='42501');
   await assert.rejects(reader.query("SELECT private_refresh_token FROM auth.sessions"),e=>e.code==='42501');
   await assert.rejects(reader.query("UPDATE auth.sessions SET user_id=user_id"),e=>e.code==='42501');
  }finally{reader.release(true);}
  const writer=await rawWriter.connect();
  try{
   await assert.rejects(writer.query('SELECT id FROM auth.sessions'),e=>e.code==='42501');
   await assert.rejects(writer.query('SET ROLE mg_v122_ci_auth_reader'),e=>e.code==='42501');
  }finally{writer.release(true);}
 });
});
test('happy path: synthetic MFA proof -> real scoped Auth SELECT -> atomic ledger+fictional business',async()=>{
 await addSession(SID1);
 await withFixture(async({gate,session,writer,state,hash})=>{
  assert.deepEqual(await gate.execute(request()),pass);
  assert.deepEqual(await count(hash),{ledger:1,business:1});
  assert.ok(state.authChecks>=3);
  assert.equal(state.proofReads,1);
  assert.equal(state.permissionChecks,1);
  assert.equal(session.readiness.realSupabaseCredentials,false);
  assert.equal(writer.readiness.productionAuthorized,false);
 });
});
test('same event cannot pay twice even if a second operation is sent to a different tenant',async()=>{
 await addSession(SID1);
 await withFixture(async({gate,hash})=>{
  assert.deepEqual(await gate.execute(request()),pass);
  assert.deepEqual(await gate.execute(request()),denied);
  assert.deepEqual(await gate.execute(request({organizationId:SITE,siteId:ORG})),denied);
  assert.deepEqual(await count(hash),{ledger:1,business:1});
 });
});
test('deleted Auth row before action is denied without a ledger or fictional business write',async()=>{
 await addSession(SID1);await removeSession(SID1);
 await withFixture(async({gate,hash,state,writer})=>{
  assert.deepEqual(await gate.execute(request()),denied);
  assert.deepEqual(await count(hash),{ledger:0,business:0});
  assert.equal(state.permissionChecks,0);
  assert.equal(writer.snapshot().checkedOut,0);
 });
});
test('logout after first success blocks new MFA event, without removing committed history',async()=>{
 await addSession(SID1);
 const verified=now()-10,verified2=verified+1;
 await withFixture(async({gate,hash})=>{
  assert.deepEqual(await gate.execute(request()),pass);
  assert.deepEqual(await count(hash),{ledger:1,business:1});
  await removeSession(SID1);
  const fresh=makeFixture({verifiedAtSec:verified2});
  try{
   assert.deepEqual(await fresh.gate.execute(request()),denied);
   assert.deepEqual(await count(fresh.hash),{ledger:0,business:0});
  }finally{await fresh.close();}
 },{verifiedAtSec:verified});
});
test('Auth row with different user ID rejects same session UUID',async()=>{
 await addSession(SID1,OTHER);
 await withFixture(async({gate,hash})=>{
  assert.deepEqual(await gate.execute(request()),denied);
  assert.deepEqual(await count(hash),{ledger:0,business:0});
 });
});
test('JWT already expired must fail before any Auth DB transaction',async()=>{
 await addSession(SID1);
 await withFixture(async({gate,hash,state})=>{
  assert.deepEqual(await gate.execute(request()),denied);
  assert.deepEqual(await count(hash),{ledger:0,business:0});
  assert.equal(state.permissionChecks,0);
 },{tokenExpiresAtSec:now()-1});
});
test('Auth not_after past denies despite a still-valid synthetic JWT',async()=>{
 await addSession(SID1,USER,new Date((now()-10)*1000));
 await withFixture(async({gate,hash})=>{
  assert.deepEqual(await gate.execute(request()),denied);
  assert.deepEqual(await count(hash),{ledger:0,business:0});
 });
});
test('untrusted or mismatched MFA proof never queries Auth or inserts an event',async()=>{
 await addSession(SID1);
 await withFixture(async({gate,hash,state})=>{
  assert.deepEqual(await gate.execute(request()),denied);
  assert.equal(state.authChecks,0);
  assert.deepEqual(await count(hash),{ledger:0,business:0});
 },{proofReader:async input=>({
  checkedAtSec:now(),factorOwnershipVerified:true,method:'totp',
  provenanceReviewed:true,sessionBoundByAuthorizedFlow:true,
  sessionId:SID2,subject:USER,verified:true,verifiedAtSec:now()-10
 })});
});
test('resource-level tenant authorization blocks despite current session and MFA',async()=>{
 await addSession(SID1);
 await withFixture(async({gate,hash,state})=>{
  assert.deepEqual(await gate.execute(request()),denied);
  assert.deepEqual(await count(hash),{ledger:0,business:0});
  assert.equal(state.permissionChecks,1);
 },{authorizeResource:async()=>false});
});
test('revocation between business INSERT and final Auth check rolls back BOTH PG writes',async()=>{
 await addSession(SID1);
 await withFixture(async({gate,hash,state})=>{
  assert.deepEqual(await gate.execute(request()),denied);
  assert.ok(state.authChecks>=3);
  assert.deepEqual(await count(hash),{ledger:0,business:0});
 },{hooks:{afterBusiness:async()=>removeSession(SID1)}});
});
test('failure after ledger insert rolls back without burning a proof',async()=>{
 await addSession(SID1);
 const verified=now()-10;
 await withFixture(async({gate,hash})=>{
  assert.deepEqual(await gate.execute(request()),denied);
  assert.deepEqual(await count(hash),{ledger:0,business:0});
 },{verifiedAtSec:verified,hooks:{afterLedger:async()=>{throw Error('synthetic_failure_before_business');}}});
 await withFixture(async({gate,hash})=>{
  assert.deepEqual(await gate.execute(request()),pass);
  assert.deepEqual(await count(hash),{ledger:1,business:1});
 },{verifiedAtSec:verified});
});
test('16 simultaneous full stacks yield exactly one ledger and one business effect',async()=>{
 await addSession(SID1);
 await withFixture(async({gate,hash})=>{
  const answers=await Promise.all(Array.from({length:16},()=>gate.execute(request())));
  assert.equal(answers.filter(a=>a.ok).length,1);
  assert.equal(answers.filter(a=>!a.ok).length,15);
  assert.deepEqual(await count(hash),{ledger:1,business:1});
 });
});
test('different valid sessions create independent events; no cross-session privilege',async()=>{
 await addSession(SID1);await addSession(SID2);
 const stamp=now()-10;
 await withFixture(async a=>{
  await withFixture(async b=>{
   assert.notEqual(a.hash,b.hash);
   assert.deepEqual(await Promise.all([a.gate.execute(request()),b.gate.execute(request())]),[pass,pass]);
   assert.deepEqual(await count(a.hash),{ledger:1,business:1});
   assert.deepEqual(await count(b.hash),{ledger:1,business:1});
  },{sid:SID2,verifiedAtSec:stamp});
 },{sid:SID1,verifiedAtSec:stamp});
});
test('caller cannot supply a chosen event key, session, SQL or extra claims',async()=>{
 await addSession(SID1);
 await withFixture(async({gate,writer,state,hash})=>{
  for(const change of [{eventKey:'a'.repeat(64)},{sessionId:SID2},
   {role:'postgres'},{sql:'DROP TABLE auth.sessions'},{user_metadata:{role:'owner'}}]){
   assert.deepEqual(await gate.execute(request(change)),denied);
  }
  assert.equal(state.proofReads,0);assert.equal(writer.snapshot().checkedOut,0);
  assert.deepEqual(await count(hash),{ledger:0,business:0});
 });
});
test('end-to-end readiness remains NO_GO, despite real PG17 integration of synthetic Auth',async()=>{
 await addSession(SID1);
 await withFixture(async({gate,tx,session})=>{
  assert.equal(gate.readiness.liveProofProviderIntegrated,false);
  assert.equal(tx.readiness.businessSideEffectIsFictional,true);
  assert.equal(session.readiness.customTimeoutPoliciesVerified,false);
  assert.equal(session.readiness.revocationLinearizable,false);
  assert.equal(gate.readiness.productionAuthorized,false);
 });
});

const EVENT_A='33333333-3333-4333-8333-333333333333';
const EVENT_B='44444444-4444-4444-8444-444444444444';
const PROOF2='ffffffff-ffff-4fff-8fff-ffffffffffff';
const proofV125=(subject,sessionId,ref,eventId,verifiedAtSec)=>({
 checkedAtSec:now(),eventId,eventIdBoundToVerification:true,
 factorOwnershipVerified:true,method:'totp',proofReference:ref,
 provenanceReviewed:true,sessionBoundByAuthorizedFlow:true,
 sessionId,subject,verified:true,verifiedAtSec
});
function v125ForTx(tx,{user=USER,sid=SID1,verifiedAtSec=now()-10,issuer}={}){
 const lookup=issuer||new Map([[REF,proofV125(user,sid,REF,EVENT_A,verifiedAtSec)]]);
 return createV125UniqueVerificationGateway({
  authenticatedSubject:user,authenticatedSessionId:sid,
  ledgerHmacKey:KEY,nowSec:now,
  readTrustedVerifiedEvent:async ({proofReference})=>lookup.get(proofReference)||null,
  runAtomicOperation:tx.execute
 });
}
const v125Hash=(eventId)=>createHmac('sha256',KEY)
 .update('mg-v125-mfa-event-v2|'+eventId.toLowerCase()).digest('hex');

test('V125 PG17: two distinct backend-issued proofs in the SAME second both commit',async()=>{
 await addSession(SID1);
 const stamp=now()-10,issuer=new Map([
  [REF,proofV125(USER,SID1,REF,EVENT_A,stamp)],
  [PROOF2,proofV125(USER,SID1,PROOF2,EVENT_B,stamp)]
 ]);
 await withFixture(async({tx})=>{
  const gateway=v125ForTx(tx,{issuer});
  assert.deepEqual(await gateway.execute(request()),pass);
  assert.deepEqual(await gateway.execute(request({proofReference:PROOF2})),pass);
  assert.notEqual(v125Hash(EVENT_A),v125Hash(EVENT_B));
  assert.deepEqual(await count(v125Hash(EVENT_A)),{ledger:1,business:1});
  assert.deepEqual(await count(v125Hash(EVENT_B)),{ledger:1,business:1});
 });
});
test('V125 PG17: same verification event cannot be consumed twice by same or different tenant',async()=>{
 await addSession(SID1);
 await withFixture(async({tx})=>{
  const gateway=v125ForTx(tx);
  assert.deepEqual(await gateway.execute(request()),pass);
  assert.deepEqual(await gateway.execute(request()),denied);
  assert.deepEqual(await gateway.execute(request({organizationId:SITE,siteId:ORG,action:'billing'})),denied);
  assert.deepEqual(await count(v125Hash(EVENT_A)),{ledger:1,business:1});
 },{authorizeResource:async()=>true});
});
test('V125 PG17: same event ID cannot be re-spent through a second proof reference',async()=>{
 await addSession(SID1);
 const stamp=now()-10,issuer=new Map([
  [REF,proofV125(USER,SID1,REF,EVENT_A,stamp)],
  [PROOF2,proofV125(USER,SID1,PROOF2,EVENT_A,stamp)]
 ]);
 await withFixture(async({tx})=>{
  const gateway=v125ForTx(tx,{issuer});
  assert.deepEqual(await gateway.execute(request()),pass);
  assert.deepEqual(await gateway.execute(request({proofReference:PROOF2})),denied);
  assert.deepEqual(await count(v125Hash(EVENT_A)),{ledger:1,business:1});
 });
});
test('V125 PG17: 16 concurrent attempts using same event ID commit exactly once',async()=>{
 await addSession(SID1);
 await withFixture(async({tx})=>{
  const gateway=v125ForTx(tx);
  const answers=await Promise.all(Array.from({length:16},()=>gateway.execute(request())));
  assert.equal(answers.filter(x=>x.ok).length,1);
  assert.equal(answers.filter(x=>!x.ok).length,15);
  assert.deepEqual(await count(v125Hash(EVENT_A)),{ledger:1,business:1});
 });
});
test('V125 PG17: revocation before final session SELECT rolls back BOTH effects',async()=>{
 await addSession(SID1);
 await withFixture(async({tx})=>{
  const gateway=v125ForTx(tx);
  assert.deepEqual(await gateway.execute(request()),denied);
  assert.deepEqual(await count(v125Hash(EVENT_A)),{ledger:0,business:0});
 },{hooks:{afterBusiness:async()=>removeSession(SID1)}});
});
test('V125 PG17: an untrusted event ID cannot reach reader or business writer',async()=>{
 await addSession(SID1);
 const stamp=now()-10,issuer=new Map([[REF,proofV125(USER,SID1,REF,
  '99999999-9999-1999-8999-999999999999',stamp)]]);
 await withFixture(async({tx,state,writer})=>{
  const gateway=v125ForTx(tx,{issuer});
  assert.deepEqual(await gateway.execute(request()),denied);
  assert.equal(state.authChecks,0);
  assert.equal(writer.snapshot().checkedOut,0);
  assert.deepEqual(await count(v125Hash(EVENT_A)),{ledger:0,business:0});
 });
});
