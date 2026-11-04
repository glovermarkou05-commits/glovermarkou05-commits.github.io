'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
if(process.env.CI!=='true'||process.env.V133_DISPOSABLE_ONLY!=='1'||
 process.env.V133_HOST!=='127.0.0.1'||process.env.V133_DB!=='qa_ledger'||
 !/^[0-9]{2,5}$/.test(process.env.V133_PORT||'')||
 process.env.V133_ADMIN_PASSWORD!=='synthetic-v133-admin'||
 process.env.V133_JOURNAL_PASSWORD!=='synthetic-v133-journal'||
 process.env.V133_ISSUER_PASSWORD!=='synthetic-v133-issuer'||
 process.env.V133_READER_PASSWORD!=='synthetic-v133-reader')
 throw Error('V133 must run in disposable isolated PG17 CI fixture');
for(const e of ['DATABASE_URL','SUPABASE_URL','SUPABASE_DB_URL',
 'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN','MG_AUTH_QA_URL'])
 if(process.env[e])throw Error('Live QA/production variable prohibited: '+e);
const {Pool}=require('pg');
const {createV133PrivateQaMfaPipeline}=
 require('../server/v133-private-qa-mfa-pipeline.cjs');
const {QA_ISSUER}=require('../server/v132-auth-server-session-gate.cjs');
const N=2000000000;
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FACT='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CH='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REF='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const cfg={host:'127.0.0.1',port:Number(process.env.V133_PORT),
 database:'qa_ledger',connectionTimeoutMillis:7000,query_timeout:8000,
 application_name:'v133_disposable_lab'};
const pg=(user,password)=>new Pool({...cfg,user,password,max:8});
const admin=pg('postgres',process.env.V133_ADMIN_PASSWORD);
const journal=pg('mg_qa_mfa_challenge_journal',process.env.V133_JOURNAL_PASSWORD);
const issuer=pg('mg_qa_mfa_receipt_issuer',process.env.V133_ISSUER_PASSWORD);
const reader=pg('mg_qa_mfa_receipt_reader',process.env.V133_READER_PASSWORD);
const claims=token=>({iss:QA_ISSUER,aud:'authenticated',
 sub:USER,session_id:SID,aal:token==='signed-aal2-fixture'?'aal2':'aal1',
 exp:N+120,iat:N-30});
let revoked=false;
let verifyCalls=0;
const auth={
 async getClaims(token){return {data:{claims:claims(token)},error:null};},
 async getUser(){
  if(revoked)return {data:{user:null},error:{message:'revoked'}};
  return {data:{user:{id:USER}},error:null};
 },
 mfa:{
  async listFactors(){return {data:{totp:[{id:FACT,status:'verified'}],phone:[]},error:null};},
  async challenge(){return {data:{id:CH},error:null};},
  async verify(){verifyCalls++;return {data:{access_token:'signed-aal2-fixture'},error:null};}
 }
};
const config=()=>({
 auth,accessToken:'signed-aal1-fixture',
 journalPool:journal,receiptIssuerPool:issuer,receiptReaderPool:reader,
 receiptKey:Buffer.alloc(32,83),nowSec:()=>N,newReference:()=>REF
});
const sql=(s,a=[])=>admin.query(s,a);
test('Actual PG17: distinct QA roles, no BYPASSRLS/superuser and FORCE RLS',async()=>{
 const roles=await sql("SELECT rolname,rolsuper,rolbypassrls,rolcanlogin FROM pg_roles WHERE rolname LIKE 'mg_qa_mfa_%' ORDER BY rolname");
 assert.equal(roles.rows.length,3);
 assert.ok(roles.rows.every(r=>!r.rolsuper&&!r.rolbypassrls&&r.rolcanlogin));
 const tables=await sql("SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname LIKE 'mg_qa_mfa_%' AND c.relkind='r'");
 assert.equal(tables.rows.length,2);
 assert.ok(tables.rows.every(r=>r.relrowsecurity&&r.relforcerowsecurity));
 const denial=await sql("SELECT has_schema_privilege('anon','mg_qa_mfa_receipts','USAGE') a, has_schema_privilege('authenticated','mg_qa_mfa_challenges','USAGE') b, has_schema_privilege('service_role','mg_qa_mfa_receipts','USAGE') c, has_schema_privilege('mg_qa_mfa_receipt_reader','mg_qa_mfa_challenges','USAGE') d, has_table_privilege('mg_qa_mfa_receipt_reader','mg_qa_mfa_receipts.verified_mfa_events','INSERT') e, has_column_privilege('mg_qa_mfa_challenge_journal','mg_qa_mfa_challenges.challenge_journal','subject','UPDATE') f");
 assert.deepEqual(denial.rows[0],{a:false,b:false,c:false,d:false,e:false,f:false});
});
test('Actual PG17: complete V133 MFA flow writes one journal and one verified receipt, no Auth table',async()=>{
 const flow=await createV133PrivateQaMfaPipeline(config());
 assert.equal((await flow.begin({factorId:FACT})).ok,true);
 assert.equal((await flow.confirm({code:'123456',proofReference:REF})).ok,true);
 const event=await flow.readTrustedVerifiedEvent({proofReference:REF,subject:USER,sessionId:SID});
 assert.equal(event.verified,true);
 assert.equal(event.method,'totp');
 assert.equal(event.proofReference,REF);
 assert.equal(verifyCalls,1);
 const rows=await sql("SELECT (SELECT count(*)::int FROM mg_qa_mfa_challenges.challenge_journal) j,(SELECT count(*)::int FROM mg_qa_mfa_receipts.verified_mfa_events) r, to_regclass('auth.sessions') AS auth_sessions");
 assert.deepEqual(rows.rows[0],{j:1,r:1,auth_sessions:null});
 assert.equal((await flow.confirm({code:'123456',proofReference:REF})).ok,false);
 assert.equal(verifyCalls,1);
});
test('Actual PG17: revoked Auth denies MFA before another DB write',async()=>{
 revoked=true;
 const flow=await createV133PrivateQaMfaPipeline(config());
 assert.equal(flow,null);
 const q=await sql("SELECT count(*)::int AS n FROM mg_qa_mfa_receipts.verified_mfa_events");
 assert.equal(q.rows[0].n,1);
});
test('Guarded rollback refuses data-bearing MFA receipts and journal',async()=>{
 await assert.rejects(sql("DO $$ BEGIN IF EXISTS(SELECT 1 FROM mg_qa_mfa_challenges.challenge_journal) OR EXISTS(SELECT 1 FROM mg_qa_mfa_receipts.verified_mfa_events) THEN RAISE EXCEPTION 'NONEMPTY: preserve evidence'; END IF; END $$"),/NONEMPTY/);
});
test.after(async()=>{
 await Promise.allSettled([admin.end(),journal.end(),issuer.end(),reader.end()]);
});
