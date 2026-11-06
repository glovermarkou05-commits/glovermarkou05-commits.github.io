'use strict';
// V112 tests are only for a disposable PG17 container, no Supabase SQL.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {execFileSync}=require('node:child_process');
const cid=process.env.V112_PG_CONTAINER;
if(!cid||!/^[0-9a-f]{12,64}$/.test(cid)) throw Error('Disposable CI PG17 required');
const args=sql=>['exec','-i',cid,'psql','-X','-A','-t','-v','ON_ERROR_STOP=1',
  '-U','postgres','-d','qa_ledger','-c',sql];
const pg=sql=>execFileSync('docker',args(sql),{
 encoding:'utf8',timeout:20000,stdio:['ignore','pipe','pipe']
}).trim();
const writer=q=>'SET ROLE mg_auth_ledger_writer; '+q;
const hash=x=>createHash('sha256').update('v112-fixture:'+x).digest('hex');
const insert=x=>`WITH n AS (SELECT transaction_timestamp() AS now_at)
 INSERT INTO mg_auth_ledger.mfa_redemptions(event_key,verified_at,retain_until)
 SELECT '${hash(x)}',now_at-interval '10 seconds',now_at+interval '305 seconds' FROM n;`;
const rollback=readFileSync(resolve(__dirname,'../proposals/v112-rollback-guarded-review-only.sql'),'utf8');
test('runner is disposable PostgreSQL 17 with no production credentials',()=>{
 assert.match(pg('SHOW server_version'),/^17\./);
 for(const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
 'MG_AUTH_QA_URL','MG_AUTH_QA_ADMIN_KEY'])assert.equal(process.env[key],undefined);
});
test('preflight confirms dedicated role, schema and exactly one protected table',()=>{
 assert.equal(pg("SELECT count(*) FROM pg_roles WHERE rolname='mg_auth_ledger_writer'"),'1');
 assert.equal(pg("SELECT count(*) FROM pg_tables WHERE schemaname='mg_auth_ledger'"),'1');
 assert.equal(pg("SELECT relrowsecurity::text||','||relforcerowsecurity::text FROM pg_class WHERE oid='mg_auth_ledger.mfa_redemptions'::regclass"),'true,true');
});
test('the public Supabase role stubs have no schema USAGE',()=>{
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(pg(`SELECT has_schema_privilege('${role}','mg_auth_ledger','USAGE')`),'f');
 }
});
test('rollback blocks if ledger contains any event, then preserves data',()=>{
 assert.match(pg(writer(insert('one'))),/INSERT 0 1/);
 assert.throws(()=>pg(rollback));
 assert.equal(pg("SELECT count(*) FROM mg_auth_ledger.mfa_redemptions"),'1');
 assert.equal(pg("SELECT count(*) FROM pg_roles WHERE rolname='mg_auth_ledger_writer'"),'1');
});
test('after removing test-only fixture, rogue table stops destructive rollback',()=>{
 pg("DELETE FROM mg_auth_ledger.mfa_redemptions WHERE event_key='"+hash('one')+"'");
 pg('CREATE TABLE mg_auth_ledger.unexpected_v112 (id integer)');
 assert.throws(()=>pg(rollback));
 assert.equal(pg("SELECT count(*) FROM pg_tables WHERE schemaname='mg_auth_ledger'"),'2');
 pg('DROP TABLE mg_auth_ledger.unexpected_v112');
});
test('unexpected routine stops rollback before dropping any object',()=>{
 pg("CREATE FUNCTION mg_auth_ledger.rogue_v112() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
 assert.throws(()=>pg(rollback));
 assert.equal(pg("SELECT count(*) FROM pg_proc WHERE pronamespace='mg_auth_ledger'::regnamespace"),'1');
 pg('DROP FUNCTION mg_auth_ledger.rogue_v112()');
});
test('writer role membership prevents destructive rollback',()=>{
 pg('GRANT mg_auth_ledger_writer TO anon');
 assert.throws(()=>pg(rollback));
 assert.equal(pg("SELECT count(*) FROM pg_roles WHERE rolname='mg_auth_ledger_writer'"),'1');
 pg('REVOKE mg_auth_ledger_writer FROM anon');
});
test('rollback only succeeds on verified empty, isolated private ledger',()=>{
 assert.equal(pg("SELECT count(*) FROM mg_auth_ledger.mfa_redemptions"),'0');
 const out=pg(rollback);
 assert.match(out,/COMMIT/);
 assert.equal(pg("SELECT count(*) FROM pg_namespace WHERE nspname='mg_auth_ledger'"),'0');
 assert.equal(pg("SELECT count(*) FROM pg_roles WHERE rolname='mg_auth_ledger_writer'"),'0');
});
test('disposable rollback does not drop pre-existing Supabase role stubs',()=>{
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(pg(`SELECT count(*) FROM pg_roles WHERE rolname='${role}'`),'1');
 }
});
test('rollback is fail-closed when already removed and cannot create objects',()=>{
 assert.throws(()=>pg(rollback));
 assert.equal(pg("SELECT count(*) FROM pg_namespace WHERE nspname='mg_auth_ledger'"),'0');
});
test('rollback proposal has no CASCADE, auth writes, secrets or external connections',()=>{
 const forbidden=['CASCADE','TRUNCATE auth.','DELETE FROM auth.','GRANT ALL',
 'CREATE USER','service_role_key','COPY FROM PROGRAM','pg_read_file('];
 for(const x of forbidden)assert.equal(rollback.includes(x),false,x);
});
