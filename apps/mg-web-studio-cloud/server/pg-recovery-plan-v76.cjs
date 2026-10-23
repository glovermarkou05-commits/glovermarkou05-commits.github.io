'use strict';

// V76 offline preflight ONLY. No backup, SQL, restore, filesystem or network IO.
const EXACT = Object.freeze(['postgresMajor','target','dataClass','backupOrigin',
  'networkEnabled','restorePerformed','checksumsTested','rpoRtoMeasured',
  'isolatedResourcesDefined','rollbackDocumented','approvals']);
const APPROVAL_KEYS = Object.freeze(['database','network','restore','production']);
const plain=x=>x!==null && typeof x==='object' && !Array.isArray(x) &&
  [Object.prototype,null].includes(Object.getPrototypeOf(x));
const shape=(x,keys)=>plain(x) && Object.keys(x).length===keys.length &&
  keys.every(k=>Object.hasOwn(x,k));
const codes=Object.freeze([
  'PG17_REQUIRED','ISOLATED_SYNTHETIC_TARGET_REQUIRED',
  'NO_NETWORK_OR_RESTORE_AUTHORIZED','RESOURCE_AND_ROLLBACK_PLAN_REQUIRED',
  'APPROVALS_MUST_REMAIN_PENDING'
]);
function reviewRecoveryPreflightV76(spec) {
  const issues=[];
  if (!shape(spec,EXACT)) {
    issues.push('RECOVERY_PLAN_SCHEMA_INVALID');
  } else {
    if(spec.postgresMajor!==17)issues.push(codes[0]);
    if(spec.target!=='UNBOUND_LOCAL_PG17' || spec.dataClass!=='SYNTHETIC_ONLY' ||
        spec.backupOrigin!=='GENERATED_FIXTURE')issues.push(codes[1]);
    if(spec.networkEnabled!==false || spec.restorePerformed!==false ||
        spec.checksumsTested!==false || spec.rpoRtoMeasured!==false)issues.push(codes[2]);
    if(spec.isolatedResourcesDefined!==true || spec.rollbackDocumented!==true)issues.push(codes[3]);
    if(!shape(spec.approvals,APPROVAL_KEYS) ||
        APPROVAL_KEYS.some(k=>spec.approvals[k]!=='PENDING'))issues.push(codes[4]);
  }
  return Object.freeze({
    planningShapeAccepted:issues.length===0,
    issueCodes:Object.freeze([...new Set(issues)].sort()),
    evidenceClass:'OFFLINE_RECOVERY_PLAN_ONLY',
    backupRestored:false, backupChecksumVerified:false,
    pointInTimeRecoveryTested:false, rpoRtoMeasured:false,
    postgresConnected:false, approvalsGranted:false,
    v67RecoveryChecksPassed:0, v67RecoveryChecksPending:4,
    deploymentAuthorized:false,decision:'NO_GO'
  });
}
function createSyntheticRecoveryPlanV76(){
  return Object.freeze({
    postgresMajor:17,target:'UNBOUND_LOCAL_PG17',dataClass:'SYNTHETIC_ONLY',
    backupOrigin:'GENERATED_FIXTURE',networkEnabled:false,
    restorePerformed:false,checksumsTested:false,rpoRtoMeasured:false,
    isolatedResourcesDefined:true,rollbackDocumented:true,
    approvals:Object.freeze({database:'PENDING',network:'PENDING',
      restore:'PENDING',production:'PENDING'})
  });
}
module.exports={reviewRecoveryPreflightV76,createSyntheticRecoveryPlanV76};
