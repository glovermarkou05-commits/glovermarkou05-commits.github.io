'use strict';
// V123: documentary progress estimator, not deployment readiness.
// No network, credentials, database, approvals, migration or GitHub actions.
const fs=require('node:fs');
const path=require('node:path');
const CLASS=Object.freeze({LAB_OBSERVED:1,PARTIAL:0.5,NOT_EXERCISED:0});
const EXPECTED=Object.freeze({LAB_OBSERVED:15,PARTIAL:14,NOT_EXERCISED:3});
const REQUIRED_GATES=Object.freeze([
 'HUMAN_INDEPENDENT_REVIEW_NOT_ASSIGNED',
 'QA_DDL_SCOPED_OWNER_APPROVAL_MISSING',
 'AUTH_SESSION_POLICIES_DASHBOARD_UNVERIFIED',
 'REAL_AUTH_MFA_AND_BUSINESS_INTEGRATION_UNVERIFIED',
 'V67_32_FORMAL_CONTROLS_NOT_APPROVED'
]);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function assess({v67,v95,v114}={}){
 if(!v67||!v95||!v114||!Array.isArray(v67.cases)||!Array.isArray(v95.controls))
  throw new Error('V123_SOURCES_MISSING');
 if(v67.cases.length!==32||v95.controls.length!==32||
  v67.decision!=='NO_GO'||v67.deploymentAuthorized!==false||
  v67.allEvidenceIndependentlyVerified!==false||
  v67.cases.some(x=>x.status!=='PENDING'||x.evidenceRef!==null))
  throw new Error('V123_CANONICAL_V67_NOT_PENDING');
 const ids=v67.cases.map(x=>x.id);
 const mapped=v95.controls.map(x=>x.id);
 if(new Set(ids).size!==32||new Set(mapped).size!==32||
   ids.some(x=>!mapped.includes(x)))throw new Error('V123_CONTROL_IDS_MISMATCH');
 if(v95.canonicalV67Status!=='32_PENDING_0_PASS'||
   v95.independentReviewerAssigned!==false||
   v95.productionAuthorization!==false||
   v95.labEvidenceDoesNotImplyFormalPass!==true||
   v95.controls.some(x=>x.formalStatus!=='PENDING'||x.formalEvidenceRef!==null||
     x.reviewer!=='UNASSIGNED'||x.independentDecision!=='NOT_REVIEWED'||x.signature!==null))
  throw new Error('V123_FALSE_FORMAL_SIGNOFF');
 const counts={LAB_OBSERVED:0,PARTIAL:0,NOT_EXERCISED:0};
 for(const c of v95.controls){
  if(!own(CLASS,c.technicalCoverage))throw new Error('V123_UNKNOWN_COVERAGE');
  counts[c.technicalCoverage]++;
 }
 if(Object.keys(EXPECTED).some(k=>counts[k]!==EXPECTED[k]||
     v95.coverageSummary?.[k]!==EXPECTED[k])||
    v95.coverageSummary?.formalApproved!==0||
    v95.coverageSummary?.total!==32)
  throw new Error('V123_TECHNICAL_BASELINE_CHANGED_REVIEW_REQUIRED');
 if(v114.qaProjectRef!=='tbfhiqkivsoeuudlpkgi'||
    v114.pullRequest!==7||v114.authorizedSql!==false||
    v114.production!=='NO_GO'||v114.formalV67Pass!==0||
    v114.review?.dba!=='PENDING'||
    v114.review?.independentReview!=='PENDING'||
    v114.review?.ownerApproval!=='PENDING'||
    v114.review?.rollback!=='PENDING'||
    v114.review?.dataApi!=='USER_REPORTED_SAVED_RECHECK_REQUIRED')
  throw new Error('V123_QA_RELEASE_GATE_CHANGED_REVIEW_REQUIRED');
 const technicalExact=100*(counts.LAB_OBSERVED+
  0.5*counts.PARTIAL)/32;
 const technicalPercent=Math.round(technicalExact);
 return Object.freeze({
  status:'TECHNICAL_ESTIMATE_ONLY',source:'V95_COVERAGE_2026_11_02',
  scoring:'LAB_OBSERVED_100_PERCENT_PARTIAL_50_PERCENT_NOT_EXERCISED_ZERO',
  technicalPercent,technicalRemainingPercent:100-technicalPercent,
  technicalExactPercent:technicalExact,
  counts:Object.freeze({...counts,total:32}),
  formalControlsApproved:0,formalControlsPending:32,formalApprovalPercent:0,
  releaseReady:false,qaSqlAuthorized:false,productionAuthorized:false,
  productionDecision:'NO_GO',authSessionPolicies:'UNVERIFIED',
  independentReviewerAssigned:false,requiredGates:Object.freeze([...REQUIRED_GATES])
 });
}
function fromDisk(){
 const root=path.resolve(__dirname,'..');
 const docs=name=>JSON.parse(fs.readFileSync(path.join(root,'docs',name),'utf8'));
 const v114=JSON.parse(fs.readFileSync(path.join(root,'proposals/v114-qa-review-manifest.json'),'utf8'));
 return assess({
  v67:docs('V67-EVIDENCIAS-PENDIENTES.json'),
  v95:docs('V95-TRAZABILIDAD-32-CONTROLES-V94B.json'),
  v114
 });
}
function markdown(report){
 const filled=Math.round(report.technicalPercent/5);
 return [
  '# MG Web Studio — progreso estimado (V123)',
  '',
  'Avance técnico V95: **'+report.technicalPercent+'%**; pendiente estimado: **'+report.technicalRemainingPercent+'%**.',
  '',
  '['+'█'.repeat(filled)+'░'.repeat(20-filled)+'] '+report.technicalPercent+'%',
  '',
  'Base: 15 observados ×100%, 14 parciales ×50%, 3 no ensayados ×0%, dividido entre 32.',
  '',
  '**¡NO es porcentaje de producción lista!** Aprobación formal V67: **0/32 (0%)**.',
  '',
  'Políticas Auth reales no verificadas. Revisión independiente no asignada.',
  '',
  'Estado: **NO_GO**; Supabase QA DDL **no autorizado**; PR #7 **draft/no merge**.'
 ].join('\n')+'\n';
}
function main(args=process.argv.slice(2)){
 if(args.length!==1||!['--json','--markdown'].includes(args[0])){
  process.stdout.write('V123 read-only usage: --json or --markdown\n');
  return 2;
 }
 try{
  const r=fromDisk();
  process.stdout.write(args[0]==='--json'?JSON.stringify(r,null,2)+'\n':markdown(r));
  return 0;
 }catch(e){
  process.stdout.write(JSON.stringify({status:'BLOCKED',decision:'NO_GO',
   code:String(e?.message||'V123_SOURCE_ERROR')})+'\n');
  return 1;
 }
}
if(require.main===module)process.exitCode=main();
module.exports={assess,fromDisk,markdown,main,REQUIRED_GATES};
