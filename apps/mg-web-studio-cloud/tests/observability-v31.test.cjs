"use strict";
/* V31 STATIC observability, read-only, NO real alerts, emails, SQL or cron.
 * node apps/mg-web-studio-cloud/tests/observability-v31.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const win={};
for(const name of ["mg-tenant-security-v23.js","mg-audit-trail-v24.js",
 "mg-outbox-reconciliation-v30.js","mg-observability-v31.js"])
 new Function("window",read("shared/"+name))(win);
const S=win.MGTenantSecurityV23,A=win.MGAuditTrailV24,
 O=win.MGOutboxReconciliationV30,M=win.MGObservabilityV31;
let n=0;const check=(label,truth)=>{assert.ok(truth,label);n++};
const clone=x=>JSON.parse(JSON.stringify(x));
const directory=()=>({
 organizations:[{id:"orgA",status:"active"}],
 sites:[{id:"siteA",organizationId:"orgA",status:"draft"}],
 memberships:[{id:"memberA",userId:"ownerA",organizationId:"orgA",role:"CLIENT_OWNER",status:"active"}],
 scopes:[],sessions:[{id:"sessionA",userId:"ownerA",aal:"aal1",expiresAt:10000,status:"active"}],staff:[]
});
let ledger=[];
for(let i=1;i<=5;i++){
 const result=A.recordSimulatedDecision(ledger,{eventId:"audit"+i,happenedAt:i,
   action:"proposal_approved",organizationId:"orgA",siteId:"siteA",targetId:"proposalA",
   actorId:"ownerA",outcome:"allowed",reason:"SIMULATED_ALLOW"});
 if(!result.ok)throw Error("audit fixture error");ledger=result.events;
}
const from=(snapshot)=>O.createRehearsal({directory,security:S,audit:A,ledger,initial:snapshot});
const engine=from({events:[],notifications:[]});
const receipt={ok:true,committed:true,simulationOnly:true,go:false,published:false,
  proposalId:"proposalA",revision:1,state:"approved"};
const event=(id,i)=>({receipt,action:"approve",organizationId:"orgA",siteId:"siteA",
  eventId:id,recipientId:"ownerA",auditEventId:"audit"+i,now:100});
for(let i=1;i<=5;i++)check("Event "+i+" created",engine.enqueue(event("event"+i,i)).ok);
check("Five events",engine.snapshot().events.length===5);
check("V30 valid baseline",engine.reconcile().valid);
const base=M.summarize(engine,1000,{pendingAge:20,retryOverdue:10,leaseExpired:0,backlogLimit:5});
check("All pending initially",base.valid&&base.totals.pending===5);
check("Pending alert",base.alerts.some(x=>x.code==="STALE_PENDING"&&x.count===5));
check("Backlog alert",base.alerts.some(x=>x.code==="BACKLOG_LIMIT"&&x.count===5));
check("No sending flags",!base.mayDispatch&&!base.mayRecover&&!base.mayPublish);
const claim2=engine.claim("event2","workerA",105);
check("Lease 2",claim2.ok);
const claim3=engine.claim("event3","workerA",105);
check("Lease 3",claim3.ok);
check("Fail 3 into retry",engine.settle("event3",claim3.token,false,106).status==="retry");
let lease=engine.claim("event4","workerA",105);
check("DLQ attempt 1",lease.ok);
check("DLQ retry 1",engine.settle("event4",lease.token,false,106).status==="retry");
lease=engine.claim("event4","workerA",116);
check("DLQ attempt 2",lease.ok);
check("DLQ retry 2",engine.settle("event4",lease.token,false,117).status==="retry");
lease=engine.claim("event4","workerA",137);
check("DLQ attempt 3",lease.ok);
check("DLQ final failure",engine.settle("event4",lease.token,false,138).status==="dead_letter");
const claim5=engine.claim("event5","workerB",105);
check("Deliver claim",claim5.ok);
check("Deliver ack",engine.settle("event5",claim5.token,true,106).ok);
check("Deliver read",engine.markRead("n_event5",
 {userId:"ownerA",sessionId:"sessionA",verified:true},107).ok);
check("Reconcile healthy",engine.reconcile().valid);
const snapshot=engine.snapshot();
const stateNow=M.summarize(engine,200,{pendingAge:50,retryOverdue:20,leaseExpired:0,backlogLimit:3});
check("V31 version",M.version==="31.0-review");
check("V31 mode",M.mode==="memory-read-only");
check("Summary valid",stateNow.valid);
check("No GO",stateNow.go===false&&stateNow.readiness==="NO_GO");
check("Aggregate event count",stateNow.totals.events===5);
check("Pending one",stateNow.totals.pending===1);
check("Leased one",stateNow.totals.leased===1);
check("Retry one",stateNow.totals.retry===1);
check("DLQ one",stateNow.totals.dead_letter===1);
check("Dispatched one",stateNow.totals.dispatched===1);
check("Backlog three",stateNow.totals.backlog===3);
check("Five notices",stateNow.totals.notifications.total===5);
check("Delivered one",stateNow.totals.notifications.delivered===1);
check("Read one",stateNow.totals.notifications.read===1);
check("Unread delivered zero",stateNow.totals.notifications.unread===0);
for(const code of ["STALE_PENDING","EXPIRED_LEASE","OVERDUE_RETRY","DEAD_LETTER","BACKLOG_LIMIT"])
 check("Alert "+code,stateNow.alerts.some(x=>x.code===code));
check("Five distinct alerts",stateNow.alerts.length===5);
check("Dead letter critical",stateNow.alerts.find(x=>x.code==="DEAD_LETTER").severity==="critical");
check("Manual dead letter plan",stateNow.recoveryPlan.includes("REVIEW_DEAD_LETTER_MANUALLY"));
check("Lease review plan",stateNow.recoveryPlan.includes("CHECK_LEASE_AND_FENCING_BEFORE_RECOVERY"));
check("Queue plan",stateNow.recoveryPlan.includes("INVESTIGATE_QUEUE_BACKLOG"));
check("Backoff plan",stateNow.recoveryPlan.includes("INSPECT_RETRY_BACKOFF_AND_RECIPIENT_SCOPE"));
check("No actual recovery",stateNow.recoveries.length===0&&!stateNow.mayRecover);
check("No actual monitoring",stateNow.actualMonitoring===false);
check("Redaction marker",stateNow.dataRedacted===true);
check("No actual delivery verified",stateNow.realDeliveriesVerified===0);
check("Source untouched",JSON.stringify(snapshot)===JSON.stringify(engine.snapshot()));
check("No tenant in output",!JSON.stringify(stateNow).includes("orgA"));
check("No recipient in output",!JSON.stringify(stateNow).includes("ownerA"));
check("No proposal in output",!JSON.stringify(stateNow).includes("proposalA"));
check("No event ID in output",!JSON.stringify(stateNow).includes("event4"));
check("No sensitive content",!JSON.stringify(stateNow).includes("password"));
check("Stable repeat",JSON.stringify(M.summarize(engine,200,{pendingAge:50,retryOverdue:20,leaseExpired:0,backlogLimit:3}))===JSON.stringify(stateNow));
const allDefault=M.summarize(engine,200);
check("Default thresholds loaded",allDefault.valid);
check("Thresholds valid",M.validateThresholds({pendingAge:20}));
const wrong=[
 null,"any",[],{pendingAge:-1},{pendingAge:0.2},{pendingAge:90000},
 {retryOverdue:-1},{leaseExpired:100000},{backlogLimit:"3"},{extraFlag:true}
];
check("Null uses defaults",M.validateThresholds(null));
for(const [i,bad] of wrong.entries()){
 if(bad===null)continue;
 check("Wrong threshold "+i+" rejected",!M.validateThresholds(bad));
 check("Wrong threshold "+i+" cannot approve",M.summarize(engine,200,bad).code==="INVALID_INPUT");
}
check("Unknown snapshot refused",M.summarize({},200).code==="INVALID_INPUT");
check("Invalid timestamp refused",M.summarize(engine,-5).code==="INVALID_INPUT");
check("Fractional timestamp refused",M.summarize(engine,1.2).code==="INVALID_INPUT");
const broken={snapshot(){throw Error("simulated");},reconcile(){return {valid:false}}};
check("Uncaught errors redacted",M.summarize(broken,200).code==="INSPECTION_FAILURE");
const invalid={snapshot(){return {events:{},notifications:[]}},reconcile(){return {valid:false}}};
check("Malformed counters fail closed",M.summarize(invalid,200).code==="INVALID_SNAPSHOT");
const inconsistent=clone(snapshot);inconsistent.notifications[0].eventId="phantom";
const badEngine=from(inconsistent);
const mismatch=M.summarize(badEngine,200);
check("Reconcile invalid",!mismatch.valid&&mismatch.code==="UNTRUSTED_TELEMETRY");
check("Mismatch alert",mismatch.alerts.some(x=>x.code==="RECONCILIATION_MISMATCH"));
check("Reconciliation plan manual",mismatch.recoveryPlan.includes("COMPARE_DURABLE_OUTBOX_WITH_COMMITTED_SOURCE"));
const future=M.summarize(engine,50);
check("Future timestamp spotted",future.alerts.some(x=>x.code==="AGE_IN_FUTURE"));
check("Future clock review",future.recoveryPlan.includes("VERIFY_TELEMETRY_AND_CLOCK"));
const same=M.compare(snapshot,clone(snapshot));
check("Same snapshots accepted",same.valid&&same.alerts.length===0);
check("Compare NO GO",same.go===false);
check("Compare no external PII",!JSON.stringify(same).includes("ownerA"));
const lost=clone(snapshot);lost.events.shift();
check("Deleted event detected",M.compare(snapshot,lost).alerts.some(x=>x.code==="EVENT_DISAPPEARED"));
const identity=clone(snapshot);identity.events[0].organizationId="orgB";
check("Tenant change detected",M.compare(snapshot,identity).alerts.some(x=>x.code==="EVENT_IDENTITY_CHANGED"));
const actor=clone(snapshot);actor.events[0].recipientId="other";
check("Recipient change detected",M.compare(snapshot,actor).alerts.some(x=>x.code==="EVENT_IDENTITY_CHANGED"));
const time=clone(snapshot);time.events[0].occurredAt=999;
check("Timestamp alteration detected",M.compare(snapshot,time).alerts.some(x=>x.code==="TIME_REGRESSION"));
const attempts=clone(snapshot);attempts.events[1].attempts=0;
check("Rewound attempts detected",M.compare(snapshot,attempts).alerts.some(x=>x.code==="ATTEMPT_COUNTER_REWIND"));
const undone=clone(snapshot);undone.events[4].status="retry";
check("Delivery regression detected",M.compare(snapshot,undone).alerts.some(x=>x.code==="DELIVERY_REGRESSION"));
const read=clone(snapshot);read.notifications[4].read=false;
check("Read regression detected",M.compare(snapshot,read).alerts.some(x=>x.code==="READ_REGRESSION"));
const forgotten=clone(snapshot);forgotten.notifications.pop();
check("Missing note detected",M.compare(snapshot,forgotten).alerts.some(x=>x.code==="EVENT_DISAPPEARED"));
const changed=clone(snapshot);changed.notifications[0].organizationId="orgB";
check("Notification identity change detected",M.compare(snapshot,changed).alerts.some(x=>x.code==="EVENT_IDENTITY_CHANGED"));
check("Malformed compare rejected",M.compare(null,null).code==="INVALID_SNAPSHOTS");
const config=JSON.parse(read("staging/v31-observability.review.json"));
const inspected=M.inspectPlan(config);
check("Manifest valid",inspected.valid&&inspected.issues.length===0);
check("Manifest exactly 20 pending",inspected.pendingChecks===20&&config.checklist.length===20);
check("No real alerts",inspected.realAlertsSent===0);
check("No real backend tests",inspected.realBackendTests===0);
check("Manifest no GO",inspected.go===false&&inspected.readiness==="NO_GO");
check("Manifest no deploy",!inspected.mayDeploy&&!inspected.mayPublish);
check("Manifest no SQL",!inspected.mayRunSQL);
check("Manifest no provision",!inspected.mayRecover);
check("No cron scheduled",config.execution.mayScheduleCron===false);
check("No external alerts in manifest",config.visibility.externalAlertDelivery===false);
check("No automated replay",config.recovery.automatedReplay===false);
check("All evidence null",config.checklist.every(x=>x.evidenceStatus==="NOT_EXECUTED"&&x.evidenceRef===null));
const mutationList=[
 ["wrong branch",x=>x.branch="main","WRONG_PROJECT_OR_VERSION"],
 ["wrong project",x=>x.project="Other","WRONG_PROJECT_OR_VERSION"],
 ["approved env",x=>x.authorizationGranted=true,"UNAUTHORIZED_ENVIRONMENT"],
 ["assigned environment",x=>x.environment="production","UNAUTHORIZED_ENVIRONMENT"],
 ["allow SQL",x=>x.execution.mayRunSQL=true,"EXECUTION_NOT_BLOCKED"],
 ["allow deploy",x=>x.execution.mayDeploy=true,"EXECUTION_NOT_BLOCKED"],
 ["allow cron",x=>x.execution.mayScheduleCron=true,"EXECUTION_NOT_BLOCKED"],
 ["allow email",x=>x.execution.maySendEmail=true,"EXECUTION_NOT_BLOCKED"],
 ["allow paid AI",x=>x.execution.mayCallPaidAI=true,"EXECUTION_NOT_BLOCKED"],
 ["allow charge",x=>x.execution.mayCharge=true,"EXECUTION_NOT_BLOCKED"],
 ["extra flag",x=>x.execution.someUnexpectedFlag=true,"EXECUTION_NOT_BLOCKED"],
 ["mark production calibrated",x=>x.thresholds.productionCalibrated=true,"THRESHOLDS_UNTRUSTED"],
 ["negative threshold",x=>x.thresholds.pendingAge=-1,"THRESHOLDS_UNTRUSTED"],
 ["show tenant IDs",x=>x.visibility.includesTenantIds=true,"VISIBILITY_UNSAFE"],
 ["show recipient IDs",x=>x.visibility.includesRecipientIds=true,"VISIBILITY_UNSAFE"],
 ["enable external alerts",x=>x.visibility.externalAlertDelivery=true,"VISIBILITY_UNSAFE"],
 ["automate retries",x=>x.recovery.automatedReplay=true,"RECOVERY_UNSAFE"],
 ["start worker",x=>x.recovery.externalWorkerStarted=true,"RECOVERY_UNSAFE"],
 ["fake notification",x=>x.recovery.realNotificationSent=true,"RECOVERY_UNSAFE"],
 ["remove checklist",x=>x.checklist.pop(),"MISSING_EVIDENCE_CHECKS"],
 ["mark real checks",x=>x.checklist[0].evidenceStatus="PASSED","CHECK_NOT_PENDING"],
 ["invent evidence",x=>x.checklist[1].evidenceRef="proof","CHECK_NOT_PENDING"],
 ["fake backend tests",x=>x.status.realBackendTests=1,"NO_GO_CHANGED"],
 ["fake sent alerts",x=>x.status.realAlertsSent=1,"NO_GO_CHANGED"],
 ["stage GO",x=>x.status.staging="GO","NO_GO_CHANGED"],
 ["prod GO",x=>x.status.production="GO","NO_GO_CHANGED"]
];
for(const [label,change,expected] of mutationList){
 const altered=clone(config);change(altered);const t=M.inspectPlan(altered);
 check("Tamper "+label+" caught",!t.valid&&t.issues.includes(expected));
 check("Tamper "+label+" stays no GO",!t.go&&!t.mayDeploy&&!t.mayRunSQL);
}
check("Null plan rejected",!M.inspectPlan(null).valid);
check("No fetch",!read("shared/mg-observability-v31.js").includes("fetch("));
check("No SQL client",!read("shared/mg-observability-v31.js").includes("supabase."));
check("No async worker",!read("shared/mg-observability-v31.js").includes("setTimeout("));
console.log(n+" / "+n+" V31 static observability checks passed; NO GO.");
