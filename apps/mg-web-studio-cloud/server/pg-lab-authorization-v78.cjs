'use strict';

// V78: approval REQUEST planning, not approval or a capability to connect.
// No SQL, HTTP, subprocess, filesystem I/O, secrets or live database objects.
const {createPgCatalogEvidenceV77}=require('./pg-catalog-evidence-v77.cjs');
const {createTenantEvidenceMatrixV77}=require('./tenant-evidence-matrix-v77.cjs');
const {createSyntheticRecoveryPlanV76,reviewRecoveryPreflightV76}=
  require('./pg-recovery-plan-v76.cjs');

const APPROVAL_NAMES=Object.freeze(['database','network','sqlRead','tenantFixtures',
  'restore','production']);
const REQUIRED_RESOURCES=Object.freeze({minFreeDiskGiB:10,minMemoryGiB:4,minCpuCores:2});
const REQUEST_KEYS=Object.freeze(['source','target','postgresMajor','dataClass','credentials',
  'connectionsOpened','approvals','resources','isolation','queryIds','scenarioIds',
  'recovery']);
const RESOURCE_KEYS=Object.freeze(['minFreeDiskGiB','minMemoryGiB','minCpuCores',
  'measuredFreeDiskGiB','measuredMemoryGiB','measuredCpuCores']);
const ISOLATION_KEYS=Object.freeze(['networkState','host','operator',
  'fixtureTenants','rollbackProcedure','disposalProcedure','productionAccess']);
const OUTCOME=Object.freeze({environment:'PLANNING_ONLY',reviewedRealSystem:false,
  actualCapacityMeasured:false,credentialsIssued:false,postgresConnected:false,
  grantsVerified:false,tenantIsolationProven:false,backupRestored:false,
  approvalsGranted:false,executablePlanCreated:false,operationalV67Passed:0,
  operationalV67Pending:32,productionAuthorized:false,decision:'NO_GO'});
const plain=o=>o!==null && typeof o==='object' && !Array.isArray(o) &&
  [Object.prototype,null].includes(Object.getPrototypeOf(o));
const exactly=(o,keys)=>plain(o) && Object.keys(o).length===keys.length &&
  keys.every(k=>Object.hasOwn(o,k));
const same=(a,b)=>Array.isArray(a)&&a.length===b.length&&b.every((v,i)=>a[i]===v);

function createPgLabAuthorizationRequestV78(){
  const catalog=createPgCatalogEvidenceV77();
  const matrix=createTenantEvidenceMatrixV77();
  const approvals=Object.freeze(Object.fromEntries(APPROVAL_NAMES.map(k=>[k,'PENDING'])));
  return Object.freeze({
    source:'OFFLINE_APPROVAL_REQUEST',target:'UNPROVISIONED_LOCAL_PG17',
    postgresMajor:17,dataClass:'SYNTHETIC_ONLY',
    credentials:'NOT_ISSUED',connectionsOpened:0,approvals,
    resources:Object.freeze({...REQUIRED_RESOURCES,
      measuredFreeDiskGiB:null,measuredMemoryGiB:null,measuredCpuCores:null}),
    isolation:Object.freeze({
      networkState:'DISABLED',host:'UNASSIGNED',operator:'UNASSIGNED',
      fixtureTenants:Object.freeze(['ORG_A','ORG_B']),
      rollbackProcedure:'DRAFT_ONLY',disposalProcedure:'DRAFT_ONLY',
      productionAccess:false
    }),
    queryIds:Object.freeze(catalog.queries.map(q=>q.id)),
    scenarioIds:Object.freeze(matrix.scenarios.map(s=>s.id)),
    recovery:createSyntheticRecoveryPlanV76()
  });
}
function reviewPgLabAuthorizationRequestV78(input) {
  const issues=[];
  if(!exactly(input,REQUEST_KEYS))issues.push('INVALID_REQUEST_SHAPE');
  else {
    if(input.source!=='OFFLINE_APPROVAL_REQUEST'||input.target!=='UNPROVISIONED_LOCAL_PG17'||
       input.postgresMajor!==17||input.dataClass!=='SYNTHETIC_ONLY')
       issues.push('UNAPPROVED_TARGET_OR_DATA');
    if(input.credentials!=='NOT_ISSUED'||input.connectionsOpened!==0)
       issues.push('CONNECTION_OR_CREDENTIAL_CLAIM');
    if(!exactly(input.approvals,APPROVAL_NAMES)||
       APPROVAL_NAMES.some(k=>input.approvals?.[k]!=='PENDING'))
       issues.push('APPROVAL_CLAIM_NOT_ALLOWED');
    if(!exactly(input.resources,RESOURCE_KEYS)||
       Object.entries(REQUIRED_RESOURCES).some(([k,v])=>input.resources?.[k]!==v)||
       ['measuredFreeDiskGiB','measuredMemoryGiB','measuredCpuCores']
       .some(k=>input.resources?.[k]!==null))
       issues.push('RESOURCE_MEASUREMENT_UNVERIFIED');
    const i=input.isolation;
    if(!exactly(i,ISOLATION_KEYS)||i.networkState!=='DISABLED'||
       i.host!=='UNASSIGNED'||i.operator!=='UNASSIGNED'||
       !same(i.fixtureTenants,['ORG_A','ORG_B'])||
       i.rollbackProcedure!=='DRAFT_ONLY'||i.disposalProcedure!=='DRAFT_ONLY'||
       i.productionAccess!==false)
       issues.push('ISOLATION_OR_ROLLBACK_UNVERIFIED');
    if(!same(input.queryIds,createPgCatalogEvidenceV77().queries.map(q=>q.id)))
       issues.push('CATALOG_QUERY_MANIFEST_CHANGED');
    if(!same(input.scenarioIds,createTenantEvidenceMatrixV77().scenarios.map(s=>s.id)))
       issues.push('TENANT_SCENARIO_MANIFEST_CHANGED');
    const recovery=reviewRecoveryPreflightV76(input.recovery);
    if(!recovery.planningShapeAccepted)issues.push('RECOVERY_PLAN_NOT_READY');
  }
  return Object.freeze({syntheticPlanningShapeValid:issues.length===0,
    issueCodes:Object.freeze([...new Set(issues)].sort()),...OUTCOME});
}
module.exports={createPgLabAuthorizationRequestV78,reviewPgLabAuthorizationRequestV78};
