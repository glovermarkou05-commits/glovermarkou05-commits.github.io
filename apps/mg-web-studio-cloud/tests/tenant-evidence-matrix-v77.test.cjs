'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTenantEvidenceMatrixV77,reviewSyntheticScenarioChecklistV77}
  =require('../server/tenant-evidence-matrix-v77.cjs');
const ref=()=>createTenantEvidenceMatrixV77();
const valid=()=>({source:'SYNTHETIC_PLAN_ONLY',
  scenarios:ref().statuses.map(x=>({...x}))});
test('matrix includes exactly twelve fixed high-risk cases',()=>{
 const matrix=ref();
 assert.equal(matrix.scenarioCount,12);
 assert.deepEqual(matrix.scenarios.map(x=>x.id),[
  'TENANT_01','TENANT_02','TENANT_03','TENANT_04','TENANT_05',
  'TENANT_06','TENANT_07','TENANT_08','RLS_09','RLS_10','RLS_11','RLS_12'
 ]);
});
test('all scenarios remain PENDING with zero real database execution',()=>{
 const m=ref();
 assert.ok(m.statuses.every(x=>x.status==='PENDING'));
 assert.equal(m.readiness.casesRunAgainstDatabase,0);
 assert.equal(m.readiness.independentRlsProof,false);
 assert.equal(m.readiness.decision,'NO_GO');
});
test('foreign org reads deny in both directions',()=>{
 const m=ref();
 assert.equal(m.scenarios.find(x=>x.id==='TENANT_02').expected,'DENY');
 assert.equal(m.scenarios.find(x=>x.id==='TENANT_03').expected,'DENY');
});
test('anonymous, revoked membership and removed scope deny',()=>{
 const m=ref();
 for(const id of ['TENANT_04','TENANT_05','TENANT_06','TENANT_08'])
  assert.equal(m.scenarios.find(x=>x.id===id).expected,'DENY');
});
test('list enumeration and SQL context tests prohibit cross-tenant disclosure',()=>{
 const m=ref();
 for(const id of ['TENANT_07','RLS_12'])
  assert.equal(m.scenarios.find(x=>x.id===id).expected,'DENY');
});
test('dedicated DB role permitted scope is read only and narrow',()=>{
 const m=ref();
 assert.equal(m.scenarios.find(x=>x.id==='RLS_10').expected,'RESTRICTED_SELECT');
 assert.equal(m.scenarios.find(x=>x.id==='RLS_11').expected,'DENY');
});
test('only active scoped own-site scenario can be allowed',()=>{
 const m=ref(),allow=m.scenarios.filter(x=>x.expected.startsWith('ALLOW'));
 assert.equal(allow.length,1);assert.equal(allow[0].id,'TENANT_01');
});
test('matrix and scenario objects are immutable',()=>{
 const m=ref();
 assert.ok(Object.isFrozen(m.scenarios)&&Object.isFrozen(m.statuses));
 assert.ok(m.scenarios.every(Object.isFrozen));assert.ok(m.statuses.every(Object.isFrozen));
 assert.throws(()=>{m.scenarios[0].expected='ALLOW'},TypeError);
});
test('valid synthetic checklist shape never marks isolation proven',()=>{
 const r=reviewSyntheticScenarioChecklistV77(valid());
 assert.equal(r.validPlanShape,true);
 assert.equal(r.casesRunAgainstDatabase,0);
 assert.equal(r.rlsIsolationProven,false);
 assert.equal(r.productionAuthorized,false);
 assert.equal(r.decision,'NO_GO');
});
test('claimed PASS status is rejected even if user supplies supporting text',()=>{
 const v=valid();v.scenarios[0].status='PASS';
 assert.equal(reviewSyntheticScenarioChecklistV77(v).validPlanShape,false);
});
test('claimed actual source is never accepted as synthetic plan',()=>{
 const v=valid();v.source='LIVE_POSTGRES';
 assert.equal(reviewSyntheticScenarioChecklistV77(v).validPlanShape,false);
});
test('incomplete, duplicate, unexpected and reordered cases rejected',()=>{
 const variants=[
  x=>x.scenarios.pop(),x=>x.scenarios.reverse(),x=>x.scenarios[0].id='TENANT_02',
  x=>x.scenarios[0].sql='DELETE FROM public.mg_sites',
  x=>x.scenarios.push({id:'RLS_13',status:'PENDING'})
 ];
 for(const fn of variants){const v=valid();fn(v);
  assert.equal(reviewSyntheticScenarioChecklistV77(v).validPlanShape,false);}
});
test('malformed and inherited objects are not accepted as proof',()=>{
 for(const value of [null,undefined,{},[],3,Object.create(valid())])
  assert.equal(reviewSyntheticScenarioChecklistV77(value).validPlanShape,false);
});
test('raw private evidence is not included in output',()=>{
 const x=valid();x.token='PRIVATE_JWT_AND_DB';
 const r=JSON.stringify(reviewSyntheticScenarioChecklistV77(x));
 assert.ok(!r.includes('PRIVATE_JWT_AND_DB'));
});
test('the 32 operational V67 controls remain pending and unauthorised',()=>{
 const r=ref().readiness;
 assert.equal(r.operationalV67ChecksPassed,0);
 assert.equal(r.operationalV67ChecksPending,32);
 for(const field of ['databaseApproved','networkApproved','restoreApproved','productionApproved'])
  assert.equal(r[field],false);
});
test('no client, query or publish methods exposed from matrix factory',()=>{
 const m=ref();
 for(const key of ['connect','run','query','send','listen','publish','grant','restore'])
  assert.equal(key in m,false);
});
