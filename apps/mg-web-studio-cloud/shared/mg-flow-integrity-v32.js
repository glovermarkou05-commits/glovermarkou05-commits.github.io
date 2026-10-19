/* MG WEB STUDIO CLOUD V32 | Cross-component IN-MEMORY integrity inspection.
 * NO SQL, HTTP, auth, cron, external delivery, storage, rollback or ACID guarantee.
 * All source ledgers, recipient plans and snapshots are CALLER-OWNED TEST FIXTURES.
 * This inspector cannot prove that any transaction actually committed.
 */
(function(root){"use strict";
const VERSION="32.0-review";
const ACTIONS=Object.freeze({
 proposal_created:"draft",proposal_submitted:"submitted",proposal_changes:"needs_changes",
 proposal_revised:"draft",proposal_approved:"approved",
 proposal_rejected:"rejected",proposal_applied:"applied"
});
const EVENT_TO_ACTION=Object.freeze(Object.fromEntries(
 Object.keys(ACTIONS).map(name=>[name,""+name.replace("proposal_","").replace("submitted","submit")
   .replace("created","create").replace("revised","revise")
   .replace("approved","approve").replace("rejected","reject").replace("applied","apply")])));
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const ident=x=>typeof x==="string"&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(x);
const safe=x=>Number.isSafeInteger(x)&&x>=0;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const restricted=(payload)=>({version:VERSION,mode:"combined-read-only-fixtures",
 simulationOnly:true,go:false,stagingReady:false,productionReady:false,
 canRunSQL:false,canDeploy:false,canSend:false,canRepair:false,
 realBackendVerified:false,realDeliveriesVerified:0,redacted:true,...payload});
function inspect(input){
 const violations=[],counts={},record=(code)=>{counts[code]=(counts[code]||0)+1;};
 if(!object(input)||!object(input.workflow)||!object(input.delivery)||
  !Array.isArray(input.workflow.proposals)||!Array.isArray(input.workflow.sites)||
  !Array.isArray(input.workflow.ledger)||!Array.isArray(input.deliverySourceLedger)||
  !Array.isArray(input.plans)||!safe(input.now)||!object(input.deps)||
  !input.deps.audit||typeof input.deps.audit.validate!=="function"||
  !input.deps.contracts||typeof input.deps.contracts.normalizedState!=="function"||
  !input.deps.observability||typeof input.deps.observability.summarize!=="function"||
  !input.deps.backend||typeof input.deps.backend.inspect!=="function"||
  !input.deps.observability.inspectPlan||
  !object(input.documents)||!object(input.documents.backend)||!object(input.documents.monitoring)||
  !input.rehearsal||typeof input.rehearsal.snapshot!=="function"||
  typeof input.rehearsal.reconcile!=="function")
  return restricted({valid:false,code:"INVALID_INPUT",violations:[{code:"INVALID_INPUT",count:1}],
    observationAlerts:[],needsManualReview:true,simulatedCommitProof:false});
 let business,delivery,telemetry,contract,monitor,checkLedger;
 try{
  business=input.workflow;delivery=input.rehearsal.snapshot();
  if(!Array.isArray(delivery.events)||!Array.isArray(delivery.notifications))throw Error("invalid");
  checkLedger=input.deps.audit.validate(business.ledger);
  telemetry=input.deps.observability.summarize(input.rehearsal,input.now);
  contract=input.deps.backend.inspect(input.documents.backend);
  monitor=input.deps.observability.inspectPlan(input.documents.monitoring);
 }catch(e){return restricted({valid:false,code:"INSPECTION_FAILURE",
  violations:[{code:"INSPECTION_FAILURE",count:1}],observationAlerts:[],
  needsManualReview:true,simulatedCommitProof:false});}
 if(!checkLedger||checkLedger.ok!==true)record("AUDIT_CHAIN_INVALID");
 if(!same(business.ledger,input.deliverySourceLedger))record("LEDGER_SOURCE_DRIFT");
 if(!contract||!contract.valid)record("BACKEND_CONTRACT_CHANGED");
 if(!monitor||!monitor.valid)record("MONITORING_PLAN_CHANGED");
 if(!telemetry||!telemetry.valid)record("RECONCILIATION_INVALID");
 // V27 only audits allowed changes; denied events are deliberately NOT business commits.
 const allowed=business.ledger.filter(x=>object(x)&&x.outcome==="allowed"&&
   Object.prototype.hasOwnProperty.call(ACTIONS,x.action));
 const allowedById=new Map(),latest=new Map();
 for(const event of allowed){
  if(allowedById.has(event.eventId))record("DUPLICATE_COMMITTED_EVENT");
  allowedById.set(event.eventId,event);
  const k=[event.organizationId,event.siteId,event.targetId].join("|");
  latest.set(k,event);
 }
 const allProposals=new Map();
 for(const p of business.proposals){
  if(!object(p)||!ident(p.id)||!ident(p.organizationId)||!ident(p.siteId)||
    !Number.isSafeInteger(p.revision)||p.revision<1){
   record("PROPOSAL_FIXTURE_INVALID");continue;
  }
  if(allProposals.has(p.id))record("DUPLICATE_PROPOSAL");
  allProposals.set(p.id,p);
  const source=latest.get([p.organizationId,p.siteId,p.id].join("|"));
  if(!source){record("PROPOSAL_WITHOUT_ALLOWED_EVENT");continue;}
  let normalized;try{normalized=input.deps.contracts.normalizedState(p.status);}catch(e){}
  if(!normalized||!normalized.ok||normalized.state!==ACTIONS[source.action])
    record("PROPOSAL_LAST_STATE_DRIFT");
 }
 for(const event of allowed){
  const p=allProposals.get(event.targetId);
  if(!p||p.organizationId!==event.organizationId||p.siteId!==event.siteId)
   record("COMMITTED_TARGET_NOT_FOUND");
 }
 const plans=new Map();
 for(const plan of input.plans){
  if(!object(plan)||!ident(plan.auditEventId)||!Array.isArray(plan.recipients)||
   plan.recipients.some(x=>!ident(x))||
   new Set(plan.recipients).size!==plan.recipients.length){
   record("INVALID_DELIVERY_PLAN");continue;
  }
  if(plans.has(plan.auditEventId))record("DUPLICATE_DELIVERY_PLAN");
  plans.set(plan.auditEventId,plan.recipients);
  if(!allowedById.has(plan.auditEventId))record("PLAN_NOT_COMMITTED");
 }
 // An empty recipients[] explicitly opts out, never silently assumes delivery.
 for(const event of allowed)
  if(!plans.has(event.eventId))record("INCOMPLETE_DELIVERY_PLAN");
 const expected=new Map(),seen=new Set();
 for(const [auditId,recipients] of plans){
  const event=allowedById.get(auditId);if(!event)continue;
  for(const recipient of recipients){
   const key=auditId+"|"+recipient;
   expected.set(key,event);
  }
 }
 for(const event of delivery.events){
  if(!object(event)||!ident(event.id)||!ident(event.auditEventId)||!ident(event.recipientId)){
   record("INVALID_OUTBOX_FIXTURE");continue;
  }
  if(seen.has(event.id))record("DUPLICATE_OUTBOX_ID");
  seen.add(event.id);
  const k=event.auditEventId+"|"+event.recipientId,source=expected.get(k);
  if(!source){record("UNEXPECTED_OUTBOX_DELIVERY");continue;}
  const p=allProposals.get(event.proposalId);
  if(source.organizationId!==event.organizationId||source.siteId!==event.siteId||
   source.targetId!==event.proposalId||
   EVENT_TO_ACTION[source.action]!==event.action)
   record("OUTBOX_COMMITTED_SCOPE_DRIFT");
  if(!p||!Number.isSafeInteger(event.revision)||event.revision>p.revision||
   event.revision<1)record("OUTBOX_REVISION_AHEAD");
 }
 for(const k of expected.keys()){
  const found=delivery.events.filter(e=>object(e)&&e.auditEventId+"|"+e.recipientId===k);
  if(found.length===0)record("MISSING_EXPECTED_OUTBOX");
  if(found.length>1)record("DUPLICATE_EXPECTED_OUTBOX");
 }
 // V31 checkpoints compare outbox snapshots. They do NOT establish persistence.
 if(input.previous!==undefined){
  let comparison;
  try{comparison=input.deps.observability.compare(input.previous,delivery);}
  catch(e){comparison={valid:false};}
  if(!comparison||comparison.valid!==true)record("CHECKPOINT_REGRESSION");
 }
 // Never emit PII identifiers, raw proposal text, event IDs or other fixture data.
 for(const code of Object.keys(counts))violations.push({code,count:counts[code]});
 const observed=telemetry&&Array.isArray(telemetry.alerts)?
  telemetry.alerts.map(x=>({code:x.code,severity:x.severity,count:x.count})):[];
 const valid=violations.length===0;
 return restricted({valid,code:valid?"STATIC_CONSISTENCY_ONLY":"COMBINED_FAILURES_FOUND",
  violations,observationAlerts:observed,needsManualReview:!valid||observed.length>0,
  proposalsChecked:business.proposals.length,allowedEventsChecked:allowed.length,
  expectedDeliveryTargets:expected.size,outboxEventsChecked:delivery.events.length,
  notificationsChecked:delivery.notifications.length,simulatedCommitProof:false,
  missedCommissionsCanExist:true});
}
function inspectMatrix(matrix){
 const issues=[],add=k=>issues.push(k);
 if(!object(matrix)||matrix.format!=="mg-web-studio/v32-combined-fault-review"||
  matrix.version!==32||matrix.project!=="MG WEB STUDIO CLOUD"||
  matrix.branch!=="feature/mg-digital-v5-web-services")add("WRONG_PROJECT");
 if(!object(matrix)||matrix.authorizationGranted!==false||matrix.environment!==null)
  add("AUTHORIZATION_CHANGED");
 const flags=matrix&&matrix.execution;
 const names=["mayRunSQL","mayProvision","mayDeploy","mayPublish","maySendEmail",
  "maySendPush","mayScheduleCron","mayCallPaidAI","mayCharge"];
 if(!object(flags)||flags.reviewOnly!==true||!names.every(k=>flags[k]===false)||
  Object.keys(flags).some(k=>k!=="reviewOnly"&&!names.includes(k)))add("EXECUTION_CHANGED");
 if(!Array.isArray(matrix&&matrix.cases)||matrix.cases.length!==24)add("FAULT_MATRIX_CHANGED");
 else for(let i=0;i<24;i++){
  const c=matrix.cases[i];
  if(!object(c)||c.id!=="F"+String(i+1).padStart(2,"0")||
   typeof c.objective!=="string"||c.objective.length<16||
   c.evidenceStatus!=="NOT_EXECUTED"||c.evidenceRef!==null)
    add("EVIDENCE_CLAIMED");
 }
 const gate=matrix&&matrix.result;
 if(!object(gate)||gate.realBackendTests!==0||gate.realAlertsSent!==0||
  gate.staging!=="NO_GO"||gate.production!=="NO_GO")add("GO_CLAIMED");
 return restricted({valid:issues.length===0,issues:[...new Set(issues)],
  checksPending:24,realBackendTests:0,realAlertsSent:0,simulatedCommitProof:false});
}
root.MGFlowIntegrityV32=Object.freeze({version:VERSION,inspect,inspectMatrix});
})(typeof window!=="undefined"?window:globalThis);
