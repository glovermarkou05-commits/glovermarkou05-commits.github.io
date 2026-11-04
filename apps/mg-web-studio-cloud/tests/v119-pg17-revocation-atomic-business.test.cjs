'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
if(process.env.CI!=='true'||process.env.V119_DISPOSABLE_ONLY!=='1'||
   process.env.V119_PG_HOST!=='127.0.0.1'||process.env.V119_PG_DB!=='qa_ledger'||
   !/^\d{2,5}$/.test(process.env.V119_PG_PORT||'')||
   process.env.V119_PG_BACKEND_PASSWORD!=='v119-public-backend-fixture'||
   process.env.V119_PG_ADMIN_PASSWORD!=='v119-public-admin-fixture')
 throw Error('V119 requires controlled disposable CI PostgreSQL');
for(const name of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_DB_URL',
 'MG_AUTH_QA_URL','SUPABASE_ACCESS_TOKEN'])if(process.env[name])
 throw Error('Live service configuration prohibited: '+name);
const {Pool,Client}=require('pg');
const {createV118ScopedLabWriterPool}=require('../qa/v118-scoped-writer-pool.cjs');
const {createV119AtomicBusinessLab}=require('../qa/v119-atomic-business-lab.cjs');
const cfg={host:'127.0.0.1',port:Number(process.env.V119_PG_PORT),database:'qa_ledger',
 connectionTimeoutMillis:8000,query_timeout:9000,application_name:'v119_ci_synthetic_only'};
const admin=()=>new Client({...cfg,user:'postgres',password:process.env.V119_PG_ADMIN_PASSWORD});
const backend=()=>new Pool({...cfg,user:'mg_v118_ci_backend',password:process.env.V119_PG_BACKEND_PASSWORD,max:18});
const digest=n=>createHash('sha256').update('mg-v119-ci-fixture:'+n).digest('hex');
const sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',session='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const org='cccccccc-cccc-4ccc-8ccc-cccccccccccc',site='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const req=name=>({action:'publish',eventKey:digest(name),organizationId:org,sessionId:session,
 siteId:site,subject:sub,verifiedAtSec:Math.floor(Date.now()/1000)-10});
