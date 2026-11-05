'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createV135PrivateQaRuntime,HOST,POOL_HOST,PROJECT_REF,ROLES}=
 require('../server/v135-private-qa-runtime.cjs');
const SUBJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FACTOR='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CHALLENGE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REF='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EVENT='ffffffff-ffff-4fff-8fff-ffffffffffff';
const TOKEN='QA_VALID_SIGNED_TOKEN_FIXTURE';
const NOW=2000000000;
const CA='-----BEGIN CERTIFICATE-----\n'+('Q'.repeat(100))+'\n-----END CERTIFICATE-----';
const PW=['v135-synthetic_journal-only_password_QA','v135-synthetic_issuer-only_password_QA','v135-synthetic_reader-only_password_QA'];
let pools=[],pending=null,claimed=false,stored=null,verifyCalls=0;
class MockPool{
 static ssl=true;
 static overrideUser=null;
 static tlsStream=null;
 constructor(opts){this.opts=opts;this.closed=false;this.calls=0;pools.push(this);}
 async connect(){
  // Supavisor routes role.project-ref; PG reports the original role.
  const role=this.opts.user.split('.')[0];
  return {connection:{stream:MockPool.tlsStream},query:async(sql,args)=>{
   this.calls++;
   if(sql.includes('current_database() AS db'))return {rowCount:1,rows:[{
    db:'postgres',current_user:MockPool.overrideUser||role,
    session_user:role,is_replica:false,ssl:MockPool.ssl
   }]};
   if(sql.includes('pg_is_in_recovery() AS is_replica'))return {rowCount:1,rows:[{
    session_user:role,current_user:role,is_replica:false
   }]};
   if(sql.startsWith('INSERT INTO mg_qa_mfa_challenges.')){
    pending={proof_reference:args[0],challenge_id:args[1],factor_id:args[2],
     subject:args[3],session_id:args[4],method:args[5],created_at_sec:args[6]};
    return {command:'INSERT',rowCount:1,rows:[{proof_reference:args[0]}]};
   }
   if(sql.startsWith('UPDATE mg_qa_mfa_challenges.')){
    if(!pending||claimed)return {command:'UPDATE',rowCount:0,rows:[]};
    claimed=true;return {command:'UPDATE',rowCount:1,rows:[pending]};
   }
   if(sql.startsWith('INSERT INTO mg_qa_mfa_receipts.')){
    stored={receipt_id:args[0],event_id:EVENT,proof_reference:args[1],
     subject:args[2],session_id:args[3],method:args[4],verified_at_sec:args[5]};
    return {command:'INSERT',rowCount:1,rows:[]};
   }
   if(sql.startsWith('SELECT ')&&sql.includes('mg_qa_mfa_receipts.'))
    return {command:'SELECT',rowCount:stored?1:0,rows:stored?[stored]:[]};
   throw Error('Unexpected synthetic SQL');
  },release:()=>{}};
 }
 async end(){this.closed=true;}
}
function reset(){pools=[];pending=null;claimed=false;stored=null;verifyCalls=0;MockPool.ssl=true;MockPool.overrideUser=null;MockPool.tlsStream=null;}
function makeAuth({sessionToken=TOKEN,revoked=false}={}){
 return {
  getSession:async()=>({data:{session:{access_token:sessionToken}},error:null}),
  getClaims:async token=>({data:{claims:{
   iss:'https://tbfhiqkivsoeuudlpkgi.supabase.co/auth/v1',
   aud:'authenticated',sub:SUBJECT,session_id:SESSION,
   aal:token==='signed-AAL2-fixture'?'aal2':'aal1',
   exp:NOW+120,iat:NOW-30}},error:null}),
  getUser:async()=>revoked?{data:{user:null},error:{message:'revoked'}}:
   {data:{user:{id:SUBJECT}},error:null},
  mfa:{
   listFactors:async()=>({data:{totp:[{id:FACTOR,status:'verified'}],phone:[]},error:null}),
   challenge:async()=>({data:{id:CHALLENGE},error:null}),
   verify:async()=>{verifyCalls++;return {data:{access_token:'signed-AAL2-fixture'},error:null};}
  }
 };
}
function opts(auth=makeAuth()){
 return {Pool:MockPool,auth,accessToken:TOKEN,dbHost:HOST,
  caPem:CA,rolePasswords:PW,receiptKey:Buffer.alloc(32,135),
  nowSec:()=>NOW,newReference:()=>REF};
}
test('V135 rejects wrong DB, missing TLS, reused credentials and weak receipt HMAC key',async()=>{
 reset();
 for(const patch of [
  {dbHost:'db.other-project.supabase.co'},
  {dbPort:6543},{dbName:'other'}, {caPem:'bad'},
  {rolePasswords:[PW[0],PW[0],PW[2]]},
  {rolePasswords:[PW[0],PW[1],'too-short']},
  {receiptKey:Buffer.alloc(4)}
 ]) await assert.rejects(createV135PrivateQaRuntime({...opts(),...patch}),TypeError);
 assert.equal(pools.length,0);
});
test('V135 rejects another SDK session before allocating any PG pools',async()=>{
 reset();
 const result=await createV135PrivateQaRuntime(opts(makeAuth({sessionToken:'WRONG_BUT_VALID_LENGTH_TOKEN'})));
 assert.equal(result,null);
 assert.equal(pools.length,0);
});
test('V135 rejects a non-TLS connection and closes all private pools',async()=>{
 reset();MockPool.ssl=false;
 const flow=await createV135PrivateQaRuntime(opts());
 assert.equal(flow,null);
 assert.equal(pools.length,3);
 assert.ok(pools.every(p=>p.closed));
});
test('V135 rejects a nonallowlisted physical PG identity',async()=>{
 reset();MockPool.overrideUser='postgres';
 assert.equal(await createV135PrivateQaRuntime(opts()),null);
 assert.ok(pools.every(p=>p.closed));
});
test('V135 revoked Supabase Auth session fails without issuing MFA receipts',async()=>{
 reset();
 assert.equal(await createV135PrivateQaRuntime(opts(makeAuth({revoked:true}))),null);
 assert.ok(pools.every(p=>p.closed));
 assert.equal(pending,null);
 assert.equal(stored,null);
});
test('V135 uses three SSL-verified least-privilege roles, joins MFA and closes pools',async()=>{
 reset();
 const flow=await createV135PrivateQaRuntime(opts());
 assert.ok(flow);
 assert.deepEqual(pools.map(p=>p.opts.user),ROLES);
 for(const p of pools){
  assert.equal(p.opts.host,HOST);
  assert.equal(p.opts.port,5432);
  assert.equal(p.opts.database,'postgres');
  assert.equal(p.opts.ssl.rejectUnauthorized,true);
  assert.equal(p.opts.ssl.servername,HOST);
  assert.ok(p.opts.ssl.ca.includes('BEGIN CERTIFICATE'));
  assert.equal(p.opts.max,2);
 }
 assert.equal((await flow.begin({factorId:FACTOR})).ok,true);
 assert.equal((await flow.confirm({proofReference:REF,code:'123456'})).ok,true);
 assert.equal(verifyCalls,1);
 const x=await flow.readTrustedVerifiedEvent({
  proofReference:REF,subject:SUBJECT,sessionId:SESSION
 });
 assert.equal(x.eventId,EVENT);
 assert.equal(x.verified,true);
 assert.equal(x.method,'totp');
 assert.equal(flow.readiness.productionAuthorized,false);
 assert.equal(flow.readiness.publicEndpointWired,false);
 const serialized=JSON.stringify(flow.readiness);
 for(const password of PW)assert.equal(serialized.includes(password),false);
 await flow.close();
 assert.ok(pools.every(p=>p.closed));
 assert.equal((await flow.begin({factorId:FACTOR})).ok,false);
 assert.equal(await flow.readTrustedVerifiedEvent({
  proofReference:REF,subject:SUBJECT,sessionId:SESSION
 }),null);
});

