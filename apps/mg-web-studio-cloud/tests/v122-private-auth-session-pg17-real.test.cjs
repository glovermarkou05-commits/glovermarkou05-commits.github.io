'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
if(process.env.CI!=='true'||process.env.V122_DISPOSABLE_ONLY!=='1'||
 process.env.V122_HOST!=='127.0.0.1'||process.env.V122_DB!=='qa_ledger'||
 !/^\d{2,5}$/.test(process.env.V122_PORT||'')||
 process.env.V122_READER_PASSWORD!=='v122-synthetic-reader-fixture'||
 process.env.V122_ADMIN_PASSWORD!=='v122-synthetic-admin-fixture')
 throw Error('V122 must run only against controlled PG17 disposable fixture');
for(const envName of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
 'SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN','MG_AUTH_QA_URL']){
 if(process.env[envName])throw Error('Live Supabase environment is prohibited');
}
const {Client,Pool}=require('pg');
const {createV122PrivateAuthSessionRowReader,QUERY,READER}=
 require('../server/v122-private-auth-session-row-reader.cjs');
const config={host:'127.0.0.1',port:Number(process.env.V122_PORT),database:'qa_ledger',
 connectionTimeoutMillis:8000,query_timeout:9000,
 application_name:'v122_synthetic_auth_only'};
const admin=()=>new Client({...config,user:'postgres',password:process.env.V122_ADMIN_PASSWORD});
const readerPool=()=>new Pool({...config,user:READER,password:process.env.V122_READER_PASSWORD,max:5});
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const id=n=>'bbbbbbbb-bbbb-4bbb-8bbb-'+n.toString(16).padStart(12,'0');
const now=()=>Math.floor(Date.now()/1000);
async function adminSql(sql,args=[]){
 const c=admin();await c.connect();
 try{return await c.query(sql,args);}finally{await c.end();}
}
async function put(sessionId,owner=USER,expiry=null){
 return adminSql(
  'INSERT INTO auth.sessions (id,user_id,not_after,private_refresh_token) VALUES ($1,$2,$3,$4)',
  [sessionId,owner,expiry,'NOT_FOR_READER']);
}
async function withReader(fn,expireAt=now()+90){
 const pool=readerPool();
 const service=createV122PrivateAuthSessionRowReader({
  pool,nowSec:now,trustedTokenExpiresAtSec:expireAt
 });
 try{return await fn({service,pool});}finally{await pool.end();}
}
test('PG17 fixture uses primary database and dedicated non-admin session reader',async()=>{
 const a=await adminSql("SELECT current_database() AS name,current_setting('server_version') AS v");
 assert.equal(a.rows[0].name,'qa_ledger');
 assert.match(a.rows[0].v,/^17\./);
 const role=await adminSql("SELECT rolcanlogin,rolsuper,rolcreaterole,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=$1",[READER]);
 assert.deepEqual(role.rows[0],{
  rolcanlogin:true,rolsuper:false,rolcreaterole:false,rolbypassrls:false,rolinherit:false
 });
});
test('synthetic auth schema table has no public role USAGE and private columns denied',async()=>{
 for(const role of ['anon','authenticated','service_role']){
  const a=await adminSql('SELECT has_schema_privilege($1,$2,$3) AS has_access',[role,'auth','USAGE']);
  assert.equal(a.rows[0].has_access,false,role);
 }
 const pool=readerPool(),c=await pool.connect();
 try{
  await assert.rejects(c.query('SELECT * FROM auth.sessions'),e=>e.code==='42501');
  await assert.rejects(c.query('SELECT private_refresh_token FROM auth.sessions'),e=>e.code==='42501');
  await assert.rejects(c.query('UPDATE auth.sessions SET user_id=user_id'),e=>e.code==='42501');
  await assert.rejects(c.query('DELETE FROM auth.sessions'),e=>e.code==='42501');
 }finally{c.release(true);await pool.end();}
});
test('real PG17 parameterized session lookup reads only three allowed columns',async()=>{
 const sid=id(101);
 await put(sid);
 await withReader(async({service,pool})=>{
  const r=await service.readPrimarySession({subject:USER,sessionId:sid});
  assert.equal(r.active,true);
  assert.equal(r.primaryRead,true);
  assert.equal(r.revocationChecked,true);
  assert.equal(r.subject,USER);
  assert.equal(r.sessionId,sid);
  assert.equal(r.expiresAtSec>now(),true);
  assert.equal(pool.idleCount,0);
  assert.equal(service.readiness.realSupabaseCredentials,false);
  assert.equal(service.readiness.revocationLinearizable,false);
 });
});
test('logout deletion makes the next actual PG17 row lookup deny',async()=>{
 const sid=id(102);
 await put(sid);
 await withReader(async({service})=>{
  assert.equal((await service.readPrimarySession({subject:USER,sessionId:sid})).active,true);
  await adminSql('DELETE FROM auth.sessions WHERE id=$1',[sid]);
  assert.equal(await service.readPrimarySession({subject:USER,sessionId:sid}),null);
 });
});
test('another user cannot use an otherwise existing session row',async()=>{
 const sid=id(103);
 await put(sid,OTHER);
 await withReader(async({service})=>{
  assert.equal(await service.readPrimarySession({subject:USER,sessionId:sid}),null);
 });
});
test('nonexistent session denies even with a trusted JWT expiration',async()=>{
 await withReader(async({service})=>{
  assert.equal(await service.readPrimarySession({subject:USER,sessionId:id(404)}),null);
 });
});
test('not_after expired rejects row even when trusted JWT remains valid',async()=>{
 const sid=id(104);
 await put(sid,USER,new Date((now()-10)*1000));
 await withReader(async({service})=>{
  assert.equal(await service.readPrimarySession({subject:USER,sessionId:sid}),null);
 });
});
test('not_after future caps response to earlier deadline',async()=>{
 const sid=id(105),end=now()+40;
 await put(sid,USER,new Date(end*1000));
 await withReader(async({service})=>{
  const result=await service.readPrimarySession({subject:USER,sessionId:sid});
  assert.equal(result.expiresAtSec,end);
 });
});
test('verified JWT expiration cannot be extended by future DB not_after',async()=>{
 const sid=id(106),jwtExpires=now()+24;
 await put(sid,USER,new Date((now()+300)*1000));
 await withReader(async({service})=>{
  const result=await service.readPrimarySession({subject:USER,sessionId:sid});
  assert.equal(result.expiresAtSec,jwtExpires);
 },jwtExpires);
});
test('session row can remain while JWT has expired; reader denies without fetching',async()=>{
 const sid=id(107);
 await put(sid,USER,null);
 await withReader(async({service,pool})=>{
  assert.equal(await service.readPrimarySession({subject:USER,sessionId:sid}),null);
  assert.equal(pool.totalCount,0);
 },now()-1);
});
test('synthetic reader cannot assume postgres or service_role',async()=>{
 const pool=readerPool(),c=await pool.connect();
 try{
  for(const role of ['postgres','service_role','authenticated','anon']){
   await assert.rejects(c.query('SET ROLE '+role),e=>e.code==='42501');
  }
 }finally{c.release(true);await pool.end();}
});
test('fixed query is parameterized, private and has no token or metadata columns',()=>{
 assert.equal(QUERY,'SELECT id, user_id, not_after FROM auth.sessions WHERE id=$1::uuid AND user_id=$2::uuid LIMIT 2');
 assert.equal(/refresh_token|user_agent|\bip\b|raw_user_meta_data/.test(QUERY),false);
});
