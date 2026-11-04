'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {Pool,Client}=require('pg');
const {createInsertOnlyPgAdapterV115}=require('../server/v115-insert-only-pg-adapter.cjs');
const {createV118ScopedLabWriterPool,LOGIN,WRITER}=require('../qa/v118-scoped-writer-pool.cjs');
if(process.env.CI!=='true'||process.env.V118_DISPOSABLE_ONLY!=='1'||
 process.env.V118_PG_HOST!=='127.0.0.1'||
 process.env.V118_PG_DB!=='qa_ledger'||
 !/^\d{2,5}$/.test(process.env.V118_PG_PORT||'')||
 process.env.V118_PG_PASSWORD!=='v118-backend-public-fixture-not-secret'||
 process.env.V118_PG_ADMIN_PASSWORD!=='v118-disposable-admin-public-fixture')
 throw Error('V118 may only run against explicitly identified PG17 CI fixture');
for(const name of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
 'SUPABASE_ACCESS_TOKEN','MG_AUTH_QA_URL','SUPABASE_DB_URL'])
 if(process.env[name])throw Error('Unexpected external database credential setting '+name);
const common={
 host:'127.0.0.1',port:Number(process.env.V118_PG_PORT),database:'qa_ledger',
 connectionTimeoutMillis:7000,query_timeout:8000,
 application_name:'v118_disposable_ci_only'
};
const settings=(user,password,max=18)=>({...common,user,password,max});
const backend=()=>new Pool(settings(LOGIN,process.env.V118_PG_PASSWORD));
const admin=()=>new Client(settings('postgres',process.env.V118_PG_ADMIN_PASSWORD));
const digest=s=>createHash('sha256').update('v118-fixture:'+s).digest('hex');
const makeRequest=name=>{
 const now=Math.floor(Date.now()/1000);
 return {eventKey:digest(name),consumeUntilSec:now+300,action:'publish',
 organizationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 siteId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',signal:undefined};
};
const denied={committed:false,inserted:false,shared:false,storedUntilSec:0};
async function inspect(sql,values=[]){
 const c=admin();await c.connect();
 try{return await c.query(sql,values);}finally{await c.end();}
}
async function total(hash){
 const x=await inspect('SELECT count(*)::int AS n FROM mg_auth_ledger.mfa_redemptions WHERE event_key=$1',[hash]);
 return x.rows[0].n;
}
async function withAdapter(fn){
 const raw=backend(),scoped=createV118ScopedLabWriterPool(raw);
 const adapter=createInsertOnlyPgAdapterV115({pool:scoped,nowSec:()=>Math.floor(Date.now()/1000)});
 try{return await fn({adapter,raw,scoped});}
 finally{await raw.end();}
}
test('V118 only disposable PostgreSQL 17, no Supabase credentials or application DB',async()=>{
 const r=await inspect('SELECT current_database() AS db, current_setting($1) AS version',['server_version']);
 assert.equal(r.rows[0].db,'qa_ledger');
 assert.match(r.rows[0].version,/^17\./);
});
test('actual login is non-admin, NOINHERIT and no BYPASSRLS; writer is NOLOGIN',async()=>{
 const r=await inspect("SELECT rolname,rolcanlogin,rolsuper,rolcreaterole,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=ANY($1)",[[LOGIN,WRITER]]);
 assert.equal(r.rows.length,2);
 const a=r.rows.find(x=>x.rolname===LOGIN),b=r.rows.find(x=>x.rolname===WRITER);
 assert.deepEqual([a.rolcanlogin,a.rolsuper,a.rolcreaterole,a.rolbypassrls,a.rolinherit],
  [true,false,false,false,false]);
 assert.equal(b.rolcanlogin,false);
 assert.equal(b.rolbypassrls,false);
});
test('membership is explicit SET TRUE, INHERIT FALSE and ADMIN FALSE',async()=>{
 const sql="SELECT m.inherit_option,m.set_option,m.admin_option "+
 "FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid "+
 "JOIN pg_roles u ON u.oid=m.member WHERE r.rolname=$1 AND u.rolname=$2";
 const r=await inspect(sql,[WRITER,LOGIN]);
 assert.equal(r.rows.length,1);
 assert.deepEqual(r.rows[0],{inherit_option:false,set_option:true,admin_option:false});
 for(const role of ['anon','authenticated','service_role','postgres']){
  const x=await inspect('SELECT pg_has_role($1,$2,$3) AS has_role',[LOGIN,role,'MEMBER']);
  assert.equal(x.rows[0].has_role,false,role);
 }
});
test('direct backend login cannot inherit writer INSERT or SELECT privileges',async()=>{
 const raw=backend();
 try{
  const c=await raw.connect();
  try{
   const who=await c.query('SELECT session_user,current_user');
   assert.deepEqual(who.rows[0],{session_user:LOGIN,current_user:LOGIN});
   await assert.rejects(c.query('SELECT count(*) FROM mg_auth_ledger.mfa_redemptions'),e=>e.code==='42501');
   const req=makeRequest('not-inherited');
   await assert.rejects(c.query(
    "INSERT INTO mg_auth_ledger.mfa_redemptions(event_key,verified_at,retain_until) VALUES ($1,now()-interval '10 seconds',now()+interval '310 seconds')",
    [req.eventKey]),e=>e.code==='42501');
  }finally{c.release(true);}
 }finally{await raw.end();}
});
test('login cannot SET ROLE to postgres, anon, authenticated or service_role',async()=>{
 const raw=backend();
 try{
  const c=await raw.connect();
  try{
   for(const role of ['postgres','anon','authenticated','service_role'])
    await assert.rejects(c.query('SET ROLE '+role),e=>e.code==='42501',role);
  }finally{c.release(true);}
 }finally{await raw.end();}
});
test('V118 scoped checkout uses nonadmin backend and evicts session after a commit',async()=>{
 await withAdapter(async({adapter,scoped,raw})=>{
  const req=makeRequest('scoped-once');
  const result=await adapter.consumeEventAtomically(req);
  assert.equal(result.committed,true);
  assert.equal(result.inserted,true);
  assert.equal(result.shared,true);
  assert.equal(result.storedUntilSec,req.consumeUntilSec);
  assert.equal(await total(req.eventKey),1);
  assert.deepEqual(scoped.snapshot(),{checkedOut:1,disposed:1,rejected:0});
  assert.equal(raw.idleCount,0);
  assert.equal(scoped.readiness.productionAuthorized,false);
 });
});
test('second operation uses a new physical login; no session role can leak',async()=>{
 await withAdapter(async({adapter,scoped,raw})=>{
  const one=makeRequest('sequential-a'),two=makeRequest('sequential-b');
  assert.equal((await adapter.consumeEventAtomically(one)).inserted,true);
  assert.equal((await adapter.consumeEventAtomically(two)).inserted,true);
  assert.equal(await total(one.eventKey),1);
  assert.equal(await total(two.eventKey),1);
  assert.deepEqual(scoped.snapshot(),{checkedOut:2,disposed:2,rejected:0});
  assert.equal(raw.idleCount,0);
 });
});
test('real primary-key duplicate denied under non-admin writer login',async()=>{
 await withAdapter(async({adapter,scoped})=>{
  const req=makeRequest('duplicate');
  assert.equal((await adapter.consumeEventAtomically(req)).inserted,true);
  assert.deepEqual(await adapter.consumeEventAtomically(req),denied);
  assert.equal(await total(req.eventKey),1);
  assert.deepEqual(scoped.snapshot(),{checkedOut:2,disposed:2,rejected:0});
 });
});
test('two concurrent non-admin authenticated sessions: one confirmed, one denied',async()=>{
 await withAdapter(async({adapter,scoped})=>{
  const req=makeRequest('concurrent-two');
  const results=await Promise.all([adapter.consumeEventAtomically(req),adapter.consumeEventAtomically(req)]);
  assert.equal(results.filter(x=>x.committed&&x.inserted).length,1);
  assert.equal(results.filter(x=>!x.committed&&!x.inserted).length,1);
  assert.equal(await total(req.eventKey),1);
  assert.equal(scoped.snapshot().disposed,2);
 });
});
test('sixteen non-admin physical connections: one commit and fifteen denied',async()=>{
 await withAdapter(async({adapter,scoped,raw})=>{
  const req=makeRequest('concurrent-sixteen');
  const results=await Promise.all(Array.from({length:16},()=>adapter.consumeEventAtomically(req)));
  assert.equal(results.filter(x=>x.committed&&x.inserted).length,1);
  assert.equal(results.filter(x=>!x.committed&&!x.inserted).length,15);
  assert.equal(await total(req.eventKey),1);
  assert.equal(scoped.snapshot().checkedOut,16);
  assert.equal(scoped.snapshot().disposed,16);
  assert.equal(raw.idleCount,0);
 });
});
test('unapproved login without writer membership is denied before V115 can begin',async()=>{
 const raw=new Pool(settings('mg_v118_ci_untrusted','v118-denied-public-fixture'));
 const scoped=createV118ScopedLabWriterPool(raw);
 const adapter=createInsertOnlyPgAdapterV115({pool:scoped});
 try{
  assert.deepEqual(await adapter.consumeEventAtomically(makeRequest('untrusted')),denied);
  assert.equal(scoped.snapshot().rejected,1);
  assert.equal(scoped.snapshot().checkedOut,0);
  assert.equal(scoped.snapshot().disposed,1);
 }finally{await raw.end();}
});
test('forged SET ROLE response cannot trick the active-current_user guard',async()=>{
 const raw=backend();
 const fake={async connect(){
  const c=await raw.connect();
  return {query(sql,args){
   if(sql==='SET ROLE mg_auth_ledger_writer')return Promise.resolve({command:'SET'});
   return c.query(sql,args);
  },release(error){c.release(error||true);}};
 }};
 const scoped=createV118ScopedLabWriterPool(fake);
 try{
  assert.deepEqual(await createInsertOnlyPgAdapterV115({pool:scoped}).consumeEventAtomically(makeRequest('fake-role')),denied);
  assert.equal(scoped.snapshot().rejected,1);
 }finally{await raw.end();}
});
test('writer role cannot SELECT, UPDATE or DELETE private ledger',async()=>{
 const raw=backend(),scoped=createV118ScopedLabWriterPool(raw);
 try{
  for(const sql of ['SELECT count(*) FROM mg_auth_ledger.mfa_redemptions',
    'UPDATE mg_auth_ledger.mfa_redemptions SET event_key=event_key',
    'DELETE FROM mg_auth_ledger.mfa_redemptions']){
   const c=await scoped.connect();
   try{await assert.rejects(c.query(sql),e=>e.code==='42501');}
   finally{c.release();}
  }
  assert.equal(scoped.snapshot().disposed,3);
 }finally{await raw.end();}
});
test('invalid V115 request does not check out lab writer',async()=>{
 await withAdapter(async({adapter,scoped})=>{
  const req={...makeRequest('bad-input'),eventKey:'NOT-A-HMAC'};
  assert.deepEqual(await adapter.consumeEventAtomically(req),denied);
  assert.deepEqual(scoped.snapshot(),{checkedOut:0,disposed:0,rejected:0});
 });
});
test('V118 lab wrapper does not import pg, secrets, remote APIs or grant production GO',()=>{
 const source=readFileSync(resolve(__dirname,'../qa/v118-scoped-writer-pool.cjs'),'utf8');
 for(const forbidden of ["require('pg')",'process.env','fetch(','CREATE ROLE',
  'GRANT ','SECURITY DEFINER','ALTER ROLE','DROP ROLE'])
  assert.equal(source.includes(forbidden),false,forbidden);
 const scoped=createV118ScopedLabWriterPool({connect:async()=>{throw Error('offline')}});
 assert.deepEqual(scoped.readiness,{
  labOnly:true,sessionReuseAllowed:false,backendRoleProductionApproved:false,
  authSessionRevocationVerified:false,businessTransactionIntegrated:false,
  productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 });
});