function mockVerifiedPoolerSocket(host=POOL_HOST){
 return {encrypted:true,authorized:true,getPeerCertificate:()=>({
  subject:{CN:host},subjectaltname:'DNS:'+host
 })};
}
test('V135 session pooler pins verified IPv4 endpoint, project-suffixed roles and TLS identity',async()=>{
 reset();
 MockPool.tlsStream=mockVerifiedPoolerSocket();
 // The backend PostgreSQL hop may not report ssl=true through Supavisor;
 // this MUST NOT replace verification of client-side TLS at the pooler.
 MockPool.ssl=false;
 const flow=await createV135PrivateQaRuntime({
  ...opts(),transport:'session_pooler',dbHost:POOL_HOST
 });
 assert.ok(flow);
 assert.deepEqual(pools.map(p=>p.opts.host),[POOL_HOST,POOL_HOST,POOL_HOST]);
 assert.deepEqual(pools.map(p=>p.opts.user),ROLES.map(role=>role+'.'+PROJECT_REF));
 for(const p of pools){
  assert.equal(p.opts.ssl.servername,POOL_HOST);
  assert.equal(p.opts.ssl.rejectUnauthorized,true);
  assert.equal(p.opts.port,5432);
 }
 assert.equal(flow.readiness.transport,'session_pooler');
 assert.equal(flow.readiness.pinnedDbHost,POOL_HOST);
 assert.equal(flow.readiness.productionAuthorized,false);
 assert.equal((await flow.begin({factorId:FACTOR})).ok,true);
 assert.equal((await flow.confirm({proofReference:REF,code:'123456'})).ok,true);
 await flow.close();
 assert.ok(pools.every(p=>p.closed));
});
test('V135 session pooler denies wrong host or mode before allocating pools',async()=>{
 reset();
 for(const patch of [
  {transport:'session_pooler',dbHost:HOST},
  {transport:'session_pooler',dbHost:'evil.pooler.supabase.com'},
  {transport:'transaction_pooler',dbHost:POOL_HOST},
  {transport:'session_pooler',dbHost:POOL_HOST,dbPort:6543}
 ]){
  await assert.rejects(createV135PrivateQaRuntime({...opts(),...patch}),TypeError);
 }
 assert.equal(pools.length,0);
});
test('V135 session pooler rejects missing, unauthorized and hostname-mismatched client TLS',async()=>{
 for(const stream of [
  null,
  {...mockVerifiedPoolerSocket(),authorized:false},
  {...mockVerifiedPoolerSocket(),encrypted:false},
  mockVerifiedPoolerSocket('wrong.example.com')
 ]){
  reset();MockPool.tlsStream=stream;
  const result=await createV135PrivateQaRuntime({
   ...opts(),transport:'session_pooler',dbHost:POOL_HOST
  });
  assert.equal(result,null);
  assert.ok(pools.every(p=>p.closed));
  assert.equal(stored,null);
 }
});
test('V135 session pooler rejects backend role escalation despite verified TLS',async()=>{
 reset();
 MockPool.tlsStream=mockVerifiedPoolerSocket();
 MockPool.overrideUser='postgres';
 const result=await createV135PrivateQaRuntime({
  ...opts(),transport:'session_pooler',dbHost:POOL_HOST
 });
 assert.equal(result,null);
 assert.ok(pools.every(p=>p.closed));
});
