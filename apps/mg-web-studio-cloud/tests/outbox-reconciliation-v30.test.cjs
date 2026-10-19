"use strict";
/* V30 — JavaScript memory rehearsal only, no external delivery/SQL/server.
 * node apps/mg-web-studio-cloud/tests/outbox-reconciliation-v30.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const w={};for(const f of ["mg-contracts-v20.js","mg-tenant-security-v23.js","mg-audit-trail-v24.js",
 "mg-proposal-flow-v27.js","mg-outbox-reconciliation-v30.js"])
 new Function("window",read("shared/"+f))(w);
const C=w.MGWebContractsV20,S=w.MGTenantSecurityV23,A=w.MGAuditTrailV24,
 P=w.MGProposalFlowV27,O=w.MGOutboxReconciliationV30;
let count=0;const check=(label,value)=>{assert.ok(value,label);count++;};
const cp=x=>JSON.parse(JSON.stringify(x));
const directory=()=>({
 organizations:[{id:"orgA",status:"active"},{id:"orgB",status:"active"}],
 sites:[{id:"siteA",organizationId:"orgA",status:"draft"},{id:"siteB",organizationId:"orgB",status:"draft"}],
 memberships:[{id:"mOwnerA",userId:"ownerA",organizationId:"orgA",role:"CLIENT_OWNER",status:"active"},
  {id:"mEditorA",userId:"editorA",organizationId:"orgA",role:"CLIENT_EDITOR",status:"active"},
  {id:"mViewerA",userId:"viewerA",organizationId:"orgA",role:"CLIENT_VIEWER",status:"active"},
  {id:"mOwnerB",userId:"ownerB",organizationId:"orgB",role:"CLIENT_OWNER",status:"active"}],
 scopes:[{membershipId:"mEditorA",organizationId:"orgA",siteId:"siteA",status:"active"},
  {membershipId:"mViewerA",organizationId:"orgA",siteId:"siteA",status:"active"}],
 sessions:["staff","ownerA","editorA","viewerA","ownerB"].map(userId=>({
  id:"sess_"+userId,userId,status:"active",expiresAt:20000,aal:userId==="staff"?"aal2":"aal1"})),
 staff:[{userId:"staff",role:"SUPERADMIN",status:"active"}]
});
const session=userId=>({verified:true,userId,sessionId:"sess_"+userId});
let d=directory(),counter=0,clock=100;
const proposal=P.createWorkflow({directory:()=>d,contracts:C,security:S,audit:A,initial:{
 sites:[{id:"siteA",organizationId:"orgA",draftVersion:1,pages:[{slug:"home",title:"Inicio"}]}],
 proposals:[],ledger:[]
}});
const pr=(action,userId,revision)=>({action,organizationId:"orgA",siteId:"siteA",proposalId:"proposalA",
 expectedRevision:revision,expectedDraftVersion:1,operationId:"operation_"+(++counter),
 eventId:"audit_"+counter,now:clock++,trustedSession:session(userId)});
const created=proposal.execute(pr("create","staff",0));
const submitted=proposal.execute(pr("submit","staff",1));
const approved=proposal.execute(pr("approve","ownerA",1));
const originalLedger=proposal.snapshot().ledger;
check("V27 create succeeded",created.ok&&created.committed);
check("V27 submit succeeded",submitted.ok&&submitted.committed);
check("V27 approval succeeded",approved.ok&&approved.committed);
check("V27 audit chain valid",A.validate(originalLedger).ok&&originalLedger.length===3);
check("V30 version",O.version==="30.0-review");
check("V30 seven events",O.actions.length===7);
check("V30 max attempts",O.MAX_ATTEMPTS===3);
const empty={events:[],notifications:[]},engine=O.createRehearsal({directory:()=>d,security:S,audit:A,initial:empty,ledger:originalLedger});
check("Mode memory only",engine.mode==="memory-only-not-a-worker");
check("Initially reconciles",engine.reconcile().valid===true);
check("Initially nothing to deliver",engine.snapshot().events.length===0);
const before=JSON.stringify(empty);
const input=(eventId,recipientId,receipt=approved,action="approve",auditEventId="audit_3",extra={})=>
 ({eventId,recipientId,receipt,action,auditEventId,organizationId:"orgA",siteId:"siteA",now:110,...extra});
const en1=engine.enqueue(input("event1","ownerA"));
check("Enqueue owner succeeds",en1.ok&&en1.created&&!en1.replayed);
check("Event not sent externally",en1.deliveryPerformed===false);
check("Notification linked",en1.notificationId==="n_event1");
check("Receipt does not imply publication",approved.published===false);
check("No mutation initial",JSON.stringify(empty)===before);
check("Pending not delivered",engine.snapshot().notifications[0].delivered===false);
const repeat=engine.enqueue(input("event999","ownerA"));
check("Same business source and recipient deduplicated",repeat.ok&&repeat.replayed&&!repeat.created);
check("Repeat does not append",engine.snapshot().events.length===1);
const en2=engine.enqueue(input("event2","editorA"));
check("Editor scoped notification queued",en2.ok&&en2.created);
const en3=engine.enqueue(input("event3","viewerA"));
check("Viewer scoped notification queued",en3.ok&&en3.created);
check("Three events and notices",engine.snapshot().events.length===3&&engine.snapshot().notifications.length===3);
check("Ledger reconciliation after enqueues",engine.reconcile().valid===true);
function noChange(name,fn,code){
 const snap=JSON.stringify(engine.snapshot()),x=fn();
 check(name+" rejected",!x.ok&&x.code===code);
 check(name+" no state mutation",JSON.stringify(engine.snapshot())===snap);
}
noChange("Foreign-tenant recipient",()=>engine.enqueue(input("event4","ownerB")),"RECIPIENT_NOT_AUTHORIZED");
noChange("Duplicated event identifier for new recipient",()=>engine.enqueue(input("event1","ownerB")),"EVENT_ID_COLLISION");
noChange("Wrong action source",()=>engine.enqueue(input("event4","ownerB",submitted,"submit","audit_3")),"COMMIT_EVIDENCE_MISSING");
noChange("Wrong audit id",()=>engine.enqueue(input("event4","ownerA",approved,"approve","audit_unknown")),"COMMIT_EVIDENCE_MISSING");
noChange("Claim failed business receipt",()=>engine.enqueue(input("event4","ownerA",{...approved,committed:false})),"INVALID_ENQUEUE");
noChange("Claim published business receipt",()=>engine.enqueue(input("event4","ownerA",{...approved,published:true})),"INVALID_ENQUEUE");
noChange("Claim bogus tenant source",()=>engine.enqueue(input("event4","ownerA",approved,"approve","audit_3",{organizationId:"orgB"})),"COMMIT_EVIDENCE_MISSING");
noChange("Claim fake revision status",()=>engine.enqueue(input("event4","ownerA",{...approved,state:"draft"})),"INVALID_ENQUEUE");
noChange("Future timestamp source",()=>engine.enqueue(input("event4","ownerA",approved,"approve","audit_3",{now:1})),"EVENT_TIME_INVALID");
const first=engine.claim("event1","workerA",111);
check("First claim",first.ok&&first.attempt===1&&first.token.startsWith("lease_"));
check("Lease does not send",first.deliveryPerformed===false);
noChange("Concurrent worker duplicate lease",()=>engine.claim("event1","workerB",112),"NOT_CLAIMABLE");
noChange("Incorrect fencing token",()=>engine.settle("event1","lease_wrong",true,113),"STALE_LEASE");
const retry1=engine.settle("event1",first.token,false,113);
check("First failed send sets retry",retry1.ok&&retry1.status==="retry"&&retry1.attempts===1);
check("Retry delayed",engine.snapshot().events[0].nextAt===123);
noChange("Retry too early",()=>engine.claim("event1","workerA",122),"NOT_CLAIMABLE");
const second=engine.claim("event1","workerB",123);
check("Second attempt claimed",second.ok&&second.attempt===2);
const retry2=engine.settle("event1",second.token,false,124);
check("Second failure retries",retry2.ok&&retry2.status==="retry");
check("Retry backoff 20",engine.snapshot().events[0].nextAt===144);
const third=engine.claim("event1","workerA",144);
check("Third attempt claimed",third.ok&&third.attempt===3);
const final=engine.settle("event1",third.token,false,145);
check("Third failure dead letters",final.ok&&final.status==="dead_letter");
check("Dead letter not delivered",engine.snapshot().notifications[0].delivered===false);
noChange("Cannot claim DLQ",()=>engine.claim("event1","workerA",200),"NOT_CLAIMABLE");
const x2=engine.claim("event2","workerA",150);
check("Claim editor event",x2.ok);
const delivered=engine.settle("event2",x2.token,true,152);
check("Ack simulated dispatch",delivered.ok&&delivered.status==="dispatched");
check("Ack not external delivery",delivered.deliveryPerformed===false);
check("Editor notification delivered in memory",engine.snapshot().notifications[1].delivered===true);
noChange("Reject duplicate ack",()=>engine.settle("event2",x2.token,true,153),"STALE_LEASE");
noChange("Other recipient cannot read",()=>engine.markRead("n_event2",session("ownerA"),154),"RECIPIENT_DENIED");
noChange("Staff cannot read editor notice",()=>engine.markRead("n_event2",session("staff"),154),"RECIPIENT_DENIED");
const marked=engine.markRead("n_event2",session("editorA"),155);
check("Editor marks own notification read",marked.ok&&!marked.replayed);
check("Read flag true",engine.snapshot().notifications[1].read===true);
const readAgain=engine.markRead("n_event2",session("editorA"),156);
check("Repeated read idempotent",readAgain.ok&&readAgain.replayed);
noChange("Undelivered notification unreadable",()=>engine.markRead("n_event3",session("viewerA"),157),"NOT_DELIVERED");
const pending=engine.claim("event3","workerA",160);
check("Third event claimed",pending.ok);
noChange("Late ack before recovery",()=>engine.settle("event3",pending.token,true,191),"STALE_LEASE");
const recovered=engine.expireLeases(191);
check("Expired lease recovered",recovered.ok&&recovered.recovered===1);
check("Recovered event pending retry",engine.snapshot().events[2].status==="retry");
noChange("Stale worker fenced",()=>engine.settle("event3",pending.token,true,192),"STALE_LEASE");
const afterRecovery=engine.claim("event3","workerB",192);
check("Reclaimed event after crash",afterRecovery.ok&&afterRecovery.attempt===2);
const afterAck=engine.settle("event3",afterRecovery.token,true,193);
check("Recovery can acknowledge",afterAck.ok&&afterAck.status==="dispatched");
check("Viewer notification now delivered",engine.snapshot().notifications[2].delivered===true);
check("Valid state with DLQ and deliveries",engine.reconcile().valid===true);
check("Notification counts no duplicates",engine.reconcile().notificationCount===3);
let removed=S.mutateFixture(d,"revokeMembership","mEditorA");
d=removed;
noChange("Revoked editor cannot read already delivered note",()=>engine.markRead("n_event2",session("editorA"),196),"ACCESS_DENIED");
d=directory();
const ownerNext=engine.enqueue(input("event4","ownerA",submitted,"submit","audit_2"));
check("Different committed source generates new event",ownerNext.ok&&ownerNext.created);
const afterEnqueue=engine.claim("event4","workerA",200);
check("New event claimed",afterEnqueue.ok);
d=S.mutateFixture(d,"revokeMembership","mOwnerA");
noChange("Revocation prevents ack",()=>engine.settle("event4",afterEnqueue.token,true,201),"RECIPIENT_NOT_AUTHORIZED");
const lostLease=engine.expireLeases(231);
check("Revoked leased event recovered",lostLease.ok&&lostLease.recovered===1);
noChange("Revoked owner cannot re-claim",()=>engine.claim("event4","workerA",232),"RECIPIENT_NOT_AUTHORIZED");
d=directory();
check("After restore recipient can claim",engine.claim("event4","workerB",232).ok);
check("Reconciliation still valid",engine.reconcile().valid);
const safeSnap=engine.snapshot();safeSnap.events[0].status="dispatched";
check("Snapshots are copies",engine.snapshot().events[0].status==="dead_letter");
const v30Manifest=JSON.parse(read("staging/v30-outbox-delivery.review.json"));
check("V30 contract format",v30Manifest.format==="mg-web-studio/outbox-delivery-v30-review");
check("V30 contract review only",v30Manifest.execution.reviewOnly===true);
check("V30 all execution flags disabled",Object.entries(v30Manifest.execution).every(([k,v])=>k==="reviewOnly"?v===true:v===false));
check("V30 explicitly not authorized",v30Manifest.state==="NOT_AUTHORIZED");
check("No service credentials",v30Manifest.credentials===null&&v30Manifest.serviceProvider===null);
check("No real deliveries",v30Manifest.result.realDeliveries===0);
check("No backend tests",v30Manifest.result.realBackendTests===0);
check("No GO",v30Manifest.result.staging==="NO_GO"&&v30Manifest.result.production==="NO_GO");
check("All 18 planned tests untouched",v30Manifest.checklist.length===18&&v30Manifest.checklist.every(x=>x.status==="NOT_EXECUTED"&&x.evidence===null));
check("Recheck recipient in contract",v30Manifest.guarantees.revalidateRecipientOnDispatch===true);
check("Future DB transaction specified",v30Manifest.guarantees.transactionalSource.startsWith("same-future"));
check("No real side effect",v30Manifest.guarantees.externalSideEffects==="NONE_IN_V30");
check("Security audit separate",v30Manifest.guarantees.securityAudit.includes("private-separated"));
check("Unknown actual delivery guarantee",v30Manifest.guarantees.deliverySemantics.includes("NOT_PROVEN"));
const corrupt=engine.snapshot();corrupt.notifications[1].eventId="unknown";
const wBad=O.createRehearsal({directory:()=>directory(),security:S,audit:A,
 initial:corrupt,ledger:originalLedger});
check("Reconciler detects orphan notification",!wBad.reconcile().valid&&wBad.reconcile().issues.some(x=>x.code==="NOTIFICATION_EVENT_MISMATCH"));
const missingNotification=engine.snapshot();missingNotification.notifications.shift();
const wMissing=O.createRehearsal({directory:()=>directory(),security:S,audit:A,initial:missingNotification,ledger:originalLedger});
check("Reconciler detects missing notification",!wMissing.reconcile().valid&&wMissing.reconcile().issues.some(x=>x.code==="MISSING_OR_DUPLICATE_NOTIFICATION"));
const duplicated=engine.snapshot();duplicated.events.push(cp(duplicated.events[0]));
const wDuplicate=O.createRehearsal({directory:()=>directory(),security:S,audit:A,initial:duplicated,ledger:originalLedger});
check("Reconciler detects duplicate outbox",!wDuplicate.reconcile().valid);
const brokenSource=engine.snapshot();brokenSource.events[0].auditEventId="nonexistent";
const wSource=O.createRehearsal({directory:()=>directory(),security:S,audit:A,initial:brokenSource,ledger:originalLedger});
check("Reconciler detects missing committed source",!wSource.reconcile().valid&&wSource.reconcile().issues.some(x=>x.code==="MISSING_COMMITTED_SOURCE"));
check("No fetch or HTTP",!read("shared/mg-outbox-reconciliation-v30.js").includes("fetch("));
check("No Supabase",!read("shared/mg-outbox-reconciliation-v30.js").includes("supabase."));
check("No timers",!read("shared/mg-outbox-reconciliation-v30.js").includes("setTimeout("));
check("No SQL execution",!read("shared/mg-outbox-reconciliation-v30.js").includes("query("));
console.log(count+" / "+count+" V30 simulated outbox, retry, delivery and reconciliation checks passed; NO GO.");
