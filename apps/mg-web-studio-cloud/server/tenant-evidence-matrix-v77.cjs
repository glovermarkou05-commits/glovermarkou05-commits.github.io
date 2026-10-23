'use strict';

// V77: approval-sensitive acceptance scenarios, not executable network tests.
// Every item stays PENDING until real, separately authorized evidence exists.
const CASES = Object.freeze([
  Object.freeze({id:'TENANT_01',area:'tenant',actor:'ORG_A_VIEWER',target:'ORG_A_SITE',
    expected:'ALLOW_IF_MEMBERSHIP_AND_SCOPE_ACTIVE',evidence:'Authenticated read with same-org active scope'}),
  Object.freeze({id:'TENANT_02',area:'tenant',actor:'ORG_A_VIEWER',target:'ORG_B_SITE',
    expected:'DENY',evidence:'Cross-organization site read, HTTP and SQL'}),
  Object.freeze({id:'TENANT_03',area:'tenant',actor:'ORG_B_VIEWER',target:'ORG_A_SITE',
    expected:'DENY',evidence:'Reverse cross-organization read'}),
  Object.freeze({id:'TENANT_04',area:'tenant',actor:'ANONYMOUS',target:'ORG_A_SITE',
    expected:'DENY',evidence:'Unauthenticated request cannot cross auth boundary'}),
  Object.freeze({id:'TENANT_05',area:'tenant',actor:'REVOKED_ORG_A_VIEWER',target:'ORG_A_SITE',
    expected:'DENY',evidence:'Session valid, membership revoked in authoritative DB'}),
  Object.freeze({id:'TENANT_06',area:'tenant',actor:'ORG_A_VIEWER_SCOPE_REMOVED',target:'ORG_A_SITE',
    expected:'DENY',evidence:'Site scope removed after previously valid access'}),
  Object.freeze({id:'TENANT_07',area:'tenant',actor:'ORG_A_VIEWER',target:'ORG_B_SITE_LIST',
    expected:'DENY',evidence:'List filtering must not leak foreign organization IDs'}),
  Object.freeze({id:'TENANT_08',area:'tenant',actor:'REVOKED_SESSION_A',target:'ORG_A_SITE',
    expected:'DENY',evidence:'Signed but revoked auth.sessions row'}),
  Object.freeze({id:'RLS_09',area:'rls',actor:'ANON_DB_ROLE',target:'AUTH_SESSIONS',
    expected:'DENY',evidence:'Effective SQL grant and API exposure inspection'}),
  Object.freeze({id:'RLS_10',area:'rls',actor:'SESSION_READER_DB_ROLE',target:'AUTH_SESSIONS',
    expected:'RESTRICTED_SELECT',evidence:'Column-limited SELECT with no privilege escalation'}),
  Object.freeze({id:'RLS_11',area:'rls',actor:'SESSION_READER_DB_ROLE',target:'AUTH_REFRESH_TOKENS',
    expected:'DENY',evidence:'No indirect or inherited SELECT'}),
  Object.freeze({id:'RLS_12',area:'rls',actor:'TENANT_A_DB_CONTEXT',target:'TENANT_B_ROWS',
    expected:'DENY',evidence:'RLS SQL probe with verified role and claims context'})
]);
const EXPECTED_IDS=Object.freeze(CASES.map(x=>x.id));
const NO_GO=Object.freeze({casesRunAgainstDatabase:0,independentRlsProof:false,
  operationalV67ChecksPassed:0,operationalV67ChecksPending:32,
  databaseApproved:false,networkApproved:false,restoreApproved:false,
  productionApproved:false,decision:'NO_GO'});
function createTenantEvidenceMatrixV77() {
  return Object.freeze({scenarios:CASES,scenarioCount:CASES.length,
    statuses:Object.freeze(CASES.map(x=>Object.freeze({id:x.id,status:'PENDING'}))),
    readiness:NO_GO});
}
function reviewSyntheticScenarioChecklistV77(candidate) {
  const valid=candidate !== null && typeof candidate==='object' && !Array.isArray(candidate) &&
    [Object.prototype,null].includes(Object.getPrototypeOf(candidate)) &&
    Object.keys(candidate).length===2 &&
    candidate.source==='SYNTHETIC_PLAN_ONLY' &&
    Array.isArray(candidate.scenarios) && candidate.scenarios.length===CASES.length &&
    candidate.scenarios.every((v,i)=>v && typeof v==='object' &&
      !Array.isArray(v) && Object.keys(v).length===2 &&
      v.id===EXPECTED_IDS[i] && v.status==='PENDING');
  return Object.freeze({validPlanShape:valid,
    casesRunAgainstDatabase:0,rlsIsolationProven:false,
    operationalV67ChecksPassed:0,operationalV67ChecksPending:32,
    productionAuthorized:false,decision:'NO_GO'});
}
module.exports={createTenantEvidenceMatrixV77,reviewSyntheticScenarioChecklistV77};
