'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assessV99SandboxReadiness,REQUIRED,PURPOSE}=require('../server/v99-sandbox-readiness.cjs');

function futureCandidate(overrides={}) {
  return {
    projectPurpose:PURPOSE,
    projectState:'ACTIVE_HEALTHY',
    dataClass:'SYNTHETIC_ONLY',
    evidenceSource:'INDEPENDENTLY_REVIEWED',
    roles:'SERVER_ONLY_LEAST_PRIVILEGE',
    evaluatedOn:'2026-11-02',
    flags:Object.fromEntries(REQUIRED.map(k=>[k,true])),
    ...overrides
  };
}
test('no sandbox selected blocks all remote actions',()=>{
 const r=assessV99SandboxReadiness(null);
 assert.equal(r.candidateReadyForHumanReview,false);
 assert.deepEqual(r.reasonCodes,['INVALID_OR_MISSING_INPUT']);
 for(const key of ['remoteConnectionAllowed','queriesAllowed','credentialsAllowed',
    'sqlAllowed','usersCreationAllowed','mfaChallengeAllowed','productionAllowed',
    'githubMergeAllowed'])assert.equal(r[key],false,key);
 assert.equal(r.formalV67Pass,0);
 assert.equal(r.formalV67Pending,32);
});
test('future synthetic, independently approved candidate only reaches human review',()=>{
 const r=assessV99SandboxReadiness(futureCandidate());
 assert.equal(r.candidateReadyForHumanReview,true);
 assert.deepEqual(r.reasonCodes,[]);
 assert.equal(r.nextAction,'REQUEST_NEW_SCOPED_OPERATOR_AUTHORIZATION');
 assert.equal(r.remoteConnectionAllowed,false);
 assert.equal(r.queriesAllowed,false);
 assert.equal(r.sqlAllowed,false);
 assert.equal(r.productionAllowed,false);
 assert.ok(Object.isFrozen(r));
 assert.ok(Object.isFrozen(r.reasonCodes));
});
test('inactive MG STAGING is blocked and cannot be rebranded as sandbox',()=>{
 const r=assessV99SandboxReadiness(futureCandidate({
    projectPurpose:'MG_WEB_STUDIO_CLOUD_STAGING',projectState:'INACTIVE'
 }));
 assert.equal(r.candidateReadyForHumanReview,false);
 assert.ok(r.reasonCodes.includes('NOT_DEDICATED_MG_WEB_STUDIO_SANDBOX'));
 assert.ok(r.reasonCodes.includes('PROJECT_NOT_ACTIVE_HEALTHY'));
});
test('another active loyalty project is not a dedicated MG Auth sandbox',()=>{
 const r=assessV99SandboxReadiness(futureCandidate({
   projectPurpose:'REGALADITOS_CLUB',dataClass:'EXISTING_USERS'
 }));
 assert.equal(r.candidateReadyForHumanReview,false);
 assert.ok(r.reasonCodes.includes('NOT_SYNTHETIC_ONLY'));
});
test('each required security approval blocks independently if missing',()=>{
 for(const key of REQUIRED){
  const c=futureCandidate();c.flags[key]=false;
  const r=assessV99SandboxReadiness(c);
  assert.equal(r.candidateReadyForHumanReview,false,key);
  assert.ok(r.reasonCodes.includes(key.toUpperCase()+'_PENDING'),key);
  assert.equal(r.remoteConnectionAllowed,false);
 }
});
test('reject unrecognized project identifier fields and accidental credential blobs',()=>{
 for(const field of ['projectId','projectRef','url','apikey','service_role',
    'password','token','userEmail','userId','jwt','dbHost']){
  const x=futureCandidate();x[field]='SECRET_NEVER_LOG';
  const r=assessV99SandboxReadiness(x);
  assert.equal(r.candidateReadyForHumanReview,false,field);
  assert.deepEqual(r.reasonCodes,['INVALID_OR_MISSING_INPUT']);
  assert.doesNotMatch(JSON.stringify(r),/SECRET_NEVER_LOG/);
 }
});
test('reject hidden flags and non-booleans that look truthy',()=>{
 for(const bad of ['true',1,{},[],null,'yes',undefined]){
  const x=futureCandidate();x.flags.ownerApprovedScope=bad;
  assert.equal(assessV99SandboxReadiness(x).candidateReadyForHumanReview,false);
 }
});
test('reject extra flags, missing flags and wrong flag shape',()=>{
 for(const x of [
  {...futureCandidate(),flags:{...futureCandidate().flags,ownerOverride:true}},
  {...futureCandidate(),flags:{ownerApprovedScope:true}},
  {...futureCandidate(),flags:null},
  {...futureCandidate(),flags:['ownerApprovedScope']},
 ]){
  const r=assessV99SandboxReadiness(x);
  assert.ok(r.reasonCodes.includes('INVALID_CONTROL_SET'));
 }
});
test('reject changing the reviewed snapshot date without new check',()=>{
 for(const evaluatedOn of ['2026-11-01','2026-11-03',null,'today']){
  const r=assessV99SandboxReadiness(futureCandidate({evaluatedOn}));
  assert.equal(r.candidateReadyForHumanReview,false);
  assert.ok(r.reasonCodes.includes('INVENTORY_REQUIRES_NEW_DATE_SCOPED_REVIEW'));
 }
});
test('cannot assert fresh MFA evidence based only on an aal2 claim',()=>{
 const x=futureCandidate();x.flags.recentMfaServerEventAvailable=false;
 x.flags.factorTimestampProvenanceReviewed=false;
 const r=assessV99SandboxReadiness(x);
 assert.equal(r.candidateReadyForHumanReview,false);
 assert.ok(r.reasonCodes.some(v=>v.includes('MFA')));
});
test('cannot approve sandbox if project real data, cost, secrets or reviewer are unchecked',()=>{
 for(const key of ['noProductionData','separateBillingReviewed','serverOnlySecretsPlan',
   'independentSecurityReviewerAssigned','rollbackAndDeletionPlanReviewed']){
  const x=futureCandidate();delete x.flags[key];
  assert.equal(assessV99SandboxReadiness(x).candidateReadyForHumanReview,false);
 }
});
test('reject unknown objects, arrays and exceptions without network',()=>{
 for(const input of [undefined,[],{},'approved',0,new Date(),
   Object.create(null)]){
  const result=assessV99SandboxReadiness(input);
  assert.equal(result.productionAllowed,false);
 }
});
test('readiness module has no network, filesystem write, Docker or SQL commands',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../server/v99-sandbox-readiness.cjs'),'utf8');
 for(const forbidden of ['createClient(', 'fetch(', 'require(\'pg\')',
   'child_process','execFile(', 'createServer(', 'listen(', 'supabase.auth.',
   'docker run','INSERT INTO ','SELECT * FROM ','writeFile(','console.log(']){
   assert.equal(src.includes(forbidden),false,forbidden);
 }
});
test('all 15 checks are explicit and non-duplicated',()=>{
 assert.equal(REQUIRED.length,15);
 assert.equal(new Set(REQUIRED).size,15);
});
