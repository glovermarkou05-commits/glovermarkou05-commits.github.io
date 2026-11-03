'use strict';
// V111 integration: only disposable PG17 in GitHub Actions, never Supabase.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFileSync,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const asyncExec=promisify(execFile);
const cid=process.env.V111_PG_CONTAINER;
if(!cid||!/^[0-9a-f]{12,64}$/.test(cid))throw Error('PG17 isolated container required');
const args=q=>['exec','-i',cid,'psql','-X','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','qa_ledger','-c',q];
const pg=q=>execFileSync('docker',args(q),{encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
const pgAsync=async q=>(await asyncExec('docker',args(q),{encoding:'utf8',timeout:30000,maxBuffer:1048576})).stdout.trim();
const digest=n=>createHash('sha256').update('mg-v111-fixture:'+n).digest('hex');
const writer=q=>'SET ROLE mg_auth_ledger_writer; '+q;
const insert=hash=>`WITH t AS (SELECT transaction_timestamp() AS n)
 INSERT INTO mg_auth_ledger.mfa_redemptions(event_key,verified_at,retain_until)
 SELECT '${hash}',n-interval '10 seconds',n+interval '305 seconds' FROM t;`;
const count=hash=>pg(`SELECT count(*) FROM mg_auth_ledger.mfa_redemptions WHERE event_key='${hash}'`);
test('PG17 isolated with no real connection settings',()=>{
 assert.match(pg('SHOW server_version'),/^17\./);
 for(const x of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','MG_AUTH_QA_URL'])
  assert.equal(process.env[x],undefined);
});
test('writer role is non-login, nonsuperuser and cannot bypass RLS',()=>{
 assert.equal(pg(`SELECT rolcanlogin::text||','||rolsuper::text||','||rolbypassrls::text
 FROM pg_roles WHERE rolname='mg_auth_ledger_writer'`),'false,false,false');
});
test('writer gets schema USAGE and column INSERT only; no read/update/delete',()=>{
 assert.equal(pg(`SELECT has_schema_privilege('mg_auth_ledger_writer','mg_auth_ledger','USAGE')`),'t');
 for(const c of ['event_key','verified_at','retain_until']){
  assert.equal(pg(`SELECT has_column_privilege('mg_auth_ledger_writer','mg_auth_ledger.mfa_redemptions','${c}','INSERT')`),'t');
 }
 for(const op of ['SELECT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
  assert.equal(pg(`SELECT has_table_privilege('mg_auth_ledger_writer','mg_auth_ledger.mfa_redemptions','${op}')`),'f',op);
 }
});
test('anon, authenticated and service_role have no schema privileges or writer membership',()=>{
 for(const r of ['anon','authenticated','service_role']){
  assert.equal(pg(`SELECT has_schema_privilege('${r}','mg_auth_ledger','USAGE')`),'f');
  assert.equal(pg(`SELECT pg_has_role('${r}','mg_auth_ledger_writer','MEMBER')`),'f');
 }
});
test('RLS remains forced with only an INSERT policy',()=>{
 assert.equal(pg(`SELECT relrowsecurity::text||','||relforcerowsecurity::text FROM pg_class
 WHERE oid='mg_auth_ledger.mfa_redemptions'::regclass`),'true,true');
 assert.equal(pg(`SELECT cmd||','||roles::text FROM pg_policies
 WHERE schemaname='mg_auth_ledger' AND tablename='mfa_redemptions'`),'INSERT,{mg_auth_ledger_writer}');
});
test('a single plain INSERT commits once; a duplicate is rejected by UNIQUE',()=>{
 const key=digest('single');
 assert.match(pg(writer(insert(key))),/INSERT 0 1/);
 assert.throws(()=>pg(writer(insert(key))));
 assert.equal(count(key),'1');
});
test('two independent restricted connections race: exactly one commit',async()=>{
 const key=digest('two');
 const r=await Promise.allSettled([pgAsync(writer(insert(key))),pgAsync(writer(insert(key)))]);
 assert.equal(r.filter(x=>x.status==='fulfilled'&&x.value.includes('INSERT 0 1')).length,1);
 assert.equal(r.filter(x=>x.status==='rejected').length,1);
 assert.equal(count(key),'1');
});
test('sixteen independent restricted connections: one succeeds, fifteen denied',async()=>{
 const key=digest('sixteen');
 const r=await Promise.allSettled(Array.from({length:16},()=>pgAsync(writer(insert(key)))));
 assert.equal(r.filter(x=>x.status==='fulfilled'&&x.value.includes('INSERT 0 1')).length,1);
 assert.equal(r.filter(x=>x.status==='rejected').length,15);
 assert.equal(count(key),'1');
});
test('rollback does not consume the event',()=>{
 const key=digest('rollback');
 assert.match(pg('BEGIN; SET LOCAL ROLE mg_auth_ledger_writer; '+insert(key)+' ROLLBACK;'),/ROLLBACK/);
 assert.equal(count(key),'0');
 assert.match(pg(writer(insert(key))),/INSERT 0 1/);
});
test('writer cannot SELECT, UPDATE, DELETE or TRUNCATE the ledger',()=>{
 for(const q of [
  'SELECT count(*) FROM mg_auth_ledger.mfa_redemptions;',
  'UPDATE mg_auth_ledger.mfa_redemptions SET event_key=event_key;',
  'DELETE FROM mg_auth_ledger.mfa_redemptions;',
  'TRUNCATE mg_auth_ledger.mfa_redemptions;'
 ])assert.throws(()=>pg(writer(q)));
});
test('INSERT ON CONFLICT RETURNING is denied without SELECT privilege',()=>{
 const key=digest('returning');
 const q="INSERT INTO mg_auth_ledger.mfa_redemptions(event_key,verified_at,retain_until) VALUES ('"+
  key+"',now()-interval '10 seconds',now()+interval '305 seconds') ON CONFLICT (event_key) DO NOTHING RETURNING event_key;";
 assert.throws(()=>pg(writer(q)));
 assert.equal(count(key),'0');
});
test('writer is still constrained by hash and stale-event CHECKs',()=>{
 assert.throws(()=>pg(writer(insert('X'.repeat(64)))));
 const key=digest('stale');
 const q=`INSERT INTO mg_auth_ledger.mfa_redemptions(event_key,verified_at,retain_until)
 VALUES('${key}',now()-interval '400 seconds',now()+interval '305 seconds');`;
 assert.throws(()=>pg(writer(q)));
 assert.equal(count(key),'0');
});
