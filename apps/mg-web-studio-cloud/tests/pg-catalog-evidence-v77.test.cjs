'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPgCatalogEvidenceV77,reviewCatalogEvidenceEnvelopeV77}
  =require('../server/pg-catalog-evidence-v77.cjs');
const get=()=>createPgCatalogEvidenceV77();
const item=id=>get().queries.find(q=>q.id===id);
const valid=()=>({origin:'SYNTHETIC_FIXTURE',role:'mg_session_reader',queryIds:get().queries.map(x=>x.id)});
test('seven catalog queries are fixed and named',()=>{
 const p=get();assert.equal(p.queries.length,7);
 assert.deepEqual(p.queries.map(q=>q.id),[
  'pg_version','role_attributes','role_memberships','session_access',
  'session_columns','tenant_rls_tables','tenant_rls_policies'
 ]);
});
test('every query is a SELECT without SQL statement separators or SQL execution',()=>{
 for(const q of get().queries){
  assert.match(q.text,/^SELECT\s/i);assert.equal(q.text.includes(';'),false);
  assert.ok(!/^\s*(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE)\b/i.test(q.text));
  assert.equal(typeof q.purpose,'string');
  assert.ok(!('run' in q) && !('client' in q) && !('execute' in q));
 }
});
test('each query descriptor, query list and params are frozen',()=>{
 const p=get();assert.ok(Object.isFrozen(p.queries));
 for(const q of p.queries){
  assert.ok(Object.isFrozen(q));assert.ok(Object.isFrozen(q.values));
 }
});
test('reader role is an explicit parameter and never interpolated into SQL',()=>{
 for(const id of ['role_attributes','role_memberships','session_access']){
  const q=item(id);assert.ok(q.text.includes('$1::name'));
  assert.deepEqual(q.values,['mg_session_reader']);
  assert.ok(!q.text.includes('mg_session_reader'));
 }
});
test('tenant inventory has a fixed table-name array parameter',()=>{
 for(const id of ['tenant_rls_tables','tenant_rls_policies']){
  const q=item(id);assert.match(q.text,/\$1::text\[\]/);
  assert.deepEqual(q.values[0],['mg_organizations','mg_sites','mg_memberships','mg_membership_site_scopes']);
  assert.ok(Object.isFrozen(q.values[0]));
 }
});
test('catalog SQL uses trusted Postgres catalog schemas',()=>{
 assert.match(item('role_attributes').text,/pg_catalog\.pg_roles/);
 assert.match(item('role_memberships').text,/pg_catalog\.pg_auth_members/);
 assert.match(item('tenant_rls_tables').text,/pg_catalog\.pg_class/);
 assert.match(item('tenant_rls_policies').text,/pg_catalog\.pg_policies/);
});
test('session access inventory examines schema and column-level privileges',()=>{
 const q=item('session_access');
 for(const word of ['has_schema_privilege','has_table_privilege','has_column_privilege',
  "'id'","'user_id'","'not_after'","'DELETE'","'UPDATE'"]){
  assert.ok(q.text.includes(word));
 }
});
test('role flags cover bypassrls and inherited attributes',()=>{
 const t=item('role_attributes').text;
 for(const column of ['rolcanlogin','rolsuper','rolcreatedb','rolcreaterole',
  'rolreplication','rolbypassrls','rolinherit'])assert.ok(t.includes(column));
});
test('role membership SQL inspects both member and parent',()=>{
 const t=item('role_memberships').text;
 assert.ok(t.includes('m.member'));assert.ok(t.includes('m.roleid'));
 assert.ok(t.includes('parent.rolname'));assert.ok(t.includes('member.rolname'));
});
test('schema compatibility includes only V75 required columns',()=>{
 const q=item('session_columns');
 assert.deepEqual(q.values[0],['id','not_after','user_id']);
 assert.ok(q.text.includes("table_schema = 'auth'"));
 assert.ok(q.text.includes("table_name = 'sessions'"));
});
test('RLS table inventory includes effective owner and FORCE RLS state',()=>{
 const t=item('tenant_rls_tables').text;
 assert.ok(t.includes('relrowsecurity'));assert.ok(t.includes('relforcerowsecurity'));
 assert.ok(t.includes('pg_get_userbyid'));assert.ok(t.includes('relkind'));
});
test('RLS policy inspection includes USING and WITH CHECK expressions',()=>{
 const t=item('tenant_rls_policies').text;
 assert.ok(t.includes('qual'));assert.ok(t.includes('with_check'));
 assert.ok(t.includes('permissive'));assert.ok(t.includes('roles'));
});
test('all query params are immutable, no arbitrary user-supplied SQL allowed',()=>{
 const q=item('tenant_rls_tables');assert.throws(()=>q.values[0].push('private'),TypeError);
 assert.throws(()=>q.values.push('inject'),TypeError);
 assert.throws(()=>{q.text='DELETE FROM auth.sessions'},TypeError);
});
test('scope is exactly four tenant tables and three auth session columns',()=>{
 const p=get();
 assert.equal(p.scope.readerRole,'mg_session_reader');
 assert.equal(p.scope.tenantTables.length,4);
 assert.deepEqual(p.scope.sessionColumns,['id','not_after','user_id']);
});
test('manifest construction does not import or create Postgres/network clients',()=>{
 const p=get();
 for(const word of ['connect','listen','pool','migrate','runSql','executeSql','serviceRole']){
  assert.equal(word in p,false);
 }
});
test('even valid synthetic envelope does not assert real privilege proof',()=>{
 const r=reviewCatalogEvidenceEnvelopeV77(valid());
 assert.equal(r.syntheticManifestShapeValid,true);
 assert.equal(r.effectivePrivilegesVerified,false);
 assert.equal(r.rlsIsolationVerified,false);
 assert.equal(r.evidenceFromRealServer,false);
 assert.equal(r.hasRunSQL,false);
 assert.equal(r.productionAuthorized,false);
 assert.equal(r.decision,'NO_GO');
});
test('missing and corrupt envelopes fail closed',()=>{
 for(const v of [undefined,null,1,{},[],{origin:'SYNTHETIC_FIXTURE',role:'mg_session_reader'}])
  assert.equal(reviewCatalogEvidenceEnvelopeV77(v).syntheticManifestShapeValid,false);
});
test('real claimed source is rejected even if query list matches',()=>{
 const x=valid();x.origin='SUPABASE_PRODUCTION';
 assert.equal(reviewCatalogEvidenceEnvelopeV77(x).syntheticManifestShapeValid,false);
});
test('unknown role is rejected, including service_role and postgres',()=>{
 for(const role of ['postgres','service_role','other','']){
  const x=valid();x.role=role;
  assert.equal(reviewCatalogEvidenceEnvelopeV77(x).syntheticManifestShapeValid,false);
 }
});
test('query identifiers cannot be omitted, reordered or extended',()=>{
 for(const change of [
  x=>x.queryIds.pop(),x=>x.queryIds.reverse(),x=>x.queryIds.push('write'),
  x=>x.queryIds[0]='pg_version; DROP TABLE auth.sessions'
 ]){
  const x=valid();change(x);
  assert.equal(reviewCatalogEvidenceEnvelopeV77(x).syntheticManifestShapeValid,false);
 }
});
test('unknown envelope fields containing secrets are rejected and never echoed',()=>{
 const x=valid();x.connectionString='postgres://PASSWORD';
 const r=reviewCatalogEvidenceEnvelopeV77(x);
 assert.equal(r.syntheticManifestShapeValid,false);
 assert.ok(!JSON.stringify(r).includes('PASSWORD'));
});
test('readiness is immutable and permanently declares V67 pending',()=>{
 const p=get(),r=p.readiness;
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(r));
 assert.equal(r.v67OperationalChecksPending,32);
 assert.equal(r.productionAuthorized,false);assert.equal(r.decision,'NO_GO');
});
