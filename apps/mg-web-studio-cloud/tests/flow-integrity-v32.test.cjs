"use strict";
/* V32: cross-module fixture failures, all static/in-memory, NO backend, SQL, HTTP.
 * node apps/mg-web-studio-cloud/tests/flow-integrity-v32.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const w={};
for(const name of ["mg-contracts-v20.js","mg-tenant-security-v23.js","mg-audit-trail-v24.js",
 "mg-proposal-flow-v27.js","mg-outbox-reconciliation-v30.js","mg-observability-v31.js",
 "mg-backend-contract-v29.js","mg-flow-integrity-v32.js"])
 new Function("window",read("shared/"+name))(w);
const C=w.MGWebContractsV20,S=w.MGTenantSecurityV23,A=w.MGAuditTrailV24,
 P=w.MGProposalFlowV27,D=w.MGOutboxReconciliationV30,
 M=w.MGObservabilityV31,B=w.MGBackendContractV29,F=w.MGFlowIntegrityV32;
let n=0;function check(label,value){assert.ok(value,label);n++;}
const clone=x=>JSON.parse(JSON.stringify(x));
const directory=()=>({
 organizations:[{id:"orgA",status:"active"},{id:"orgB",status:"active"}],
 sites:[{id:"siteA",organizationId:"orgA",status:"draft"},
  {id:"siteB",organizationId:"orgB",status:"draft"}],
 memberships:[
  {id:"mOwner",userId:"ownerA",organizationId:"orgA",role:"CLIENT_OWNER",status:"active"},
  {id:"mViewer",userId:"viewerA",organizationId:"orgA",role:"CLIENT_VIEWER",status:"active"},
  {id:"mOther",userId:"ownerB",organizationId:"orgB",role:"CLIENT_OWNER",status:"active"}],
 scopes:[{membershipId:"mViewer",siteId:"siteA",organizationId:"orgA",status:"active"}],
 sessions:["staff","ownerA","viewerA","ownerB"].map(userId=>({
  id:"session_"+userId,userId,aal:userId==="staff"?"aal2":"aal1",
  status:"active",expiresAt:50000})),
 staff:[{userId:"staff",role:"SUPERADMIN",status:"active"}]
});
const session=userId=>({verified:true,userId,sessionId:"session_"+userId});
let now=100,serial=0,dir=directory();
const business=P.createWorkflow({directory:()=>dir,contracts:C,security:S,audit:A,
 initial:{sites:[{id:"siteA",organizationId:"orgA",draftVersion:1,
   pages:[{slug:"home",title:"Inicio"}]}],proposals:[],ledger:[]}});
const request=(action,user,revision)=>({action,trustedSession:session(user),
 organizationId:"orgA",siteId:"siteA",proposalId:"proposalA",expectedRevision:revision,
 expectedDraftVersion:1,operationId:"operation_"+(++serial),eventId:"audit"+serial,now:now++});
const r1=business.execute(request("create","staff",0));
const r2=business.execute(request("submit","staff",1));
const r3=business.execute(request("approve","ownerA",1));
check("Three successful business actions",r1.ok&&r2.ok&&r3.ok);
const workflow=business.snapshot(),ledger=clone(workflow.ledger);
check("Three allowed audit records",ledger.length===3&&ledger.every(e=>e.outcome==="allowed"));
check("V24 integrity fixture valid",A.validate(ledger).ok);
const docs={
 backend:JSON.parse(read("staging/v29-backend-contract.review.json")),
 monitoring:JSON.parse(read("staging/v31-observability.review.json"))
};
const expected=[
 {auditEventId:"audit1",recipients:[]},
 {auditEventId:"audit2",recipients:[]},
 {auditEventId:"audit3",recipients:["ownerA"]}
];
const initial=()=>({events:[],notifications:[]});
const makeDelivery=(snapshot=initial(),source=ledger)=>D.createRehearsal({
 directory:()=>dir,security:S,audit:A,ledger:source,initial:snapshot
});
const delivery=makeDelivery();
const msg={receipt:r3,action:"approve",organizationId:"orgA",siteId:"siteA",
 recipientId:"ownerA",eventId:"outboxA",auditEventId:"audit3",now:120};
const en=delivery.enqueue(msg);
check("V30 source enqueued",en.ok&&!en.replayed);
check("V30 snapshot valid",delivery.reconcile().valid);
const input=(changes={})=>({workflow,deliverySourceLedger:ledger,plans:expected,
 rehearsal:delivery,now:200,documents:docs,
 deps:{contracts:C,audit:A,observability:M,backend:B},...changes});
const baseline=F.inspect(input());
check("V32 version",F.version==="32.0-review");
check("Baseline internally coherent",baseline.valid&&baseline.violations.length===0);
check("Baseline correct code",baseline.code==="STATIC_CONSISTENCY_ONLY");
check("NO GO even if coherent",!baseline.go&&!baseline.stagingReady&&!baseline.productionReady);
check("No SQL",!baseline.canRunSQL&&!baseline.canDeploy);
check("No repair",!baseline.canRepair&&!baseline.canSend);
check("Not an atomic commit proof",baseline.simulatedCommitProof===false);
check("Cannot rule out missing commits",baseline.missedCommissionsCanExist);
check("Source counts",baseline.proposalsChecked===1&&baseline.allowedEventsChecked===3);
check("Expected delivery count",baseline.expectedDeliveryTargets===1);
check("Outbox count",baseline.outboxEventsChecked===1);
check("Notification count",baseline.notificationsChecked===1);
check("Telemetry warns pending age",baseline.observationAlerts.some(a=>a.code==="STALE_PENDING"));
check("Attention required",baseline.needsManualReview===true);
check("No tenant output",!JSON.stringify(baseline).includes("orgA"));
check("No user output",!JSON.stringify(baseline).includes("ownerA"));
check("No proposal output",!JSON.stringify(baseline).includes("proposalA"));
check("No event ID output",!JSON.stringify(baseline).includes("audit3"));
check("No raw notes",!JSON.stringify(baseline).includes("notes"));
check("V32 input unchanged",JSON.stringify(workflow)===JSON.stringify(business.snapshot()));
check("V30 input unchanged",delivery.snapshot().events.length===1);
const has=(result,code)=>Array.isArray(result.violations)&&result.violations.some(x=>x.code===code&&x.count>0);
function fault(name,change,code){
 const parts=input();
 change(parts);
 const result=F.inspect(parts);
 check(name+" rejected",!result.valid&&has(result,code));
 check(name+" no GO",result.go===false&&!result.canRunSQL&&!result.canRepair);
 check(name+" never leaks tenant",!JSON.stringify(result).includes("orgA"));
 return result;
}
const zero=makeDelivery();
fault("missing outbox",p=>p.rehearsal=zero,"MISSING_EXPECTED_OUTBOX");
const unexpected=makeDelivery();
check("Unplanned submit event successfully enqueued in isolated fixture",
 unexpected.enqueue({...msg,receipt:r2,action:"submit",auditEventId:"audit2",eventId:"outboxB"}).ok);
fault("unexpected outbox event",p=>p.rehearsal=unexpected,"UNEXPECTED_OUTBOX_DELIVERY");
fault("missing source ledger",p=>p.deliverySourceLedger=ledger.slice(0,2),"LEDGER_SOURCE_DRIFT");
fault("business last state changed",p=>{p.workflow=clone(workflow);p.workflow.proposals[0].status="draft";},
 "PROPOSAL_LAST_STATE_DRIFT");
fault("additional unsigned proposal",p=>{p.workflow=clone(workflow);p.workflow.proposals.push({
 id:"proposalGhost",organizationId:"orgA",siteId:"siteA",status:"draft",revision:1
 });},"PROPOSAL_WITHOUT_ALLOWED_EVENT");
fault("duplicate plan",p=>p.plans=expected.concat([expected[2]]),"DUPLICATE_DELIVERY_PLAN");
fault("incomplete plan",p=>p.plans=expected.slice(1),"INCOMPLETE_DELIVERY_PLAN");
fault("plan references uncommitted event",p=>p.plans=expected.concat([
 {auditEventId:"auditMissing",recipients:[]}]),"PLAN_NOT_COMMITTED");
fault("invalid recipient plan",p=>p.plans=[...expected.slice(0,2),
 {auditEventId:"audit3",recipients:["ownerA","ownerA"]}],"INVALID_DELIVERY_PLAN");
fault("tampered backend authorization",p=>{p.documents=clone(docs);
 p.documents.backend.authorization.granted=true;},"BACKEND_CONTRACT_CHANGED");
fault("tampered monitoring cron",p=>{p.documents=clone(docs);
 p.documents.monitoring.execution.mayScheduleCron=true;},"MONITORING_PLAN_CHANGED");
const ahead=delivery.snapshot();ahead.events[0].revision=999;
fault("outbox revision ahead",p=>p.rehearsal=makeDelivery(ahead),"OUTBOX_REVISION_AHEAD");
const dirty=delivery.snapshot();dirty.notifications[0].recipientId="ownerB";
fault("cross-tenant notification",p=>p.rehearsal=makeDelivery(dirty),"RECONCILIATION_INVALID");
const stale=delivery.snapshot();stale.events[0].auditEventId="auditUnknown";
fault("corrupted source event",p=>p.rehearsal=makeDelivery(stale),"RECONCILIATION_INVALID");
const missingNote=delivery.snapshot();missingNote.notifications=[];
fault("missing notification",p=>p.rehearsal=makeDelivery(missingNote),"RECONCILIATION_INVALID");
const duplicate=delivery.snapshot();duplicate.notifications.push(clone(duplicate.notifications[0]));
fault("duplicated notification",p=>p.rehearsal=makeDelivery(duplicate),"RECONCILIATION_INVALID");
const incorrectAction=delivery.snapshot();incorrectAction.events[0].action="submit";
fault("cross-component action drift",p=>p.rehearsal=makeDelivery(incorrectAction),"OUTBOX_COMMITTED_SCOPE_DRIFT");
const damagedLedger=clone(workflow);damagedLedger.ledger[0].eventId="tampered";
fault("altered audit chain",p=>p.workflow=damagedLedger,"AUDIT_CHAIN_INVALID");
const previous=clone(delivery.snapshot());
previous.events[0].status="dispatched";previous.events[0].attempts=1;
previous.notifications[0].delivered=true;previous.notifications[0].read=true;
fault("checkpoint delivery regression",p=>p.previous=previous,"CHECKPOINT_REGRESSION");
const prevGone=clone(delivery.snapshot());prevGone.events.push({...clone(prevGone.events[0]),id:"lostEvent",
 auditEventId:"audit2",status:"pending"});
fault("checkpoint disappeared event",p=>p.previous=prevGone,"CHECKPOINT_REGRESSION");
const clean=F.inspect(input({previous:delivery.snapshot()}));
check("Clean checkpoint accepted",clean.valid&&clean.code==="STATIC_CONSISTENCY_ONLY");
const allowedBroken=clone(workflow);
const newAudit=A.recordSimulatedDecision(allowedBroken.ledger,{
 eventId:"auditExtra",happenedAt:300,action:"proposal_created",organizationId:"orgA",
 siteId:"siteA",targetId:"ghostProject",actorId:"staff",outcome:"allowed",reason:"SIMULATED_ALLOW"});
check("Extra committed audit valid",newAudit.ok);
allowedBroken.ledger=newAudit.events;
fault("committed target missing",p=>{p.workflow=allowedBroken;
 p.deliverySourceLedger=newAudit.events;},"COMMITTED_TARGET_NOT_FOUND");
check("Null input blocked",F.inspect(null).code==="INVALID_INPUT");
check("Partial input blocked",F.inspect({workflow:{}}).code==="INVALID_INPUT");
check("No GO for invalid input",F.inspect(null).go===false);
check("No mutation across multiple assessments",delivery.snapshot().events.length===1&&workflow.proposals.length===1);
const matrix=JSON.parse(read("staging/v32-combined-faults.review.json"));
const review=F.inspectMatrix(matrix);
check("V32 matrix format accepted",review.valid&&review.issues.length===0);
check("Twenty four future scenarios",review.checksPending===24&&matrix.cases.length===24);
check("All evidence pending",matrix.cases.every(x=>x.evidenceStatus==="NOT_EXECUTED"&&x.evidenceRef===null));
check("Matrix NO GO",!review.go&&!review.stagingReady&&!review.productionReady);
check("Matrix no real tests",review.realBackendTests===0&&review.realAlertsSent===0);
check("All external actions blocked",Object.entries(matrix.execution).every(([k,v])=>k==="reviewOnly"?v===true:v===false));
check("Matrix source unaltered",JSON.stringify(matrix)===JSON.stringify(JSON.parse(read("staging/v32-combined-faults.review.json"))));
const edits=[
 ["wrong branch",x=>x.branch="main","WRONG_PROJECT"],
 ["wrong product",x=>x.project="other","WRONG_PROJECT"],
 ["fake authorization",x=>x.authorizationGranted=true,"AUTHORIZATION_CHANGED"],
 ["fake environment",x=>x.environment="production","AUTHORIZATION_CHANGED"],
 ["SQL enabled",x=>x.execution.mayRunSQL=true,"EXECUTION_CHANGED"],
 ["provision enabled",x=>x.execution.mayProvision=true,"EXECUTION_CHANGED"],
 ["deploy enabled",x=>x.execution.mayDeploy=true,"EXECUTION_CHANGED"],
 ["publish enabled",x=>x.execution.mayPublish=true,"EXECUTION_CHANGED"],
 ["email enabled",x=>x.execution.maySendEmail=true,"EXECUTION_CHANGED"],
 ["push enabled",x=>x.execution.maySendPush=true,"EXECUTION_CHANGED"],
 ["cron enabled",x=>x.execution.mayScheduleCron=true,"EXECUTION_CHANGED"],
 ["paid AI enabled",x=>x.execution.mayCallPaidAI=true,"EXECUTION_CHANGED"],
 ["charges enabled",x=>x.execution.mayCharge=true,"EXECUTION_CHANGED"],
 ["unknown permission",x=>x.execution.somePermission=true,"EXECUTION_CHANGED"],
 ["missing case",x=>x.cases.pop(),"FAULT_MATRIX_CHANGED"],
 ["extra case",x=>x.cases.push(clone(x.cases[0])),"FAULT_MATRIX_CHANGED"],
 ["fake test passed",x=>x.cases[0].evidenceStatus="PASS","EVIDENCE_CLAIMED"],
 ["fake evidence reference",x=>x.cases[1].evidenceRef="https://fake","EVIDENCE_CLAIMED"],
 ["wrong scenario ID",x=>x.cases[4].id="F99","EVIDENCE_CLAIMED"],
 ["fake backend tests",x=>x.result.realBackendTests=1,"GO_CLAIMED"],
 ["fake real alerts",x=>x.result.realAlertsSent=1,"GO_CLAIMED"],
 ["staging GO",x=>x.result.staging="GO","GO_CLAIMED"],
 ["production GO",x=>x.result.production="GO","GO_CLAIMED"]
];
for(const [name,fn,code] of edits){
 const altered=clone(matrix);fn(altered);
 const out=F.inspectMatrix(altered);
 check("Mutation "+name+" detected",!out.valid&&out.issues.includes(code));
 check("Mutation "+name+" still NO GO",!out.go&&!out.canRunSQL&&!out.canDeploy);
}
check("Null matrix invalid",!F.inspectMatrix(null).valid);
check("No network",!read("shared/mg-flow-integrity-v32.js").includes("fetch("));
check("No DB client",!read("shared/mg-flow-integrity-v32.js").includes("supabase."));
check("No timers",!read("shared/mg-flow-integrity-v32.js").includes("setTimeout("));
console.log(n+" / "+n+" V32 combined in-memory fault checks passed. No ACID or real authorization.");
