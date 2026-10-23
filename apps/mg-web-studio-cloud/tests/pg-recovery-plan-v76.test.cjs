'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reviewRecoveryPreflightV76,createSyntheticRecoveryPlanV76}
  =require('../server/pg-recovery-plan-v76.cjs');
const make=()=>structuredClone(createSyntheticRecoveryPlanV76());
const rejects=(change,code)=>{
 const p=make();change(p);
 const r=reviewRecoveryPreflightV76(p);
 assert.equal(r.planningShapeAccepted,false);assert.ok(r.issueCodes.includes(code));
 assert.equal(r.decision,'NO_GO');
};
test('synthetic planning shape passes but RESTORE always remains NO_GO',()=>{
 const p=make(),r=reviewRecoveryPreflightV76(p);
 assert.equal(r.planningShapeAccepted,true);assert.deepEqual(r.issueCodes,[]);
 for(const field of ['backupRestored','backupChecksumVerified','pointInTimeRecoveryTested',
   'rpoRtoMeasured','postgresConnected','approvalsGranted','deploymentAuthorized'])
   assert.equal(r[field],false);
 assert.equal(r.v67RecoveryChecksPassed,0);
 assert.equal(r.v67RecoveryChecksPending,4);assert.equal(r.decision,'NO_GO');
});
test('empty/malformed and inherited recovery structures rejected',()=>{
 for(const p of [undefined,null,{},[],34,'SECRET',Object.create(make())]){
   const r=reviewRecoveryPreflightV76(p);
   assert.equal(r.planningShapeAccepted,false);
   assert.ok(r.issueCodes.includes('RECOVERY_PLAN_SCHEMA_INVALID'));
 }
});
test('unknown backup credentials and claims cannot be slipped into plan',()=>{
 rejects(p=>p.password='PRIVATE','RECOVERY_PLAN_SCHEMA_INVALID');
});
test('PostgreSQL 17 is the only planning target',()=>{
 rejects(p=>p.postgresMajor=16,'PG17_REQUIRED');
 rejects(p=>p.postgresMajor='17','PG17_REQUIRED');
});
test('target must be offline local and unbound',()=>{
 rejects(p=>p.target='SUPABASE_PRODUCTION','ISOLATED_SYNTHETIC_TARGET_REQUIRED');
 rejects(p=>p.target='STAGING','ISOLATED_SYNTHETIC_TARGET_REQUIRED');
});
test('real client data and actual backups forbidden in the plan',()=>{
 rejects(p=>p.dataClass='PRODUCTION_DATA','ISOLATED_SYNTHETIC_TARGET_REQUIRED');
 rejects(p=>p.backupOrigin='LIVE_BACKUP','ISOLATED_SYNTHETIC_TARGET_REQUIRED');
});
test('plan does not enable even local network without separate approval',()=>{
 rejects(p=>p.networkEnabled=true,'NO_NETWORK_OR_RESTORE_AUTHORIZED');
});
test('cannot claim successful restore in preflight',()=>{
 rejects(p=>p.restorePerformed=true,'NO_NETWORK_OR_RESTORE_AUTHORIZED');
});
test('cannot invent checksum verification or recovery time measurement',()=>{
 rejects(p=>p.checksumsTested=true,'NO_NETWORK_OR_RESTORE_AUTHORIZED');
 rejects(p=>p.rpoRtoMeasured=true,'NO_NETWORK_OR_RESTORE_AUTHORIZED');
});
test('resource inventory for isolated lab must be documented',()=>{
 rejects(p=>p.isolatedResourcesDefined=false,'RESOURCE_AND_ROLLBACK_PLAN_REQUIRED');
});
test('rollback procedure must be documented before lab',()=>{
 rejects(p=>p.rollbackDocumented=false,'RESOURCE_AND_ROLLBACK_PLAN_REQUIRED');
});
test('database, network, restore and production approvals remain independent and pending',()=>{
 for(const key of ['database','network','restore','production'])
   rejects(p=>p.approvals[key]='APPROVED','APPROVALS_MUST_REMAIN_PENDING');
});
test('extra or missing approvals are rejected',()=>{
 rejects(p=>p.approvals.force=true,'APPROVALS_MUST_REMAIN_PENDING');
 rejects(p=>delete p.approvals.restore,'APPROVALS_MUST_REMAIN_PENDING');
});
test('no secret strings or arbitrary payload appear in the report',()=>{
 const p=make();p.backupOrigin='SECRET_PASSWORD';p.networkEnabled=true;
 const r=JSON.stringify(reviewRecoveryPreflightV76(p));
 assert.ok(!r.includes('SECRET'));assert.ok(!r.includes('PASSWORD'));
});
test('immutable planning/report values and no executable actions are exposed',()=>{
 const p=createSyntheticRecoveryPlanV76(),r=reviewRecoveryPreflightV76(p);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.approvals));
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.issueCodes));
 assert.throws(()=>r.issueCodes.push('GO'),TypeError);
 for(const name of ['restore','connect','listen','deploy','apply','sql','migrate'])assert.equal(name in r,false);
});
test('real RPO RTO restore and checksum outcomes cannot become true on any plan',()=>{
 for(const value of [make(),{...make(),restorePerformed:true},null]){
   const r=reviewRecoveryPreflightV76(value);
   assert.equal(r.backupRestored,false);assert.equal(r.rpoRtoMeasured,false);
   assert.equal(r.pointInTimeRecoveryTested,false);assert.equal(r.backupChecksumVerified,false);
 }
});
