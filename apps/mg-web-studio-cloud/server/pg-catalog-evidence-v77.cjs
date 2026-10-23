'use strict';

// V77: fixed, parameterized READ-ONLY catalog queries for future manual review.
// This is a planning artifact: NO query executor, client, connections or SQL I/O.
const READER = 'mg_session_reader';
const TABLES = Object.freeze([
  'mg_organizations','mg_sites','mg_memberships','mg_membership_site_scopes'
]);
const COLUMNS = Object.freeze(['id','not_after','user_id']);
const QUERIES = Object.freeze([
  Object.freeze({
    id:'pg_version',purpose:'Verify version 17 on an explicitly authorized destination',
    text:"SELECT current_setting('server_version_num')::integer AS server_version_num",
    values:Object.freeze([])
  }),
  Object.freeze({
    id:'role_attributes',purpose:'Inspect flags on proposed dedicated session role',
    text:'SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, ' +
      'rolreplication, rolbypassrls, rolinherit FROM pg_catalog.pg_roles ' +
      'WHERE rolname = $1::name',
    values:Object.freeze([READER])
  }),
  Object.freeze({
    id:'role_memberships',purpose:'Reveal inherited privileges through role memberships',
    text:'SELECT parent.rolname AS parent_role FROM pg_catalog.pg_auth_members AS m ' +
      'JOIN pg_catalog.pg_roles AS member ON member.oid = m.member ' +
      'JOIN pg_catalog.pg_roles AS parent ON parent.oid = m.roleid ' +
      'WHERE member.rolname = $1::name ORDER BY parent.rolname',
    values:Object.freeze([READER])
  }),
  Object.freeze({
    id:'session_access',purpose:'Inspect effective schema, table and required column privileges',
    text:"SELECT pg_catalog.has_schema_privilege($1::name, 'auth', 'USAGE') AS schema_usage, " +
      "pg_catalog.has_schema_privilege($1::name, 'auth', 'CREATE') AS schema_create, " +
      "pg_catalog.has_table_privilege($1::name, 'auth.sessions', 'SELECT') AS table_select, " +
      "pg_catalog.has_table_privilege($1::name, 'auth.sessions', 'UPDATE') AS table_update, " +
      "pg_catalog.has_table_privilege($1::name, 'auth.sessions', 'DELETE') AS table_delete, " +
      "pg_catalog.has_column_privilege($1::name, 'auth.sessions', 'id', 'SELECT') AS id_select, " +
      "pg_catalog.has_column_privilege($1::name, 'auth.sessions', 'user_id', 'SELECT') AS user_id_select, " +
      "pg_catalog.has_column_privilege($1::name, 'auth.sessions', 'not_after', 'SELECT') AS not_after_select",
    values:Object.freeze([READER])
  }),
  Object.freeze({
    id:'session_columns',purpose:'Check schema compatibility with the V75 read-only query',
    text:"SELECT column_name, data_type, is_nullable FROM information_schema.columns " +
      "WHERE table_schema = 'auth' AND table_name = 'sessions' " +
      "AND column_name = ANY($1::text[]) ORDER BY column_name",
    values:Object.freeze([COLUMNS])
  }),
  Object.freeze({
    id:'tenant_rls_tables',purpose:'Inventory tenant RLS, FORCE RLS, relation kind and owner',
    text:"SELECT n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, " +
      "pg_catalog.pg_get_userbyid(c.relowner) AS table_owner " +
      "FROM pg_catalog.pg_class AS c " +
      "JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace " +
      "WHERE n.nspname = 'public' AND c.relname = ANY($1::text[]) " +
      'ORDER BY c.relname',
    values:Object.freeze([TABLES])
  }),
  Object.freeze({
    id:'tenant_rls_policies',purpose:'Obtain raw RLS policy expressions for independent human review',
    text:"SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check " +
      "FROM pg_catalog.pg_policies WHERE schemaname = 'public' " +
      "AND tablename = ANY($1::text[]) ORDER BY tablename, policyname",
    values:Object.freeze([TABLES])
  })
]);
const OUTCOME = Object.freeze({packageType:'OFFLINE_CATALOG_QUERIES',
  evidenceFromRealServer:false,hasRunSQL:false,rlsIsolationVerified:false,
  effectivePrivilegesVerified:false,productionAuthorized:false,
  v67OperationalChecksPending:32,decision:'NO_GO'});

function createPgCatalogEvidenceV77() {
  return Object.freeze({queries:QUERIES,readiness:OUTCOME,
    scope:Object.freeze({readerRole:READER,
      tenantTables:TABLES,sessionColumns:COLUMNS})});
}

// Verifies only that the static package has been retained intact.
// NEVER promotes externally claimed PASS / APPROVED to evidence.
function reviewCatalogEvidenceEnvelopeV77(input) {
  const valid = input !== null && typeof input==='object' && !Array.isArray(input) &&
    [Object.prototype,null].includes(Object.getPrototypeOf(input)) &&
    Object.keys(input).length===3 &&
    input.origin==='SYNTHETIC_FIXTURE' &&
    input.role===READER &&
    Array.isArray(input.queryIds) && input.queryIds.length===QUERIES.length &&
    QUERIES.every((item,index)=>input.queryIds[index]===item.id);
  return Object.freeze({syntheticManifestShapeValid:valid,
    evidenceFromRealServer:false,hasRunSQL:false,rlsIsolationVerified:false,
    effectivePrivilegesVerified:false,v67OperationalChecksPending:32,
    productionAuthorized:false,decision:'NO_GO'});
}

module.exports={createPgCatalogEvidenceV77,reviewCatalogEvidenceEnvelopeV77};
