'use strict';

// V76: deterministic review of a SUPPLIED synthetic PostgreSQL 17 snapshot.
// Never executes SQL, connects to a server, or issues grants/migrations.
// Passing structural checks is NOT evidence of actual catalog permissions,
// RLS isolation, refresh lag, backups, or production readiness.
const TABLES = Object.freeze([
  'public.mg_organizations',
  'public.mg_sites',
  'public.mg_memberships',
  'public.mg_membership_site_scopes'
]);
const SESSION_COLUMNS = Object.freeze(['id','not_after','user_id']);
const ROLE_KEYS = Object.freeze(['name','login','superuser','createDb','createRole','replication','bypassRls','inherit','memberOf']);
const SESSION_KEYS = Object.freeze(['schemaUsage','schemaCreate','tablePrivileges','columnSelect','otherColumnSelect','inheritedPrivileges','publicSchemaUsage','publicTablePrivileges','publicColumnSelect']);
const TENANT_KEYS = Object.freeze(['name','rlsEnabled','readerOwnsTable','publicTablePrivileges']);
const TOP = Object.freeze(['source','postgresMajor','catalogComplete','role','authSessions','tenantTables']);
const forbiddenPrivileges = new Set(['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','CREATE','USAGE','ALL','EXECUTE','MAINTAIN']);
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const only = (o,keys) => plain(o) && Object.keys(o).length===keys.length &&
  keys.every(k=>Object.hasOwn(o,k));
const stringList = x => Array.isArray(x) && x.length <= 32 &&
  x.every(v=>typeof v==='string' && v.length>0 && v.length<=64) &&
  new Set(x).size===x.length;
const emptyList = x => Array.isArray(x) && x.length === 0;
const append = (a,code,fail) => {if (fail) a.push(code);};

// A structural attestation has a narrow, fixed schema so caller-supplied
// strings, SQL and secrets are never copied to the report.
function reviewPgSecuritySnapshotV76(snapshot) {
  const findings=[];
  if (!only(snapshot,TOP)) {
    findings.push('INCOMPLETE_OR_UNTRUSTED_SNAPSHOT');
  } else {
    append(findings,'PG17_SYNTHETIC_SOURCE_REQUIRED',
      snapshot.source!=='SYNTHETIC_PG17_CATALOG' || snapshot.postgresMajor!==17 || snapshot.catalogComplete!==true);
    const role=snapshot.role;
    if (!only(role,ROLE_KEYS)) findings.push('ROLE_EVIDENCE_INVALID');
    else {
      append(findings,'DEDICATED_SESSION_ROLE_REQUIRED',role.name!=='mg_session_reader' || role.login!==true);
      append(findings,'PRIVILEGED_ROLE_FORBIDDEN',role.superuser!==false || role.createDb!==false ||
        role.createRole!==false || role.replication!==false || role.bypassRls!==false);
      append(findings,'INHERITANCE_REVIEW_REQUIRED',role.inherit!==false || !emptyList(role.memberOf));
    }
    const access=snapshot.authSessions;
    if (!only(access,SESSION_KEYS)) findings.push('AUTH_SESSION_EVIDENCE_INVALID');
    else {
      append(findings,'SCHEMA_ACCESS_INVALID',access.schemaUsage!==true || access.schemaCreate!==false);
      append(findings,'SESSION_TABLE_PRIVILEGE_EXCESS',!emptyList(access.tablePrivileges));
      append(findings,'SESSION_COLUMNS_NOT_MINIMAL',!stringList(access.columnSelect) ||
        [...access.columnSelect].sort().join('|')!==SESSION_COLUMNS.join('|'));
      append(findings,'INHERITED_OR_OTHER_ACCESS_UNKNOWN',!emptyList(access.inheritedPrivileges) ||
        !emptyList(access.otherColumnSelect));
      append(findings,'PUBLIC_AUTH_SESSION_ACCESS',access.publicSchemaUsage!==false ||
        !emptyList(access.publicTablePrivileges) || !emptyList(access.publicColumnSelect));
    }
    const tables=snapshot.tenantTables;
    if (!Array.isArray(tables) || tables.length!==TABLES.length ||
        tables.some((t,i)=>!only(t,TENANT_KEYS) || t.name!==TABLES[i])) {
      findings.push('TENANT_TABLE_EVIDENCE_INVALID');
    } else for (const t of tables) {
      append(findings,'TENANT_RLS_REVIEW_REQUIRED',t.rlsEnabled!==true ||
        t.readerOwnsTable!==false || !emptyList(t.publicTablePrivileges));
    }
  }
  const codes=Object.freeze([...new Set(findings)].sort());
  return Object.freeze({
    evidenceClass:'SYNTHETIC_PG17_CATALOG',
    structuralChecksPassed:codes.length===0,
    issueCodes:codes,
    realCatalogVerified:false,
    effectivePrivilegesProven:false,
    tenantIsolationProven:false,
    postgresConnected:false,
    v67OperationalChecksPassed:0,
    v67OperationalChecksPending:32,
    productionAuthorized:false,
    decision:'NO_GO'
  });
}
function createSyntheticPgSnapshotV76() {
  return Object.freeze({
    source:'SYNTHETIC_PG17_CATALOG',postgresMajor:17,catalogComplete:true,
    role:Object.freeze({name:'mg_session_reader',login:true,superuser:false,
      createDb:false,createRole:false,replication:false,bypassRls:false,
      inherit:false,memberOf:Object.freeze([])}),
    authSessions:Object.freeze({
      schemaUsage:true,schemaCreate:false,
      tablePrivileges:Object.freeze([]),
      columnSelect:Object.freeze(['id','not_after','user_id']),
      otherColumnSelect:Object.freeze([]),inheritedPrivileges:Object.freeze([]),
      publicSchemaUsage:false,publicTablePrivileges:Object.freeze([]),
      publicColumnSelect:Object.freeze([])
    }),
    tenantTables:Object.freeze(TABLES.map(name=>Object.freeze({
      name,rlsEnabled:true,readerOwnsTable:false,publicTablePrivileges:Object.freeze([])
    })))
  });
}
module.exports={reviewPgSecuritySnapshotV76,createSyntheticPgSnapshotV76,TABLES,SESSION_COLUMNS};
