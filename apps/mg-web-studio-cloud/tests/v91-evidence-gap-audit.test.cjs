'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {auditV91Coverage,STAGES,RUN_IDS}=
 require('../server/v91-evidence-audit.cjs');
const {createV67Checklist}=require('../server/security-acceptance-v67.cjs');
const ROOT=path.resolve(__dirname,'..');
const base=()=>({
 manifest:JSON.parse(fs.readFileSync(path.join(ROOT,'docs/V91-MATRIZ-COBERTURA-V67.json'),'utf8')),
 canonical:JSON.parse(fs.readFileSync(path.join(ROOT,'docs/V67-EVIDENCIAS-PENDIENTES.json'),'utf8')),
 sourceExists:x=>fs.existsSync(path.join(ROOT,x))
});
test('V91 reconciles canonical 32 IDs with the complete published coverage matrix',()=>{
 const report=auditV91Coverage(base());
 assert.equal(report.documentationConsistent,true,report.issueCodes.join(','));
 assert.deepEqual(report.issueCodes,[]);
 assert.equal(report.controlsCatalogued,32);
});
test('14 laboratory observations, 14 partial, 4 not exercised, NONE a formal pass',()=>{
 const r=auditV91Coverage(base());
 assert.deepEqual(r.evidenceCoverage,
  {LAB_OBSERVED:14,PARTIAL:14,NOT_EXERCISED:4});
 assert.equal(r.formalPending,32);assert.equal(r.formalIndependentPass,0);
 assert.equal(r.independentReviewPerformed,false);assert.equal(r.decision,'NO_GO');
});
test('canonical V67 original remains all PENDING with null references',()=>{
 const {canonical}=base();
 assert.equal(canonical.cases.length,32);
 assert.ok(canonical.cases.every(x=>x.status==='PENDING'&&x.evidenceRef===null));
 assert.equal(canonical.decision,'NO_GO');
});
test('report IDs and order match V67 catalogue, not 21 probe names',()=>{
 const {manifest}=base(),catalog=createV67Checklist().tests;
 assert.deepEqual(manifest.controls.map(x=>x.id),catalog.map(x=>x.id));
 assert.ok(!manifest.controls.some(x=>x.id==='HTTP-01B'||x.id==='HTTP-14-PARTIAL'));
});
test('all referred files really exist in this checkout, no arbitrary file targets',()=>{
 const {manifest}=base();
 for(const source of Object.values(manifest.sources)){
  assert.ok(Object.values(STAGES).includes(source.report),source.report);
  assert.ok(fs.statSync(path.join(ROOT,source.report)).isFile(),source.report);
 }
 assert.deepEqual(Object.keys(manifest.sources).sort(),Object.keys(STAGES).sort());
});
test('each V85-V90 reference maps to exact successful run ID verified in audit',()=>{
 const {manifest}=base();
 for(const name of ['V85','V86','V87','V88','V89','V90']){
  assert.equal(manifest.sources[name].runId,RUN_IDS[name]);
  assert.equal(manifest.sources[name].report,STAGES[name]);
 }
});
test('OBS-03/04, REC-03 and OPS-02 are explicitly NOT exercised',()=>{
 const {manifest}=base();
 assert.deepEqual(manifest.controls.filter(x=>x.coverage==='NOT_EXERCISED')
  .map(x=>x.id),['OBS-03','OBS-04','REC-03','OPS-02']);
});
test('HTTP-06, HTTP-10 and HTTP-14 remain partial; proxy not invented',()=>{
 const {manifest}=base();
 for(const id of ['HTTP-06','HTTP-10','HTTP-14'])
  assert.equal(manifest.controls.find(x=>x.id===id).coverage,'PARTIAL');
});
test('AUTH-03 is partial because fake aal2 is NOT real MFA',()=>{
 const {manifest}=base();
 const x=manifest.controls.find(x=>x.id==='AUTH-03');
 assert.equal(x.coverage,'PARTIAL');
 assert.match(x.missing,/MFA/);
});
test('DATA-02 is partial because no underlying SQL cancellation happened',()=>{
 const {manifest}=base();
 const x=manifest.controls.find(x=>x.id==='DATA-02');
 assert.equal(x.coverage,'PARTIAL');
 assert.match(x.missing,/cancelación/);
});
test('REC-02 is only partial due to simplified fixture, not full MG schema',()=>{
 const {manifest}=base();
 const x=manifest.controls.find(x=>x.id==='REC-02');
 assert.equal(x.coverage,'PARTIAL');
 assert.match(x.missing,/esquemas completos/);
});
test('V53 historical pgTAP does not imply REC-03 performed on recovered PG17',()=>{
 const {manifest}=base();
 const x=manifest.controls.find(x=>x.id==='REC-03');
 assert.equal(x.coverage,'NOT_EXERCISED');
 assert.ok(x.sourceStages.includes('V53')&&x.sourceStages.includes('V90'));
});
test('V91 rejects a manually set PASS in the coverage manifest',()=>{
 const input=base();
 input.manifest.controls[0].formalStatus='PASS';
 const r=auditV91Coverage(input);
 assert.equal(r.documentationConsistent,false);
 assert.ok(r.issueCodes.includes('V91_CONTROL_INVALID_OR_OVERCLAIMED'));
 assert.equal(r.formalIndependentPass,0);
});
test('V91 rejects any PASS or evidence reference in canonical JSON',()=>{
 const input=base();
 input.canonical.cases[0].status='PASS';
 input.canonical.cases[0].evidenceRef='evidence/v67/HTTP-01.json';
 const r=auditV91Coverage(input);
 assert.equal(r.documentationConsistent,false);
 assert.ok(r.issueCodes.includes('V67_CANONICAL_PENDING_CHANGED'));
 assert.equal(r.decision,'NO_GO');
});
test('V91 rejects forged production authorization in either input',()=>{
 const x=base();x.manifest.reporting.productionAuthorized=true;
 assert.ok(auditV91Coverage(x).issueCodes.includes('V91_FORMAL_BOUNDARY_CHANGED'));
 const y=base();y.canonical.deploymentAuthorized=true;
 assert.ok(auditV91Coverage(y).issueCodes.includes('V67_CANONICAL_PENDING_CHANGED'));
});
test('V91 rejects missing or malicious source files',()=>{
 const x=base();x.sourceExists=()=>false;
 assert.ok(auditV91Coverage(x).issueCodes.includes('V91_SOURCE_INVALID_OR_MISSING'));
 const y=base();y.manifest.sources.V87.report='../secret';
 assert.ok(auditV91Coverage(y).issueCodes.includes('V91_SOURCE_INVALID_OR_MISSING'));
});
test('V91 rejects missing cases, duplicate IDs and fabricated check IDs',()=>{
 for(const mutate of [
  x=>x.manifest.controls.pop(),
  x=>{x.manifest.controls[1].id='HTTP-01';},
  x=>{x.manifest.controls[1].id='HTTP-99';}
 ]){
  const x=base();mutate(x);
  assert.equal(auditV91Coverage(x).documentationConsistent,false);
 }
});
test('V91 rejects changes to evidence counts or promotional coverage labels',()=>{
 const x=base();x.manifest.controls[0].coverage='PASS';
 assert.ok(auditV91Coverage(x).issueCodes.includes('V91_CONTROL_INVALID_OR_OVERCLAIMED'));
 const y=base();y.manifest.reporting.LAB_OBSERVED=32;
 assert.ok(auditV91Coverage(y).issueCodes.includes('V91_FORMAL_BOUNDARY_CHANGED'));
});
test('V91 rejects source stage with no corresponding verified archive',()=>{
 const x=base();
 x.manifest.controls[0].sourceStages=['V99'];
 assert.ok(auditV91Coverage(x).issueCodes.includes('V91_CONTROL_INVALID_OR_OVERCLAIMED'));
});
test('V91 remains a pure, non-operational review',()=>{
 const r=auditV91Coverage(base());
 for(const k of ['dbTouched','networkAccessPerformed','restorePerformed',
  'productionTouched','productionAuthorized'])
  assert.equal(r[k],false,k);
 assert.equal(Object.isFrozen(r),true);
});
