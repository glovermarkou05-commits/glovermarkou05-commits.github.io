'use strict';

// V78 manual-only operations checklist. No executor or transition to APPROVED.
const {createPgLabAuthorizationRequestV78,reviewPgLabAuthorizationRequestV78}=
  require('./pg-lab-authorization-v78.cjs');
const PHASES=Object.freeze([
  Object.freeze({id:'PRE_01',category:'preflight',requiredApproval:'database',
    task:'Identify isolated PG17 host, measured disk/RAM/CPU, ownership and snapshot provenance',
    exitEvidence:'Operator-reviewed inventory; host unavailable until explicit grant'}),
  Object.freeze({id:'PRE_02',category:'preflight',requiredApproval:'network',
    task:'Review outbound firewall, DNS/TLS, port scope, statement timeout and abort behavior',
    exitEvidence:'Written network authorization, without opening ports automatically'}),
  Object.freeze({id:'PRE_03',category:'preflight',requiredApproval:'sqlRead',
    task:'Verify dedicated read-only role, effective inherited GRANTs, RLS and no elevated authority',
    exitEvidence:'Redacted catalog results independently reviewed by DB administrator'}),
  Object.freeze({id:'PRE_04',category:'preflight',requiredApproval:'tenantFixtures',
    task:'Obtain two truly synthetic organizations and identities in an isolated disposable lab',
    exitEvidence:'Fixture origin, pseudonymous IDs and isolation evidence'}),
  Object.freeze({id:'RUN_05',category:'dry_run',requiredApproval:'sqlRead',
    task:'Review seven V77 catalog SELECT statements; assess compatibility before any manual execution',
    exitEvidence:'Reviewed SQL, operator signature and stop conditions'}),
  Object.freeze({id:'RUN_06',category:'dry_run',requiredApproval:'tenantFixtures',
    task:'Define expected outcomes for all 12 V77 tenant and RLS scenarios',
    exitEvidence:'Case-specific evidence plan with expected allow/deny outcomes'}),
  Object.freeze({id:'RUN_07',category:'dry_run',requiredApproval:'tenantFixtures',
    task:'Specify identity/claims verification, revoked sessions, cross-tenant and unknown-role denial',
    exitEvidence:'Negative-case matrix with reviewer and unperformed status'}),
  Object.freeze({id:'END_08',category:'cleanup',requiredApproval:'database',
    task:'Review rollback and fixture disposal with explicit approval before any destructive operation',
    exitEvidence:'Independent cleanup request; do not restore, drop or reset automatically'}),
  Object.freeze({id:'END_09',category:'cleanup',requiredApproval:'restore',
    task:'Propose separate PG17 recovery exercise including checksum and RPO/RTO measurements',
    exitEvidence:'Restore permission remains independent and pending'}),
  Object.freeze({id:'END_10',category:'review',requiredApproval:'production',
    task:'Independently reconcile 32 V67 operational controls and reject auto-promotion',
    exitEvidence:'Production decision only from future separate reviewed evidence'})
]);
const LIMITS=Object.freeze({
  readOnlyCatalogQueries:7,tenantNegativeAndPositiveCases:12,
  pg17OperationalEvidencePassed:0,v67Pending:32,
  databaseConnectionAllowed:false,networkAllowed:false,
  fixtureWritesAllowed:false,restoreAllowed:false,productionAllowed:false,
  decision:'NO_GO'
});
const plain=v=>v!==null && typeof v==='object'&&!Array.isArray(v)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v));
function createPgLabRunbookV78(){
  return Object.freeze({request:createPgLabAuthorizationRequestV78(),
    tasks:PHASES,statuses:Object.freeze(PHASES.map(x=>Object.freeze({id:x.id,status:'PENDING'}))),
    readiness:LIMITS});
}
function reviewPgLabRunbookV78(candidate){
  let shape=plain(candidate)&&Object.keys(candidate).length===3 &&
    Object.hasOwn(candidate,'request')&&Object.hasOwn(candidate,'statuses')&&
    Object.hasOwn(candidate,'origin')&&candidate.origin==='SYNTHETIC_RUNBOOK_ONLY';
  const approval=shape?reviewPgLabAuthorizationRequestV78(candidate.request):null;
  const statuses=shape&&Array.isArray(candidate.statuses)&&candidate.statuses.length===PHASES.length&&
    candidate.statuses.every((entry,i)=>plain(entry)&&Object.keys(entry).length===2 &&
      entry.id===PHASES[i].id&&entry.status==='PENDING');
  shape=Boolean(shape&&approval?.syntheticPlanningShapeValid&&statuses);
  return Object.freeze({syntheticRunbookShapeValid:shape,
    tasksExecuted:0,queriesExecuted:0,tenantCasesExecuted:0,
    approvalsGranted:false,recoveryPerformed:false,v67Pending:32,
    actualPgEvidenceValidated:false,productionAuthorized:false,decision:'NO_GO'});
}
module.exports={createPgLabRunbookV78,reviewPgLabRunbookV78};
