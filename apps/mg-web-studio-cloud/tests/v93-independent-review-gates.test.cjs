'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {auditV93Review,WORKSTREAMS}=
 require('../server/v93-independent-review-audit.cjs');
const {createV67Checklist}=require('../server/security-acceptance-v67.cjs');
const {main:cli}=require('../scripts/audit-v93-review-gates.cjs');
const root=path.resolve(__dirname,'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'docs',name),'utf8'));
function fresh(){
 return {
  packet:read('V93-PAQUETE-REVISION-INDEPENDIENTE.json'),
  v91:read('V91-MATRIZ-COBERTURA-V67.json'),
  v92:read('V92-PAQUETE-REVISION-OBSERVABILIDAD.json'),
  canonical:read('V67-EVIDENCIAS-PENDIENTES.json'),
  sourceExists:relative=>fs.existsSync(path.join(root,relative))
 };
}
function bad(edit,expected){
 const x=fresh();edit(x);
 const result=auditV93Review(x);
 assert.equal(result.packetConsistent,false,JSON.stringify(result));
 assert.ok(result.issueCodes.includes(expected),JSON.stringify(result.issueCodes));
 assert.equal(result.formalV67Approved,0);
 assert.equal(result.decision,'NO_GO');
}
test('V93 real V91/V92 canonical inputs produce a consistent read-only dossier',()=>{
 const r=auditV93Review(fresh());
 assert.equal(r.packetConsistent,true,JSON.stringify(r.issueCodes));
 assert.deepEqual(r.issueCodes,[]);
 assert.equal(Object.isFrozen(r),true);
});
test('exactly 32 controls in canonical V67 order and 8 separate workstreams',()=>{
 const {packet}=fresh();
 assert.deepEqual(packet.controls.map(x=>x.id),
  createV67Checklist().tests.map(x=>x.id));
 assert.deepEqual(packet.workstreams.map(x=>x.key),WORKSTREAMS);
 assert.equal(packet.workstreams.length,8);
});
test('every V67 control assigned to exactly one workstream, no duplicates',()=>{
 const x=fresh().packet,all=x.workstreams.flatMap(w=>w.ids);
 assert.equal(all.length,32);
 assert.equal(new Set(all).size,32);
 assert.deepEqual([...all].sort(),x.controls.map(c=>c.id).sort());
});
test('no case has a reviewer, decision, approval reference or formal PASS',()=>{
 const x=fresh().packet;
 for(const c of x.controls){
  assert.equal(c.formalStatus,'PENDING');
  assert.deepEqual(c.independentReview,{
   status:'NOT_REVIEWED',reviewer:'UNASSIGNED',
   approvalReference:null,decision:null
  });
 }
});
test('14 observed, 14 partial, 4 not executed, none formally validated',()=>{
 const r=auditV93Review(fresh());
 assert.deepEqual([r.labObserved,r.partial,r.notExercised],[14,14,4]);
 assert.equal(r.formalV67Pending,32);
 assert.equal(r.formalV67Approved,0);
 assert.equal(r.independentReviewPerformed,false);
});
test('V93 cannot authorize a network listener, DB test or production',()=>{
 const r=auditV93Review(fresh());
 for(const key of ['sqlExecuted','networkListenerStarted','restoredDatabase',
  'productionPublished','productionAuthorized','reviewAssigned']){
  assert.equal(r[key],false,key);
 }
});
test('REC-03 remains NOT_EXERCISED despite historical V53 and V90',()=>{
 const x=fresh().packet.controls.find(c=>c.id==='REC-03');
 assert.equal(x.coverageFromV91,'NOT_EXERCISED');
 assert.deepEqual(x.evidenceStages,['V90','V53']);
 assert.equal(x.formalStatus,'PENDING');
 assert.equal(x.workstream,'RESTORE_FULL_SCHEMA');
});
test('AUTH-01..03 and DATA-01/02 remain gated workstreams',()=>{
 const {packet}=fresh();
 for(const id of ['AUTH-01','AUTH-02','AUTH-03']){
  assert.equal(packet.controls.find(c=>c.id===id).workstream,'IDENTITY_MFA');
 }
 for(const id of ['DATA-01','DATA-02']){
  assert.equal(packet.controls.find(c=>c.id===id).workstream,'SQL_CANCELLATION');
 }
});
test('V92 OBS-01..04 remain unapproved and no alert is armed',()=>{
 const {packet,v92}=fresh();
 assert.ok(packet.controls.filter(x=>x.id.startsWith('OBS-'))
  .every(x=>x.workstream==='OBS_PRIVACY'&&x.formalStatus==='PENDING'));
 assert.equal(v92.reviewProcedure.signOff,'MISSING');
 assert.ok(v92.proposedAlerts.every(x=>x.active===false));
});
test('reviewer and owner of each workstream remain unassigned',()=>{
 const x=fresh().packet;
 assert.ok(x.workstreams.every(w=>w.owner==='UNASSIGNED'&&w.reviewer==='UNASSIGNED'));
 assert.equal(x.reviewerAssigned,false);
 assert.equal(x.reviewCompleted,false);
});
test('V93 cannot silently convert formal PENDING to PASS',()=>{
 bad(x=>x.packet.controls[0].formalStatus='PASS','V93_CONTROL_EVIDENCE_MISMATCH');
 bad(x=>x.canonical.cases[0].status='PASS','SOURCE_V91_NOT_VERIFIED');
});
test('V93 refuses fake human signature or decision',()=>{
 bad(x=>x.packet.controls[0].independentReview.decision='APPROVED','V93_FALSE_REVIEW_OR_SIGNATURE');
 bad(x=>x.packet.controls[0].independentReview.reviewer='fake@example.test','V93_FALSE_REVIEW_OR_SIGNATURE');
 bad(x=>x.packet.controls[0].independentReview.approvalReference='forged','V93_FALSE_REVIEW_OR_SIGNATURE');
});
test('V93 rejects fabricated publication authorization and GO',()=>{
 bad(x=>x.packet.authorizationProduction=true,'V93_PACKET_INVALID');
 bad(x=>x.packet.readiness.decision='GO','V93_FALSE_READINESS_OR_GO');
 bad(x=>x.packet.readiness.productionPublished=true,'V93_FALSE_READINESS_OR_GO');
});
test('missing/duplicated workstream controls are detected',()=>{
 bad(x=>x.packet.workstreams[0].ids.push('AUTH-01'),
  'V93_WORKSTREAM_ASSIGNMENT_DUPLICATED_OR_INVALID');
 bad(x=>x.packet.workstreams[0].ids.pop(),
  'V93_WORKSTREAM_ASSIGNMENT_INCOMPLETE');
});
test('V91 coverage cannot be fabricated higher in V93',()=>{
 bad(x=>x.packet.controls.find(c=>c.id==='REC-03').coverageFromV91='LAB_OBSERVED',
  'V93_CONTROL_EVIDENCE_MISMATCH');
});
test('source matrices cannot change behind the review dossier',()=>{
 bad(x=>x.v91.controls[0].coverage='PARTIAL','SOURCE_V91_NOT_VERIFIED');
 bad(x=>x.v92.policyStatus='APPROVED','SOURCE_V92_NOT_UNAPPROVED');
});
test('V93 refuses operation run markers or prior approvals',()=>{
 bad(x=>x.packet.readiness.realPG17Executed=true,'V93_FALSE_READINESS_OR_GO');
 bad(x=>x.packet.readiness.anyOperationalExecutionAuthorizedByV93=true,
  'V93_FALSE_READINESS_OR_GO');
 bad(x=>x.packet.readiness.independentApprovals=1,'V93_FALSE_READINESS_OR_GO');
});
test('offline CLI runs, outputs bounded summary and never a PASS',()=>{
 let output='';
 const code=cli(['--json'],s=>{output+=s;});
 assert.equal(code,0,output.slice(0,300));
 const r=JSON.parse(output);
 assert.equal(r.report.packetConsistent,true);
 assert.equal(r.report.formalV67Approved,0);
 assert.equal(r.workstreams.length,8);
 assert.equal(r.workstreams.reduce((sum,x)=>sum+x.caseCount,0),32);
 assert.equal(r.report.decision,'NO_GO');
});
test('CLI denies arbitrary command flags',()=>{
 let output='';
 const code=cli(['--deploy'],x=>output+=x);
 assert.equal(code,2);
 assert.match(output,/solo admite --json/);
});
test('CLI has syntax and no external network or deployment imports',()=>{
 const names=['server/v93-independent-review-audit.cjs',
  'scripts/audit-v93-review-gates.cjs'];
 for(const name of names){
  const loc=path.join(root,name);
  const x=spawnSync(process.execPath,['--check',loc],{encoding:'utf8',timeout:3000});
  assert.equal(x.status,0,x.stderr);
  const src=fs.readFileSync(loc,'utf8');
  assert.doesNotMatch(src,/\brequire\(['"](?:node:)?(?:http|https|net|child_process|pg|pg-promise)['"]\)/);
  assert.doesNotMatch(src,/\.listen\(|\.connect\(|\.spawn\(|\.exec\(/);
 }
});
