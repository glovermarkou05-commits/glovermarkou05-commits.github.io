'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {audit,REQUIRED}=require('../server/v95-evidence-crosswalk.cjs');
const {main}=require('../scripts/audit-v95-evidence.cjs');
const dir=path.resolve(__dirname,'../docs');
const read=p=>JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'));
const source=()=>[
 read('V67-EVIDENCIAS-PENDIENTES.json'),
 read('V91-MATRIZ-COBERTURA-V67.json'),
 read('V93-PAQUETE-REVISION-INDEPENDIENTE.json'),
 read('V94-MANIFIESTO-DEPENDENCIAS-SIN-EJECUCION.json'),
 read('V95-TRAZABILIDAD-32-CONTROLES-V94B.json')
];
const changed=(fn)=>{const a=source();fn(...a);return()=>audit(...a);};
test('32 canonical cases, unique IDs, no formal PASS',()=>{
 const result=audit(...source());
 assert.equal(result.canonicalV67Pending,32);
 assert.equal(result.formalApproved,0);
 assert.equal(result.productionGo,false);
 assert.equal(REQUIRED.length,32);
});
test('REC-03 moved to lab observed; REC-02 remains partial',()=>{
 const r=audit(...source());
 assert.equal(r.rec02,'PARTIAL_WITH_NEW_LAB_EVIDENCE');
 assert.equal(r.rec03,'LAB_OBSERVED_NOT_FORMALLY_APPROVED');
 assert.deepEqual([r.labObserved,r.partial,r.notExercised],[15,14,3]);
});
test('V94B evidence is exactly the known passing run',()=>{
 const r=audit(...source());
 assert.equal(r.v94RunId,41387289030);
 assert.equal(r.independentReviewerAssigned,false);
});
test('tampered canonical V67 PASS is blocked',()=>{
 assert.throws(changed(v67=>{v67.cases[0].status='PASS'}),/CANONICAL_V67_CHANGED/);
});
test('invented V67 signoff is blocked',()=>{
 assert.throws(changed(v67=>{v67.cases[0].evidenceRef='fabricated'}),/CANONICAL_V67_CHANGED/);
});
test('independent review cannot be fabricated',()=>{
 assert.throws(changed((v67,v91,v93)=>{v93.controls[0].independentReview.status='APPROVED'}),/V93_REVIEW_INVENTED/);
});
test('fake V94 run outcome or unsanitized context is blocked',()=>{
 assert.throws(changed((a,b,c,v94)=>{v94.actualV94BRun.testResults.pgTapPassed=55}),/V94_RUN_NOT_VERIFIED/);
 assert.throws(changed((a,b,c,v94)=>{v94.actualV94BRun.labOnly=false}),/V94_RUN_NOT_VERIFIED/);
});
test('REC-02 cannot be inflated to complete lab coverage',()=>{
 assert.throws(changed((a,b,c,d,v95)=>{
  v95.controls.find(x=>x.id==='REC-02').technicalCoverage='LAB_OBSERVED';
 }),/UNSUPPORTED_COVERAGE/);
});
test('REC-03 cannot be reset to NOT_EXERCISED',()=>{
 assert.throws(changed((a,b,c,d,v95)=>{
  v95.controls.find(x=>x.id==='REC-03').technicalCoverage='NOT_EXERCISED';
 }),/UNSUPPORTED_COVERAGE/);
});
test('false reviewer signature in V95 crosswalk is blocked',()=>{
 assert.throws(changed((a,b,c,d,v95)=>{
  v95.controls.find(x=>x.id==='REC-03').signature='signed';
 }),/FALSE_SIGNOFF/);
});
test('fake V94B evidence linked to HTTP case is blocked',()=>{
 assert.throws(changed((a,b,c,d,v95)=>{
  v95.controls.find(x=>x.id==='HTTP-01').technicalLabEvidence={runId:41387289030};
 }),/UNSUPPORTED_LAB_LINK/);
});
test('duplicate or missing case ID is blocked',()=>{
 assert.throws(changed((a,b,c,d,v95)=>{v95.controls[1].id=v95.controls[0].id}),/BAD_IDS/);
});
test('pending supply chain risks cannot be hidden or approved',()=>{
 assert.throws(changed((a,b,c,d,v95)=>{v95.securityFollowups[0].status='CLOSED'}),/SUPPLY_CHAIN_RISKS_HIDDEN/);
});
test('read-only CLI emits valid JSON and NO_GO',()=>{
 let out='';const rc=main(['--json'],x=>out+=x);
 assert.equal(rc,0,out);
 const json=JSON.parse(out);
 assert.equal(json.mode,'OFFLINE_READ_ONLY');
 assert.equal(json.productionGo,false);
 assert.equal(json.formalApproved,0);
});
test('unexpected CLI arguments blocked',()=>{
 let out='';
 assert.equal(main(['--approve'],x=>out+=x),2);
 assert.match(out,/offline only/);
});
