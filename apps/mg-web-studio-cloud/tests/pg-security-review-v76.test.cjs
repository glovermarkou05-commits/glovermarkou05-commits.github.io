'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reviewPgSecuritySnapshotV76,createSyntheticPgSnapshotV76,TABLES,SESSION_COLUMNS}
  =require('../server/pg-security-review-v76.cjs');
const fixture=()=>structuredClone(createSyntheticPgSnapshotV76());
const check=(patch,code)=>{
 const s=fixture();patch(s);
 const r=reviewPgSecuritySnapshotV76(s);
 assert.equal(r.structuralChecksPassed,false);
 assert.equal(r.decision,'NO_GO');
 assert.ok(r.issueCodes.includes(code),JSON.stringify(r.issueCodes));
};
test('synthetic reference snapshot passes ONLY structural shape',()=>{
 const r=reviewPgSecuritySnapshotV76(fixture());
 assert.equal(r.structuralChecksPassed,true);
 assert.deepEqual(r.issueCodes,[]);
 assert.equal(r.decision,'NO_GO');
 assert.equal(r.realCatalogVerified,false);
 assert.equal(r.effectivePrivilegesProven,false);
 assert.equal(r.tenantIsolationProven,false);
 assert.equal(r.v67OperationalChecksPassed,0);
 assert.equal(r.v67OperationalChecksPending,32);
});
test('readiness and output are immutable without real database access',()=>{
 const s=createSyntheticPgSnapshotV76(),r=reviewPgSecuritySnapshotV76(s);
 assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.role)&&Object.isFrozen(s.authSessions));
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.issueCodes));
 assert.throws(()=>{r.decision='GO'},TypeError);
 assert.throws(()=>r.issueCodes.push('BYPASS'),TypeError);
});
test('missing, array, prototype inherited and incomplete snapshot denied',()=>{
 for(const value of [null,undefined,{},[],3,'secret',Object.create(fixture())]){
  const r=reviewPgSecuritySnapshotV76(value);
  assert.equal(r.structuralChecksPassed,false);
  assert.ok(r.issueCodes.includes('INCOMPLETE_OR_UNTRUSTED_SNAPSHOT'));
 }
});
test('unexpected top-level evidence is not accepted',()=>{
 check(s=>s.sourcePassword='secret','INCOMPLETE_OR_UNTRUSTED_SNAPSHOT');
});
test('only explicitly synthetic PostgreSQL 17 attestation source accepted',()=>{
 check(s=>s.source='LIVE_SUPABASE','PG17_SYNTHETIC_SOURCE_REQUIRED');
 check(s=>s.postgresMajor=16,'PG17_SYNTHETIC_SOURCE_REQUIRED');
 check(s=>s.catalogComplete=false,'PG17_SYNTHETIC_SOURCE_REQUIRED');
});
test('dedicated service role must be named and LOGIN',()=>{
 check(s=>s.role.name='postgres','DEDICATED_SESSION_ROLE_REQUIRED');
 check(s=>s.role.name='service_role','DEDICATED_SESSION_ROLE_REQUIRED');
 check(s=>s.role.login=false,'DEDICATED_SESSION_ROLE_REQUIRED');
});
test('SUPERUSER must not be granted to session reader',()=>{
 check(s=>s.role.superuser=true,'PRIVILEGED_ROLE_FORBIDDEN');
});
test('CREATEDB must not be granted',()=>{
 check(s=>s.role.createDb=true,'PRIVILEGED_ROLE_FORBIDDEN');
});
test('CREATEROLE must not be granted',()=>{
 check(s=>s.role.createRole=true,'PRIVILEGED_ROLE_FORBIDDEN');
});
test('REPLICATION and BYPASSRLS must not be granted',()=>{
 check(s=>s.role.replication=true,'PRIVILEGED_ROLE_FORBIDDEN');
 check(s=>s.role.bypassRls=true,'PRIVILEGED_ROLE_FORBIDDEN');
});
test('role INHERIT and memberOf role grants require further review',()=>{
 check(s=>s.role.inherit=true,'INHERITANCE_REVIEW_REQUIRED');
 check(s=>s.role.memberOf=['postgres'],'INHERITANCE_REVIEW_REQUIRED');
});
test('missing or additional role fields are rejected',()=>{
 check(s=>delete s.role.bypassRls,'ROLE_EVIDENCE_INVALID');
 check(s=>s.role.password='SECRET','ROLE_EVIDENCE_INVALID');
 check(s=>s.role=null,'ROLE_EVIDENCE_INVALID');
});
test('auth schema USAGE required for session query',()=>{
 check(s=>s.authSessions.schemaUsage=false,'SCHEMA_ACCESS_INVALID');
});
test('auth schema CREATE must not be granted',()=>{
 check(s=>s.authSessions.schemaCreate=true,'SCHEMA_ACCESS_INVALID');
});
test('whole-table SELECT grant is too broad for column-minimal session reader',()=>{
 check(s=>s.authSessions.tablePrivileges=['SELECT'],'SESSION_TABLE_PRIVILEGE_EXCESS');
 check(s=>s.authSessions.tablePrivileges=['UPDATE'],'SESSION_TABLE_PRIVILEGE_EXCESS');
});
test('only id user_id and not_after column SELECT grants are allowed',()=>{
 assert.deepEqual(SESSION_COLUMNS,['id','not_after','user_id']);
 check(s=>s.authSessions.columnSelect=['id','user_id'],'SESSION_COLUMNS_NOT_MINIMAL');
 check(s=>s.authSessions.columnSelect=['id','user_id','not_after','refresh_token'],'SESSION_COLUMNS_NOT_MINIMAL');
});
test('column ordering is irrelevant but duplicates are forbidden',()=>{
 const s=fixture();s.authSessions.columnSelect=['user_id','id','not_after'];
 assert.equal(reviewPgSecuritySnapshotV76(s).structuralChecksPassed,true);
 check(s=>s.authSessions.columnSelect=['id','id','not_after'],'SESSION_COLUMNS_NOT_MINIMAL');
});
test('nonarray or invalid selection columns fail closed',()=>{
 check(s=>s.authSessions.columnSelect='id,not_after,user_id','SESSION_COLUMNS_NOT_MINIMAL');
 check(s=>s.authSessions.columnSelect=['id',{},'user_id'],'SESSION_COLUMNS_NOT_MINIMAL');
});
test('inherited or other column permissions require investigation',()=>{
 check(s=>s.authSessions.inheritedPrivileges=['SELECT'],'INHERITED_OR_OTHER_ACCESS_UNKNOWN');
 check(s=>s.authSessions.otherColumnSelect=['refresh_token'],'INHERITED_OR_OTHER_ACCESS_UNKNOWN');
});
test('PUBLIC usage on auth schema invalidates narrow access claim',()=>{
 check(s=>s.authSessions.publicSchemaUsage=true,'PUBLIC_AUTH_SESSION_ACCESS');
});
test('PUBLIC table privileges on auth.sessions invalidates claim',()=>{
 check(s=>s.authSessions.publicTablePrivileges=['SELECT'],'PUBLIC_AUTH_SESSION_ACCESS');
});
test('PUBLIC column grants on auth.sessions invalidate claim',()=>{
 check(s=>s.authSessions.publicColumnSelect=['id'],'PUBLIC_AUTH_SESSION_ACCESS');
});
test('unlisted session access key cannot be silently ignored',()=>{
 check(s=>s.authSessions.unreviewedPrivilege=true,'AUTH_SESSION_EVIDENCE_INVALID');
 check(s=>delete s.authSessions.schemaUsage,'AUTH_SESSION_EVIDENCE_INVALID');
});
test('four tenant tables are fixed in the reviewed footprint',()=>{
 assert.deepEqual(TABLES,['public.mg_organizations','public.mg_sites',
  'public.mg_memberships','public.mg_membership_site_scopes']);
 const s=fixture();s.tenantTables.pop();
 assert.ok(reviewPgSecuritySnapshotV76(s).issueCodes.includes('TENANT_TABLE_EVIDENCE_INVALID'));
});
test('unexpected tenant table cannot replace any reviewed one',()=>{
 check(s=>s.tenantTables[0].name='public.another_organization','TENANT_TABLE_EVIDENCE_INVALID');
 check(s=>s.tenantTables.reverse(),'TENANT_TABLE_EVIDENCE_INVALID');
});
test('all reviewed tenant tables require RLS enabled in snapshot',()=>{
 for(let i=0;i<TABLES.length;i++)
  check(s=>s.tenantTables[i].rlsEnabled=false,'TENANT_RLS_REVIEW_REQUIRED');
});
test('session reader must not own public tenant tables',()=>{
 check(s=>s.tenantTables[2].readerOwnsTable=true,'TENANT_RLS_REVIEW_REQUIRED');
});
test('table exposure to PUBLIC still needs authorization audit',()=>{
 check(s=>s.tenantTables[3].publicTablePrivileges=['SELECT'],'TENANT_RLS_REVIEW_REQUIRED');
});
test('extra tenant metadata is rejected rather than trusted',()=>{
 check(s=>s.tenantTables[1].isolationProven=true,'TENANT_TABLE_EVIDENCE_INVALID');
});
test('issues are sanitized codes, never data from supplied input',()=>{
 const s=fixture();s.role.password='postgres://SECRET';s.tenantTables[0].name='SECRET';
 const raw=JSON.stringify(reviewPgSecuritySnapshotV76(s));
 assert.ok(!raw.includes('SECRET'));assert.ok(!raw.includes('postgres://'));
});
test('no synthetically approved result can declare RLS tenant isolation proven',()=>{
 const r=reviewPgSecuritySnapshotV76(fixture());
 assert.equal(r.tenantIsolationProven,false);
 assert.equal(r.productionAuthorized,false);
 assert.equal(r.postgresConnected,false);
});
