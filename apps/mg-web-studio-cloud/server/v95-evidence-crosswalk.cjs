'use strict';
// V95 pure evidence-reconciliation guard. No IO/network/SQL and NO approvals.
const REQUIRED=Object.freeze([
 'HTTP-01','HTTP-02','HTTP-03','HTTP-04','HTTP-05','HTTP-06','HTTP-07',
 'HTTP-08','HTTP-09','HTTP-10','HTTP-11','HTTP-12','HTTP-13','HTTP-14',
 'LOAD-01','LOAD-02','LOAD-03','OBS-01','OBS-02','OBS-03','OBS-04',
 'AUTH-01','AUTH-02','AUTH-03','DATA-01','DATA-02',
 'REC-01','REC-02','REC-03','REC-04','OPS-01','OPS-02'
]);
const bad=(x)=>new Error('V95_AUDIT_BLOCKED_'+x);
function requireExactSet(rows,field='id'){
 if(!Array.isArray(rows)||rows.length!==32)throw bad('BAD_COUNT');
 const ids=rows.map(x=>x?.[field]);
 if(new Set(ids).size!==32||REQUIRED.some(x=>!ids.includes(x)))throw bad('BAD_IDS');
}
function audit(v67,v91,v93,v94,v95){
 if(!v67||!v91||!v93||!v94||!v95)throw bad('MISSING_SOURCE');
 requireExactSet(v67.cases);requireExactSet(v91.controls);requireExactSet(v93.controls);requireExactSet(v95.controls);
 if(v67.decision!=='NO_GO'||v67.deploymentAuthorized===true||
    v67.allEvidenceIndependentlyVerified!==false||
    v67.cases.some(x=>x.status!=='PENDING'||x.evidenceRef!==null))throw bad('CANONICAL_V67_CHANGED');
 if(v93.reviewerAssigned!==false||v93.reviewCompleted!==false||
    v93.authorizationProduction!==false||
    v93.controls.some(c=>c.formalStatus!=='PENDING'||
      c.independentReview?.status!=='NOT_REVIEWED'||
      c.independentReview?.reviewer!=='UNASSIGNED'||
      c.independentReview?.approvalReference!==null||
      c.independentReview?.decision!==null))throw bad('V93_REVIEW_INVENTED');
 if(v94.productionAuthorized!==false||v94.v67?.formalPending!==32||
    v94.v67?.formalPass!==0||v94.v67?.decision!=='NO_GO')throw bad('V94_FORMAL_STATUS_CHANGED');
 const run=v94.actualV94BRun;
 if(run?.workflowRunId!==41387289030||run?.jobId!==125090834612||
    run?.conclusion!=='completed/success'||run.labOnly!==true||
    run.productionGo!==false||run.independenceVerified!==false||
    run.testResults?.staticPassed!==17||run.testResults?.pgTapPassed!==56||
    run.testResults?.restoredMgTables!==16||
    run.testResults?.sourceDestinationSnapshotsEqual!==true||
    run.testResults?.rollbackClean!==true||
    run.testResults?.containersRemoved!==2)throw bad('V94_RUN_NOT_VERIFIED');
 if(v95.canonicalV67Status!=='32_PENDING_0_PASS'||
    v95.productionAuthorization!==false||
    v95.independentReviewerAssigned!==false||
    v95.labEvidenceDoesNotImplyFormalPass!==true||
    v95.verifiedLab?.runId!==run.workflowRunId||
    v95.verifiedLab?.pgTapPassed!==56||v95.verifiedLab?.staticTestsPassed!==17)throw bad('V95_UNTRUSTWORTHY');
 const m91=new Map(v91.controls.map(c=>[c.id,c]));
 const counts={LAB_OBSERVED:0,PARTIAL:0,NOT_EXERCISED:0};
 for(const c of v95.controls){
  const a=m91.get(c.id);
  if(c.formalStatus!=='PENDING'||c.formalEvidenceRef!==null||
     c.reviewer!=='UNASSIGNED'||c.independentDecision!=='NOT_REVIEWED'||
     c.signature!==null||c.productionImpact!=='NONE')throw bad('FALSE_SIGNOFF');
  const expected=c.id==='REC-03'?'LAB_OBSERVED':a.coverage;
  if(c.technicalCoverage!==expected)throw bad('UNSUPPORTED_COVERAGE');
  const expectedStages=[...new Set([...a.sourceStages,...(['REC-02','REC-03'].includes(c.id)?['V94B']:[])])];
  if(!Array.isArray(c.technicalStages)||JSON.stringify(c.technicalStages)!==JSON.stringify(expectedStages))
    throw bad('SOURCE_STAGE_MISMATCH');
  const isRecovery=['REC-02','REC-03'].includes(c.id);
  if(isRecovery){
   if(c.technicalLabEvidence?.runId!==run.workflowRunId||
      c.technicalLabEvidence?.pgTap56Passed!==true||
      c.technicalLabEvidence?.formalSignoff!==false)
     throw bad('RECOVERY_EVIDENCE_UNVERIFIED');
  }else if(c.technicalLabEvidence!==null)throw bad('UNSUPPORTED_LAB_LINK');
  if(!Object.hasOwn(counts,c.technicalCoverage))throw bad('UNSUPPORTED_CLASS');
  counts[c.technicalCoverage]++;
 }
 if(counts.LAB_OBSERVED!==15||counts.PARTIAL!==14||counts.NOT_EXERCISED!==3||
    v95.coverageSummary?.LAB_OBSERVED!==15||
    v95.coverageSummary?.PARTIAL!==14||
    v95.coverageSummary?.NOT_EXERCISED!==3||
    v95.coverageSummary?.formalApproved!==0||
    v95.coverageSummary?.total!==32)throw bad('MISLEADING_COUNTS');
 if(!Array.isArray(v95.securityFollowups)||v95.securityFollowups.length<3||
    v95.securityFollowups.some(s=>s.status!=='OPEN'||s.executionAuthorized!==false))
  throw bad('SUPPLY_CHAIN_RISKS_HIDDEN');
 return Object.freeze({
  verified:true,canonicalV67Pending:32,formalApproved:0,
  independentReviewerAssigned:false,productionGo:false,
  labObserved:15,partial:14,notExercised:3,
  rec02:'PARTIAL_WITH_NEW_LAB_EVIDENCE',rec03:'LAB_OBSERVED_NOT_FORMALLY_APPROVED',
  v94RunId:41387289030,
  reviewIssue:8,
  noDbOrDeploymentActions:true
 });
}
module.exports={audit,REQUIRED};
