'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPgLabAuthorizationRequestV78,reviewPgLabAuthorizationRequestV78}=
  require('../server/pg-lab-authorization-v78.cjs');
const fresh=()=>structuredClone(createPgLabAuthorizationRequestV78());
function denied(mutate,expected) {
 const input=fresh();mutate(input);
 const out=reviewPgLabAuthorizationRequestV78(input);
 assert.equal(out.syntheticPlanningShapeValid,false);
 assert.ok(out.issueCodes.includes(expected),JSON.stringify(out.issueCodes));
 assert.equal(out.decision,'NO_GO');
}
test('valid synthetic request is only a planning shape, never a deployment approval',()=>{
 const out=reviewPgLabAuthorizationRequestV78(fresh());
 assert.equal(out.syntheticPlanningShapeValid,true);
 assert.deepEqual(out.issueCodes,[]);
 for(const k of ['reviewedRealSystem','actualCapacityMeasured','credentialsIssued','postgresConnected',
   'grantsVerified','tenantIsolationProven','backupRestored','approvalsGranted',
   'executablePlanCreated','productionAuthorized'])assert.equal(out[k],false);
 assert.equal(out.operationalV67Passed,0);
 assert.equal(out.operationalV67Pending,32);
 assert.equal(out.decision,'NO_GO');
});
test('all six approvals are separate and PENDING',()=>{
 const approvals=fresh().approvals;
 assert.deepEqual(Object.keys(approvals),['database','network','sqlRead','tenantFixtures','restore','production']);
 assert.ok(Object.values(approvals).every(v=>v==='PENDING'));
});
test('even a claimed APPROVED database access fails closed',()=>{
 denied(x=>x.approvals.database='APPROVED','APPROVAL_CLAIM_NOT_ALLOWED');
});
test('an approved network permission cannot be inferred from lab plan',()=>{
 denied(x=>x.approvals.network='APPROVED','APPROVAL_CLAIM_NOT_ALLOWED');
});
test('read-only SQL access must be independently authorized',()=>{
 denied(x=>x.approvals.sqlRead='APPROVED','APPROVAL_CLAIM_NOT_ALLOWED');
});
test('fixture writes must never be implicitly authorized',()=>{
 denied(x=>x.approvals.tenantFixtures='APPROVED','APPROVAL_CLAIM_NOT_ALLOWED');
});
test('restoration requires its own separate approval',()=>{
 denied(x=>x.approvals.restore='APPROVED','APPROVAL_CLAIM_NOT_ALLOWED');
});
test('production approval claim cannot turn synthetic result into GO',()=>{
 denied(x=>x.approvals.production='APPROVED','APPROVAL_CLAIM_NOT_ALLOWED');
});
test('role/approval injection, omission or arbitrary secrets invalid',()=>{
 denied(x=>x.approvals.service_role='APPROVED','APPROVAL_CLAIM_NOT_ALLOWED');
 denied(x=>delete x.approvals.network,'APPROVAL_CLAIM_NOT_ALLOWED');
 denied(x=>x.secret='PASSWORD','INVALID_REQUEST_SHAPE');
});
test('target must be unprovisioned local PostgreSQL 17',()=>{
 denied(x=>x.target='SUPABASE_STAGING','UNAPPROVED_TARGET_OR_DATA');
 denied(x=>x.target='PRODUCTION','UNAPPROVED_TARGET_OR_DATA');
 denied(x=>x.postgresMajor=16,'UNAPPROVED_TARGET_OR_DATA');
});
test('only synthetic data and explicit request origin accepted',()=>{
 denied(x=>x.dataClass='CUSTOMER_RECORDS','UNAPPROVED_TARGET_OR_DATA');
 denied(x=>x.source='LIVE_CATALOG_RESULTS','UNAPPROVED_TARGET_OR_DATA');
});
test('no issued credentials or opened connections may be claimed',()=>{
 denied(x=>x.credentials='POSTGRES_URI','CONNECTION_OR_CREDENTIAL_CLAIM');
 denied(x=>x.connectionsOpened=1,'CONNECTION_OR_CREDENTIAL_CLAIM');
});
test('planning resource figures are requirements, never measured device capacity',()=>{
 const p=fresh();
 assert.deepEqual(p.resources,{minFreeDiskGiB:10,minMemoryGiB:4,minCpuCores:2,
  measuredFreeDiskGiB:null,measuredMemoryGiB:null,measuredCpuCores:null});
 assert.equal(reviewPgLabAuthorizationRequestV78(p).actualCapacityMeasured,false);
});
test('inventing actual free disk or RAM is rejected',()=>{
 denied(x=>x.resources.measuredFreeDiskGiB=10,'RESOURCE_MEASUREMENT_UNVERIFIED');
 denied(x=>x.resources.measuredMemoryGiB=4,'RESOURCE_MEASUREMENT_UNVERIFIED');
 denied(x=>x.resources.measuredCpuCores=2,'RESOURCE_MEASUREMENT_UNVERIFIED');
});
test('unsafe or changed resource minima are rejected',()=>{
 denied(x=>x.resources.minFreeDiskGiB=0,'RESOURCE_MEASUREMENT_UNVERIFIED');
 denied(x=>x.resources.minMemoryGiB=1,'RESOURCE_MEASUREMENT_UNVERIFIED');
 denied(x=>x.resources.minCpuCores=0,'RESOURCE_MEASUREMENT_UNVERIFIED');
});
test('missing or extra resources cannot be silently omitted',()=>{
 denied(x=>delete x.resources.measuredCpuCores,'RESOURCE_MEASUREMENT_UNVERIFIED');
 denied(x=>x.resources.hostname='postgres.local','RESOURCE_MEASUREMENT_UNVERIFIED');
});
test('host/operator remain unassigned until actual authorization',()=>{
 const p=fresh();assert.equal(p.isolation.host,'UNASSIGNED');
 assert.equal(p.isolation.operator,'UNASSIGNED');
 denied(x=>x.isolation.host='STAGING_DB','ISOLATION_OR_ROLLBACK_UNVERIFIED');
 denied(x=>x.isolation.operator='superuser','ISOLATION_OR_ROLLBACK_UNVERIFIED');
});
test('network is explicitly disabled and production access false',()=>{
 denied(x=>x.isolation.networkState='ENABLED','ISOLATION_OR_ROLLBACK_UNVERIFIED');
 denied(x=>x.isolation.productionAccess=true,'ISOLATION_OR_ROLLBACK_UNVERIFIED');
});
test('two synthetic organizations A and B must be distinct and ordered',()=>{
 assert.deepEqual(fresh().isolation.fixtureTenants,['ORG_A','ORG_B']);
 denied(x=>x.isolation.fixtureTenants=['ORG_A','ORG_A'],'ISOLATION_OR_ROLLBACK_UNVERIFIED');
 denied(x=>x.isolation.fixtureTenants.reverse(),'ISOLATION_OR_ROLLBACK_UNVERIFIED');
});
test('rollback and disposal plans remain drafts',()=>{
 denied(x=>x.isolation.rollbackProcedure='COMPLETED','ISOLATION_OR_ROLLBACK_UNVERIFIED');
 denied(x=>x.isolation.disposalProcedure='APPLIED','ISOLATION_OR_ROLLBACK_UNVERIFIED');
});
test('isolation must be exhaustive and not contain URLs or secrets',()=>{
 denied(x=>x.isolation.DATABASE_URL='postgres://password','ISOLATION_OR_ROLLBACK_UNVERIFIED');
 denied(x=>delete x.isolation.rollbackProcedure,'ISOLATION_OR_ROLLBACK_UNVERIFIED');
});
test('exact seven V77 catalog query IDs are preserved',()=>{
 assert.equal(fresh().queryIds.length,7);
 denied(x=>x.queryIds.pop(),'CATALOG_QUERY_MANIFEST_CHANGED');
 denied(x=>x.queryIds.reverse(),'CATALOG_QUERY_MANIFEST_CHANGED');
 denied(x=>x.queryIds[0]='GRANT ALL','CATALOG_QUERY_MANIFEST_CHANGED');
});
test('exact twelve V77 scenario IDs are preserved',()=>{
 assert.equal(fresh().scenarioIds.length,12);
 denied(x=>x.scenarioIds.pop(),'TENANT_SCENARIO_MANIFEST_CHANGED');
 denied(x=>x.scenarioIds[1]=x.scenarioIds[0],'TENANT_SCENARIO_MANIFEST_CHANGED');
});
test('embedded V76 recovery preflight must remain offline and unauthorized',()=>{
 denied(x=>x.recovery.restorePerformed=true,'RECOVERY_PLAN_NOT_READY');
 denied(x=>x.recovery.approvals.database='APPROVED','RECOVERY_PLAN_NOT_READY');
 denied(x=>x.recovery.networkEnabled=true,'RECOVERY_PLAN_NOT_READY');
});
test('malformed, empty, arrays and inherited data rejected',()=>{
 for(const p of [undefined,null,{},[],1,'secret',Object.create(fresh())]){
  const r=reviewPgLabAuthorizationRequestV78(p);
  assert.equal(r.syntheticPlanningShapeValid,false);
  assert.ok(r.issueCodes.includes('INVALID_REQUEST_SHAPE'));
 }
});
test('result contains only fixed codes and never echoes a secret payload',()=>{
 const p=fresh();p.secret='DATABASE_PASSWORD_123';
 const r=JSON.stringify(reviewPgLabAuthorizationRequestV78(p));
 assert.ok(!r.includes('DATABASE_PASSWORD_123'));
});
test('returned manifest and results are frozen and expose no execution functions',()=>{
 const p=createPgLabAuthorizationRequestV78(),r=reviewPgLabAuthorizationRequestV78(p);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.approvals)&&Object.isFrozen(p.resources));
 assert.ok(Object.isFrozen(p.isolation)&&Object.isFrozen(p.queryIds)&&Object.isFrozen(p.scenarioIds));
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.issueCodes));
 assert.throws(()=>{r.decision='GO'},TypeError);
 for(const k of ['connect','query','createDatabase','grant','restore','deploy','listen'])assert.equal(k in p,false);
});
