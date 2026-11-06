'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assess,fromDisk,markdown,main}=require('../qa/v123-release-progress.cjs');
const root=path.resolve(__dirname,'..');
const read=(n)=>JSON.parse(fs.readFileSync(path.join(root,'docs',n),'utf8'));
const source=()=>({
 v67:read('V67-EVIDENCIAS-PENDIENTES.json'),
 v95:read('V95-TRAZABILIDAD-32-CONTROLES-V94B.json'),
 v114:JSON.parse(fs.readFileSync(path.join(root,'proposals/v114-qa-review-manifest.json'),'utf8'))
});
test('V123 estimate derives from 15 observed, 14 partial and 3 not exercised',()=>{
 const r=fromDisk();
 assert.deepEqual(r.counts,{LAB_OBSERVED:15,PARTIAL:14,NOT_EXERCISED:3,total:32});
 assert.equal(r.technicalExactPercent,68.75);
 assert.equal(r.technicalPercent,69);
 assert.equal(r.technicalRemainingPercent,31);
 assert.equal(r.source,'V95_COVERAGE_2026_11_02');
});
test('V123 does not confuse technical estimate with formal readiness',()=>{
 const r=fromDisk();
 assert.equal(r.formalControlsApproved,0);
 assert.equal(r.formalControlsPending,32);
 assert.equal(r.formalApprovalPercent,0);
 assert.equal(r.releaseReady,false);
 assert.equal(r.qaSqlAuthorized,false);
 assert.equal(r.productionAuthorized,false);
 assert.equal(r.productionDecision,'NO_GO');
});
test('V123 always advertises unknown live Auth session policies and pending reviewer',()=>{
 const r=fromDisk();
 assert.equal(r.authSessionPolicies,'UNVERIFIED');
 assert.equal(r.independentReviewerAssigned,false);
 assert.equal(r.requiredGates.length,5);
 assert.ok(r.requiredGates.includes('AUTH_SESSION_POLICIES_DASHBOARD_UNVERIFIED'));
});
test('V123 rejects fake formal PASS in V67',()=>{
 const a=source();a.v67.cases[0].status='PASS';
 assert.throws(()=>assess(a),/CANONICAL_V67_NOT_PENDING/);
});
test('V123 rejects fake formal PASS in V95',()=>{
 const a=source();a.v95.controls[1].formalStatus='PASS';
 assert.throws(()=>assess(a),/FALSE_FORMAL_SIGNOFF/);
});
test('V123 rejects reviewer identity fabricated in V95',()=>{
 const a=source();a.v95.independentReviewerAssigned=true;
 assert.throws(()=>assess(a),/FALSE_FORMAL_SIGNOFF/);
});
test('V123 rejects missing, extra or duplicated controls',()=>{
 const a=source();a.v95.controls[1].id=a.v95.controls[0].id;
 assert.throws(()=>assess(a),/CONTROL_IDS_MISMATCH/);
 const b=source();b.v67.cases.pop();
 assert.throws(()=>assess(b),/CANONICAL_V67_NOT_PENDING/);
});
test('V123 rejects unverified technical coverage promotions',()=>{
 const a=source();a.v95.controls.find(x=>x.technicalCoverage==='PARTIAL').technicalCoverage='LAB_OBSERVED';
 assert.throws(()=>assess(a),/TECHNICAL_BASELINE_CHANGED_REVIEW_REQUIRED/);
});
test('V123 rejects misleading modified summary',()=>{
 const a=source();a.v95.coverageSummary.LAB_OBSERVED=16;
 assert.throws(()=>assess(a),/TECHNICAL_BASELINE_CHANGED_REVIEW_REQUIRED/);
});
test('V123 rejects fake QA SQL approval',()=>{
 const a=source();a.v114.authorizedSql=true;
 assert.throws(()=>assess(a),/QA_RELEASE_GATE_CHANGED_REVIEW_REQUIRED/);
});
test('V123 rejects fake owner/reviewer approval',()=>{
 const a=source();a.v114.review.ownerApproval='APPROVED';
 assert.throws(()=>assess(a),/QA_RELEASE_GATE_CHANGED_REVIEW_REQUIRED/);
 const b=source();b.v114.review.independentReview='APPROVED';
 assert.throws(()=>assess(b),/QA_RELEASE_GATE_CHANGED_REVIEW_REQUIRED/);
});
test('V123 rejects altered project reference and Data API unchecked status',()=>{
 const a=source();a.v114.qaProjectRef='another-project';
 assert.throws(()=>assess(a),/QA_RELEASE_GATE_CHANGED_REVIEW_REQUIRED/);
 const b=source();b.v114.review.dataApi='VERIFIED';
 assert.throws(()=>assess(b),/QA_RELEASE_GATE_CHANGED_REVIEW_REQUIRED/);
});
test('V123 markdown bar includes clear percentage and 0/32 formal warning',()=>{
 const md=markdown(fromDisk());
 assert.match(md,/69%/);
 assert.match(md,/31%/);
 assert.match(md,/0\/32 \(0%\)/);
 assert.match(md,/NO_GO/);
 assert.equal(md.includes('production approved'),false);
});
test('V123 CLI remains read-only and blocks invalid commands',()=>{
 assert.equal(main(['--approve']),2);
 assert.equal(main(['--migrate']),2);
});
test('V123 implementation contains no DB, HTTP, credential or migration actions',()=>{
 const s=fs.readFileSync(path.join(root,'qa/v123-release-progress.cjs'),'utf8');
 for(const denied of ["require('pg')",'process.env','fetch(','CREATE ROLE',
  'GRANT SELECT','apply_migration','execute_sql','getAccessToken(',
  'productionAuthorized:true','qaSqlAuthorized:true']){
  assert.equal(s.includes(denied),false,denied);
 }
});
