'use strict';
// V93 — Purely documentary consistency check. Never signs evidence, starts a
// service, executes SQL, approves V67 controls, or changes deployment status.
const {createV67Checklist}=require('./security-acceptance-v67.cjs');
const {auditV91Coverage}=require('./v91-evidence-audit.cjs');
const WORKSTREAMS=Object.freeze([
 'EVIDENCE_REVIEW','OBS_PRIVACY','RESTORE_FULL_SCHEMA','IDENTITY_MFA',
 'SQL_CANCELLATION','INGRESS_TLS','RECOVERY_POLICY','PRODUCTION_RELEASE'
]);
const ordered=x=>JSON.stringify(x);
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(x));
const exactKeys=(x,keys)=>isObject(x)&&
 ordered(Object.keys(x).sort())===ordered([...keys].sort());
const validText=x=>typeof x==='string'&&x.trim().length>=12&&x.length<800;
function auditV93Review({packet,v91,v92,canonical,sourceExists=()=>true}={}){
 const problems=[];
 const issue=x=>{if(!problems.includes(x))problems.push(x);};
 try{
  const v91Result=auditV91Coverage({manifest:v91,canonical,sourceExists});
  if(!v91Result.documentationConsistent)issue('SOURCE_V91_NOT_VERIFIED');
  if(!isObject(v92)||v92.version!=='V92'||
    v92.policyStatus!=='NOT_APPROVED'||
    v92.reviewProcedure?.signOff!=='MISSING'||
    v92.gate?.formalV67Pending!==32||
    v92.gate?.independentlyApproved!==0||
    v92.gate?.decision!=='NO_GO'||v92.gate?.productionAuthorized!==false||
    !Array.isArray(v92.controls)||v92.controls.length!==4||
    v92.controls.some(x=>!x.id?.startsWith('OBS-')||x.signed!==false||
      x.reviewer!=='UNASSIGNED'))
    issue('SOURCE_V92_NOT_UNAPPROVED');
  if(!isObject(packet)||packet.version!=='V93'||
    packet.project!=='MG WEB STUDIO CLOUD'||
    packet.branch!=='feature/mg-digital-v5-web-services'||
    packet.scope!=='READ_ONLY_DOCUMENT_PREPARATION_ONLY'||
    packet.sourceManifest!=='docs/V91-MATRIZ-COBERTURA-V67.json'||
    packet.sourceObservability!=='docs/V92-PAQUETE-REVISION-OBSERVABILIDAD.json'||
    packet.sourceCanonical!=='docs/V67-EVIDENCIAS-PENDIENTES.json'||
    packet.reviewerRequired!=='INDEPENDENT_FROM_AUTHOR'||
    packet.reviewerAssigned!==false||packet.reviewCompleted!==false||
    packet.authorizationProduction!==false||
    !Array.isArray(packet.controls)||packet.controls.length!==32||
    !Array.isArray(packet.workstreams)||packet.workstreams.length!==8)
    issue('V93_PACKET_INVALID');
  const canonicalIds=createV67Checklist().tests.map(x=>x.id);
  const controlled=Array.isArray(packet?.controls)?packet.controls:[];
  const prior=Array.isArray(v91?.controls)?v91.controls:[];
  if(ordered(controlled.map(x=>x?.id))!==ordered(canonicalIds))issue('V93_CONTROL_IDS_MISMATCH');
  const allWorkstreamKeys=Array.isArray(packet?.workstreams)?
    packet.workstreams.map(x=>x?.key):[];
  if(ordered(allWorkstreamKeys)!==ordered(WORKSTREAMS)||
    new Set(allWorkstreamKeys).size!==8)issue('V93_WORKSTREAM_LIST_INVALID');
  const assigned=new Map();
  for(const [index,stream] of (packet?.workstreams||[]).entries()){
    if(!exactKeys(stream,['key','rank','title','ids','operation','approval',
      'readiness','owner','reviewer','next'])||
      stream.key!==WORKSTREAMS[index]||stream.rank!==index+1||
      !validText(stream.title)||!validText(stream.next)||
      !Array.isArray(stream.ids)||stream.ids.length<1||
      !validText(stream.operation)||!validText(stream.approval)||
      !validText(stream.readiness)||
      stream.owner!=='UNASSIGNED'||stream.reviewer!=='UNASSIGNED')
      issue('V93_WORKSTREAM_METADATA_INVALID');
    for(const id of (Array.isArray(stream.ids)?stream.ids:[])){
      if(!canonicalIds.includes(id)||assigned.has(id))
        issue('V93_WORKSTREAM_ASSIGNMENT_DUPLICATED_OR_INVALID');
      assigned.set(id,stream.key);
    }
  }
  if(assigned.size!==32||canonicalIds.some(x=>!assigned.has(x)))
    issue('V93_WORKSTREAM_ASSIGNMENT_INCOMPLETE');
  for(let i=0;i<32;i++){
    const entry=controlled[i],prev=prior[i];
    if(!exactKeys(entry,['id','coverageFromV91','formalStatus',
      'evidenceStages','workstream','remainingAction','independentReview'])||
      !prev||entry.id!==prev.id||
      entry.coverageFromV91!==prev.coverage||
      ordered(entry.evidenceStages)!==ordered(prev.sourceStages)||
      entry.remainingAction!==prev.missing||
      entry.formalStatus!=='PENDING'||
      entry.workstream!==assigned.get(entry.id))
      issue('V93_CONTROL_EVIDENCE_MISMATCH');
    const review=entry?.independentReview;
    if(!exactKeys(review,['status','reviewer','approvalReference','decision'])||
      review.status!=='NOT_REVIEWED'||review.reviewer!=='UNASSIGNED'||
      review.approvalReference!==null||review.decision!==null)
      issue('V93_FALSE_REVIEW_OR_SIGNATURE');
  }
  const r=packet?.readiness;
  if(!exactKeys(r,['total','observedLab','partial','unexercised','formalPending',
    'independentApprovals','unsignedReviewItems','documentaryPreparationDone',
    'anyOperationalExecutionAuthorizedByV93','realPG17Executed',
    'realHttpExecuted','productionPublished','decision'])||
    r.total!==32||r.observedLab!==14||r.partial!==14||
    r.unexercised!==4||r.formalPending!==32||r.independentApprovals!==0||
    r.unsignedReviewItems!==32||r.documentaryPreparationDone!==true||
    r.anyOperationalExecutionAuthorizedByV93!==false||
    r.realPG17Executed!==false||r.realHttpExecuted!==false||
    r.productionPublished!==false||r.decision!=='NO_GO')
    issue('V93_FALSE_READINESS_OR_GO');
 }catch{
   issue('V93_INVALID_INPUT_EXCEPTION');
 }
 return Object.freeze({
  version:'V93',packetConsistent:problems.length===0,
  issueCodes:Object.freeze(problems),
  controlsRecorded:32,labObserved:14,partial:14,notExercised:4,
  reviewAssigned:false,independentReviewPerformed:false,
  formalV67Pending:32,formalV67Approved:0,
  sqlExecuted:false,networkListenerStarted:false,restoredDatabase:false,
  productionPublished:false,productionAuthorized:false,decision:'NO_GO'
 });
}
module.exports={auditV93Review,WORKSTREAMS};
