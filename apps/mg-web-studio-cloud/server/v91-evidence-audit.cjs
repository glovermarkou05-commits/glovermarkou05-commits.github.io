'use strict';
// V91: PURE documentary assessment of the canonical 32 V67 controls.
// References to real CI evidence are analyst-provided and never grant PASS.
// No network, Docker, SQL, subprocess, filesystem or deployment operations.
const {createV67Checklist}=require('./security-acceptance-v67.cjs');

const STAGES=Object.freeze({
 V53:'docs/V53-PRUEBAS-RLS-PGTAP.md',
 V85:'docs/V85-POSTGRES17-EFIMERO-ARRANQUE-AUTORIZADO.md',
 V86:'docs/V86-PRUEBAS-SQL-REALES-RLS-DOS-EMPRESAS.md',
 V87:'docs/V87-EVIDENCIAS-HTTP-LOOPBACK-REALES.md',
 V88:'docs/V88-EVIDENCIA-JWT-FIRMADOS-REVOCACION-MULTIEMPRESA.md',
 V89:'docs/V89-EVIDENCIAS-REALES-LIMITES-CONCURRENCIA-HTTP.md',
 V90:'docs/V90-EVIDENCIAS-PG17-BACKUP-RESTORE-SINTETICO.md'
});
const RUN_IDS=Object.freeze({
 V53:null,V85:40631071278,V86:40631943233,
 V87:40633105863,V88:40633873753,V89:40635697392,
 V90:40640914974
});
const COVERAGE=Object.freeze(['LAB_OBSERVED','PARTIAL','NOT_EXERCISED']);
const EXPECTED_COUNTS=Object.freeze({
 LAB_OBSERVED:14,PARTIAL:14,NOT_EXERCISED:4
});
const sorted=x=>[...x].sort();
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(x));
const keys=(x,expected)=>record(x)&&eq(sorted(Object.keys(x)),sorted(expected));
const SAFE_TEXT=/^[^\x00-\x08\x0B\x0C\x0E-\x1F]{10,300}$/;
const KEYS=['id','coverage','sourceStages','observation','missing','formalStatus'];
function auditV91Coverage({manifest,canonical,sourceExists=()=>true}={}){
 const issues=[];
 const fail=issue=>{if(!issues.includes(issue))issues.push(issue);};
 const catalog=createV67Checklist().tests;
 if(catalog.length!==32)fail('V67_CATALOG_SIZE_CHANGED');
 if(!record(canonical)||!Array.isArray(canonical.cases)||
   canonical.cases.length!==32||canonical.version!=='V67'||
   canonical.decision!=='NO_GO'||
   canonical.deploymentAuthorized!==false||
   canonical.allEvidenceIndependentlyVerified!==false||
   canonical.cases.some(c=>!record(c)||c.status!=='PENDING'||c.evidenceRef!==null)){
    fail('V67_CANONICAL_PENDING_CHANGED');
 }
 const actualIds=Array.isArray(canonical?.cases)?canonical.cases.map(x=>x.id):[];
 const expectedIds=catalog.map(x=>x.id);
 if(!eq(actualIds,expectedIds)||
   (Array.isArray(canonical?.cases)&&canonical.cases.some((c,i)=>
     c.evidenceType!==catalog[i]?.evidenceType))){
   fail('V67_CATALOG_MISMATCH');
 }
 if(!record(manifest)||manifest.version!=='V91'||
   manifest.project!=='MG WEB STUDIO CLOUD'||
   manifest.branch!=='feature/mg-digital-v5-web-services'||
   manifest.intent!=='DOCUMENTARY_AND_OFFLINE_GAP_AUDIT'||
   manifest.sourceCatalog!=='docs/V67-EVIDENCIAS-PENDIENTES.json'||
   !Array.isArray(manifest.controls)||manifest.controls.length!==32){
   fail('V91_MANIFEST_INVALID');
 }
 if(!record(manifest?.sources)||
   !eq(sorted(Object.keys(manifest.sources)),sorted(Object.keys(STAGES)))){
   fail('V91_SOURCE_REGISTRY_MISMATCH');
 }else{
   for(const [name,path] of Object.entries(STAGES)){
     const value=manifest.sources[name];
     if(!keys(value,['report','runId'])||value.report!==path||
       value.runId!==RUN_IDS[name]||
       typeof sourceExists!=='function'||!sourceExists(path)){
       fail('V91_SOURCE_INVALID_OR_MISSING');
     }
   }
 }
 const seen=new Set();
 const counts={LAB_OBSERVED:0,PARTIAL:0,NOT_EXERCISED:0};
 const controls=Array.isArray(manifest?.controls)?manifest.controls:[];
 for(const item of controls){
   if(!keys(item,KEYS)||!expectedIds.includes(item.id)||seen.has(item.id)||
     !COVERAGE.includes(item.coverage)||
     !Array.isArray(item.sourceStages)||
     item.sourceStages.length>7||
     new Set(item.sourceStages).size!==item.sourceStages.length||
     item.sourceStages.some(s=>!Object.hasOwn(STAGES,s))||
     (item.coverage!=='NOT_EXERCISED'&&item.sourceStages.length===0)||
     typeof item.observation!=='string'||!SAFE_TEXT.test(item.observation)||
     typeof item.missing!=='string'||!SAFE_TEXT.test(item.missing)||
     item.formalStatus!=='PENDING'){
     fail('V91_CONTROL_INVALID_OR_OVERCLAIMED');
     continue;
   }
   seen.add(item.id);
   counts[item.coverage]++;
 }
 if(!eq(controls.map(x=>x.id),expectedIds)||seen.size!==32)fail('V91_COVERAGE_INCOMPLETE');
 if(!eq(counts,EXPECTED_COUNTS))fail('V91_COUNT_CHANGED');
 const r=manifest?.reporting;
 if(!record(r)||!eq(
   {LAB_OBSERVED:r.LAB_OBSERVED,PARTIAL:r.PARTIAL,NOT_EXERCISED:r.NOT_EXERCISED},
   counts)||r.total!==32||r.formalPending!==32||
   r.formalIndependentPass!==0||r.productionAuthorized!==false||
   r.decision!=='NO_GO')fail('V91_FORMAL_BOUNDARY_CHANGED');

 return Object.freeze({
   version:'V91',sourceCatalog:'V67',documentationConsistent:issues.length===0,
   issueCodes:Object.freeze(issues),
   // These are evidence classes, never counts of V67 compliance or acceptance.
   evidenceCoverage:Object.freeze({...counts}),
   controlsCatalogued:32,
   formalPending:32,formalIndependentPass:0,
   independentReviewPerformed:false,
   dbTouched:false,networkAccessPerformed:false,restorePerformed:false,
   productionTouched:false,productionAuthorized:false,decision:'NO_GO'
 });
}
module.exports={auditV91Coverage,STAGES,RUN_IDS};
