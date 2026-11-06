'use strict';
// V110: disposable PostgreSQL 17 integration test ONLY. Never accepts a
// Supabase project URL, DB URL, credentials or production connection string.
// All SQL runs via docker exec against an ephemeral GitHub service container.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {execFileSync,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const asyncExecFile=promisify(execFile);
const cid=process.env.V110_PG_CONTAINER;
if(!cid||!/^[0-9a-f]{12,64}$/.test(cid))
 throw new Error('Disposable local PG17 service container ID required');
const args=sql=>['exec','-i',cid,'psql','-X','-A','-t','-v',
  'ON_ERROR_STOP=1','-U','postgres','-d','qa_ledger','-c',sql];
const pg=sql=>execFileSync('docker',args(sql),
  {encoding:'utf8',timeout:15000,stdio:['ignore','pipe','pipe']}).trim();
const pgAsync=async sql=>(await asyncExecFile('docker',args(sql),
  {encoding:'utf8',timeout:30000,maxBuffer:1024*1024})).stdout.trim();
const key=x=>createHash('sha256').update('mg-v110-disposable-'+x).digest('hex');
function insertSql(value){
 return `WITH instant AS (SELECT transaction_timestamp() AS t),
 attempt AS (
   INSERT INTO mg_auth_ledger.mfa_redemptions
     (event_key,verified_at,retain_until)
   SELECT '${value}',t - interval '10 seconds',t + interval '300 seconds'
   FROM instant
   ON CONFLICT (event_key) DO NOTHING RETURNING event_key
 )
 SELECT count(*) FROM attempt;`;
}
test('PG17 service is PostgreSQL 17 and no Supabase endpoint is configured',()=>{
 assert.match(pg('SHOW server_version'),/^17\./);
 for(const n of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
  'MG_AUTH_QA_ADMIN_KEY','MG_AUTH_QA_URL','DATABASE_URL'])
  assert.equal(process.env[n],undefined,'unexpected real connection configuration');
});
test('private schema exists, with exactly one intended table',()=>{
 assert.equal(pg("SELECT count(*) FROM information_schema.tables WHERE table_schema='mg_auth_ledger'"),'1');
 assert.equal(pg("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mg_auth_ledger' AND c.relkind='r'"),'mfa_redemptions');
});
test('private schema cannot be used by anon, authenticated or service_role',()=>{
 for(const role of ['anon','authenticated','service_role']){
  assert.equal(pg(`SELECT has_schema_privilege('${role}','mg_auth_ledger','USAGE')`),'f',role);
  for(const perm of ['SELECT','INSERT','UPDATE','DELETE']){
   assert.equal(pg(`SELECT has_table_privilege('${role}','mg_auth_ledger.mfa_redemptions','${perm}')`),'f',role+' '+perm);
  }
 }
});
test('RLS enabled and forced with zero policies for private table',()=>{
 assert.equal(pg(`SELECT relrowsecurity::text || ',' || relforcerowsecurity::text
   FROM pg_class WHERE oid='mg_auth_ledger.mfa_redemptions'::regclass`),'true,true');
 assert.equal(pg(`SELECT count(*) FROM pg_policies
    WHERE schemaname='mg_auth_ledger' AND tablename='mfa_redemptions'`),'0');
});
test('a direct read as anon is denied even though table exists',()=>{
 assert.throws(()=>pg("SET ROLE anon; SELECT count(*) FROM mg_auth_ledger.mfa_redemptions"));
});
test('one signed HMAC fingerprint can be inserted only once across sequential connections',()=>{
 const k=key('seq');
 assert.equal(pg(insertSql(k)),'1');
 assert.equal(pg(insertSql(k)),'0');
 assert.equal(pg(`SELECT count(*) FROM mg_auth_ledger.mfa_redemptions WHERE event_key='${k}'`),'1');
});
test('two independent PG17 transactions racing on same fingerprint yield one winner',async()=>{
 const k=key('two');
 const results=await Promise.all([pgAsync(insertSql(k)),pgAsync(insertSql(k))]);
 assert.deepEqual(results.sort(),['0','1']);
 assert.equal(pg(`SELECT count(*) FROM mg_auth_ledger.mfa_redemptions WHERE event_key='${k}'`),'1');
});
test('sixteen independent connections cannot redeem the same proof twice',async()=>{
 const k=key('sixteen');
 const results=await Promise.all(Array.from({length:16},()=>pgAsync(insertSql(k))));
 assert.equal(results.filter(x=>x==='1').length,1);
 assert.equal(results.filter(x=>x==='0').length,15);
 assert.equal(pg(`SELECT count(*) FROM mg_auth_ledger.mfa_redemptions WHERE event_key='${k}'`),'1');
});
test('rollback never consumes an event; subsequent committed insert wins',()=>{
 const k=key('rolled-back');
 const statement=`BEGIN; WITH t AS (SELECT transaction_timestamp() AS n)
 INSERT INTO mg_auth_ledger.mfa_redemptions(event_key,verified_at,retain_until)
 SELECT '${k}',n - interval '10 seconds',n + interval '300 seconds' FROM t;
 ROLLBACK;`;
 const result=pg(statement);
 assert.match(result,/ROLLBACK/);
 assert.equal(pg(insertSql(k)),'1');
 assert.equal(pg(insertSql(k)),'0');
});
test('invalid HMAC hex key is rejected by PostgreSQL CHECK',()=>{
 const k='X'.repeat(64);
 assert.throws(()=>pg(insertSql(k)));
});
test('insufficient expiry / replay tombstone retention is rejected',()=>{
 const k=key('bad-ttl');
 const sql=`WITH instant AS (SELECT transaction_timestamp() AS t)
 INSERT INTO mg_auth_ledger.mfa_redemptions(event_key,verified_at,retain_until)
 SELECT '${k}',t - interval '10 seconds',t + interval '120 seconds' FROM instant;`;
 assert.throws(()=>pg(sql));
 assert.equal(pg(`SELECT count(*) FROM mg_auth_ledger.mfa_redemptions WHERE event_key='${k}'`),'0');
});
test('a stale MFA event cannot be newly consumed',()=>{
 const k=key('expired-proof');
 const sql=`WITH instant AS (SELECT transaction_timestamp() AS t)
 INSERT INTO mg_auth_ledger.mfa_redemptions(event_key,verified_at,retain_until)
 SELECT '${k}',t - interval '301 seconds',t + interval '10 seconds' FROM instant;`;
 assert.throws(()=>pg(sql));
});
test('no raw identity, OTP, JWT or factor fields exist in the table',()=>{
 const fields=pg(`SELECT string_agg(column_name,',' ORDER BY ordinal_position)
 FROM information_schema.columns
 WHERE table_schema='mg_auth_ledger' AND table_name='mfa_redemptions'`);
 assert.equal(fields,'event_key,verified_at,consumed_at,retain_until');
});