const denied={ok:false,atomicCommitConfirmed:false,productionAuthorized:false,formalV67Pass:0};
async function adminQuery(sql,args=[]){
 const client=admin();await client.connect();
 try{return await client.query(sql,args);}finally{await client.end();}
}
async function counts(key){
 const l=await adminQuery('SELECT count(*)::int AS n FROM mg_auth_ledger.mfa_redemptions WHERE event_key=$1',[key]);
 const b=await adminQuery('SELECT count(*)::int AS n FROM mg_v119_fictional.completed_operations WHERE event_key=$1',[key]);
 return {ledger:l.rows[0].n,business:b.rows[0].n};
}
async function fixture(testFn,{hooks={},sessionProvider,permissionProvider,wrapPool}={}){
 const raw=backend(),scoped=createV118ScopedLabWriterPool(raw);
 let isRevoked=false,reads=0;
 const readPrimarySession=async input=>{
  reads++;
  if(sessionProvider)return sessionProvider(input,{get reads(){return reads;},revoke(){isRevoked=true;}});
  const now=Math.floor(Date.now()/1000);
  return {active:!isRevoked,checkedAtSec:now,expiresAtSec:now+45,
   primaryRead:true,revocationChecked:true,sessionId:input.sessionId,subject:input.subject};
 };
 const authorizeResource=permissionProvider|| (async input=>input.action==='publish'&&input.organizationId===org&&input.siteId===site);
 const service=createV119AtomicBusinessLab({pool:wrapPool?wrapPool(scoped):scoped,readPrimarySession,
  authorizeResource,hooks});
 try{return await testFn({service,scoped,raw,revoke(){isRevoked=true;},reads:()=>reads});}
 finally{await raw.end();}
}
test('V119 uses a disposable PostgreSQL 17 instance and no Supabase project',async()=>{
 const r=await adminQuery('SELECT current_database() AS database,current_setting($1) AS version',['server_version']);
 assert.equal(r.rows[0].database,'qa_ledger');
 assert.match(r.rows[0].version,/^17\./);
});
test('fictional business table and private ledger have RLS and no public role access',async()=>{
 for(const t of ['mg_auth_ledger.mfa_redemptions','mg_v119_fictional.completed_operations']){
  const a=await adminQuery("SELECT relrowsecurity AS rls,relforcerowsecurity AS force FROM pg_class WHERE oid=$1::regclass",[t]);
  assert.deepEqual(a.rows[0],{rls:true,force:true});
  for(const role of ['anon','authenticated','service_role']){
   const s=t.split('.')[0];
   const g=await adminQuery('SELECT has_schema_privilege($1,$2,$3) AS access',[role,s,'USAGE']);
   assert.equal(g.rows[0].access,false);
  }
 }
});
test('valid synthetic checked session and tenant commits ledger and business TOGETHER',async()=>{
 await fixture(async({service,scoped})=>{
  const input=req('valid');
  assert.deepEqual(await service.execute(input),{
   ok:true,atomicCommitConfirmed:true,productionAuthorized:false,formalV67Pass:0
  });
  assert.deepEqual(await counts(input.eventKey),{ledger:1,business:1});
  assert.deepEqual(scoped.snapshot(),{checkedOut:1,disposed:1,rejected:0});
  assert.equal(service.readiness.realSupabaseSessionReader,false);
 });
});
test('duplicate MFA event cannot repeat the fictional enterprise operation',async()=>{
 await fixture(async({service})=>{
  const input=req('duplicate');
  assert.equal((await service.execute(input)).ok,true);
  assert.deepEqual(await service.execute(input),denied);
  assert.deepEqual(await counts(input.eventKey),{ledger:1,business:1});
 });
});
test('revoked or inactive synthetic session is denied without ledger writes',async()=>{
 await fixture(async({service,revoke,scoped})=>{
  revoke();const input=req('revoked');
  assert.deepEqual(await service.execute(input),denied);
  assert.deepEqual(await counts(input.eventKey),{ledger:0,business:0});
  assert.equal(scoped.snapshot().checkedOut,0);
 });
});
test('expired or mismatched session proof denies without business effect',async()=>{
 await fixture(async({service})=>{
  const input=req('expired');
  const invalid={...input,verifiedAtSec:Math.floor(Date.now()/1000)-500};
  assert.deepEqual(await service.execute(invalid),denied);
  assert.deepEqual(await counts(input.eventKey),{ledger:0,business:0});
 },{sessionProvider:async x=>({active:true,checkedAtSec:Math.floor(Date.now()/1000),expiresAtSec:1,
  primaryRead:true,revocationChecked:true,sessionId:x.sessionId,subject:x.subject})});
});
test('no resource permission must deny before opening a database transaction',async()=>{
 await fixture(async({service,scoped})=>{
  const input=req('no-resource');
  assert.deepEqual(await service.execute(input),denied);
  assert.equal(scoped.snapshot().checkedOut,0);
  assert.deepEqual(await counts(input.eventKey),{ledger:0,business:0});
 },{permissionProvider:async()=>false});
});
test('failing primary session provider always denies without using ledger',async()=>{
 await fixture(async({service,scoped})=>{
  const input=req('reader-down');
  assert.deepEqual(await service.execute(input),denied);
  assert.deepEqual(await counts(input.eventKey),{ledger:0,business:0});
  assert.equal(scoped.snapshot().checkedOut,0);
 },{sessionProvider:async()=>{throw Error('simulated primary session outage');}});
});
test('failure after ledger INSERT rolls back ledger and fictional business',async()=>{
 const input=req('error-after-ledger');
 await fixture(async({service})=>{
  assert.deepEqual(await service.execute(input),denied);
  assert.deepEqual(await counts(input.eventKey),{ledger:0,business:0});
 },{hooks:{afterLedger:async()=>{throw Error('fixture business preflight failure');}}});
 await fixture(async({service})=>{
  assert.equal((await service.execute(input)).ok,true);
  assert.deepEqual(await counts(input.eventKey),{ledger:1,business:1});
 });
});
test('business uniqueness conflict rolls back already inserted MFA event',async()=>{
 const input=req('business-conflict');
 await adminQuery('INSERT INTO mg_v119_fictional.completed_operations(event_key,operation) VALUES($1,$2)',
  [input.eventKey,'members']);
 await fixture(async({service})=>{
  assert.deepEqual(await service.execute(input),denied);
  assert.deepEqual(await counts(input.eventKey),{ledger:0,business:1});
 });
});
test('failure after business INSERT rolls back BOTH records',async()=>{
 const input=req('error-after-business');
 await fixture(async({service})=>{
  assert.deepEqual(await service.execute(input),denied);
  assert.deepEqual(await counts(input.eventKey),{ledger:0,business:0});
 },{hooks:{afterBusiness:async()=>{throw Error('simulated process crash before commit');}}});
});
test('revocation between simulated session checks triggers transaction rollback',async()=>{
 let revoke=()=>{};
 const input=req('revoked-in-flight');
 await fixture(async({service,reads,scoped,revoke:r})=>{
  revoke=r;
  assert.deepEqual(await service.execute(input),denied);
  assert.ok(reads()>=3);
  assert.deepEqual(await counts(input.eventKey),{ledger:0,business:0});
  assert.equal(scoped.snapshot().disposed,1);
 },{hooks:{afterBusiness:async()=>revoke()}});
});
test('two independent backend PG transactions: only one commits both records',async()=>{
 await fixture(async({service})=>{
  const input=req('race-two');
  const results=await Promise.all([service.execute(input),service.execute(input)]);
  assert.equal(results.filter(r=>r.ok).length,1);
  assert.equal(results.filter(r=>!r.ok).length,1);
  assert.deepEqual(await counts(input.eventKey),{ledger:1,business:1});
 });
});
test('sixteen simultaneous backend PG transactions produce exactly one business effect',async()=>{
 await fixture(async({service,scoped})=>{
  const input=req('race-sixteen');
  const results=await Promise.all(Array.from({length:16},()=>service.execute(input)));
  assert.equal(results.filter(r=>r.ok).length,1);
  assert.equal(results.filter(r=>!r.ok).length,15);
  assert.deepEqual(await counts(input.eventKey),{ledger:1,business:1});
  assert.equal(scoped.snapshot().disposed,16);
 });
});
test('acknowledgement lost AFTER a real COMMIT denies but never replays the business action',async()=>{
 const input=req('uncertain-commit');
 let issued=0,scopedState;
 await fixture(async({service,scoped})=>{
  scopedState=scoped;
  assert.deepEqual(await service.execute(input),denied);
  assert.equal(issued,1);
  assert.deepEqual(await counts(input.eventKey),{ledger:1,business:1});
  assert.deepEqual(await service.execute(input),denied);
  assert.deepEqual(await counts(input.eventKey),{ledger:1,business:1});
  assert.equal(scoped.snapshot().disposed,2);
 },{wrapPool:scoped=>({async connect(){
  const client=await scoped.connect();
  return {query:async(sql,args)=>{
   if(sql==='COMMIT'&&issued===0){issued++;await client.query(sql,args);throw Error('synthetic acknowledgement lost');}
   return client.query(sql,args);
  },release:e=>client.release(e)};
 }})});
});
test('malformed synthetic input and spoofed role/JWT never become authorization',async()=>{
 await fixture(async({service,scoped})=>{
  const input=req('input-spoof');
  for(const value of [
   {...input,jwt:'fake'},{...input,eventKey:'bad'},
   {...input,action:'admin'},{...input,sessionId:'not-a-uuid'}
  ])assert.deepEqual(await service.execute(value),denied);
  assert.equal(scoped.snapshot().checkedOut,0);
 });
});
test('writer and public roles cannot read or update synthetic business rows',async()=>{
 const raw=backend(),scoped=createV118ScopedLabWriterPool(raw);
 try{
  const client=await scoped.connect();
  try{
   for(const sql of ['SELECT * FROM mg_v119_fictional.completed_operations',
    'UPDATE mg_v119_fictional.completed_operations SET operation=operation',
    'DELETE FROM mg_v119_fictional.completed_operations'])
    await assert.rejects(client.query(sql),e=>e.code==='42501');
  }finally{client.release(true);}
 }finally{await raw.end();}
});
test('V119 source is lab-only and never accesses live Auth or production',()=>{
 const source=readFileSync(resolve(__dirname,'../qa/v119-atomic-business-lab.cjs'),'utf8');
 for(const forbidden of ["require('pg')",'process.env','auth.sessions','SUPABASE_SERVICE_ROLE_KEY',
  'SECURITY DEFINER','CREATE TABLE','fetch(','UPDATE auth.'])assert.equal(source.includes(forbidden),false);
});
