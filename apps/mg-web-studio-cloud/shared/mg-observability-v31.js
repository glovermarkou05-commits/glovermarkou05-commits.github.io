/* MG WEB STUDIO CLOUD V31 — STATIC OBSERVABILITY/RECOVERY REHEARSAL.
 * Read-only diagnostics for V30 snapshots; not a worker, scheduler, alert sender,
 * authenticated observability service, PostgreSQL check, or security guarantee.
 * NO network, SQL, timers, storage, payments, production changes or real delivery.
 */
(function(root){"use strict";
const VERSION="31.0-review",DEFAULTS=Object.freeze({pendingAge:30,retryOverdue:20,leaseExpired:0,backlogLimit:3});
const STATUS=Object.freeze(["pending","leased","retry","dispatched","dead_letter"]);
const safe=x=>Number.isSafeInteger(x)&&x>=0;
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const owned=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const limit=Object.freeze({pendingAge:86400,retryOverdue:86400,leaseExpired:86400,backlogLimit:100000});
const ALERTS=Object.freeze({
 RECONCILIATION_MISMATCH:"critical",DEAD_LETTER:"critical",EXPIRED_LEASE:"warning",
 STALE_PENDING:"warning",OVERDUE_RETRY:"warning",BACKLOG_LIMIT:"warning",
 AGE_IN_FUTURE:"warning",INVALID_TELEMETRY:"critical",
 EVENT_DISAPPEARED:"critical",ATTEMPT_COUNTER_REWIND:"critical",
 DELIVERY_REGRESSION:"critical",READ_REGRESSION:"critical",
 EVENT_IDENTITY_CHANGED:"critical",TIME_REGRESSION:"critical"
});
const response=(x)=>({version:VERSION,mode:"read-only-memory-analysis",simulationOnly:true,
 mayRecover:false,mayDispatch:false,mayRunSQL:false,mayPublish:false,
 mayDeploy:false,actualMonitoring:false,go:false,...x});
function thresholds(input){
 if(input===undefined||input===null)return {...DEFAULTS};
 if(!obj(input)||Object.keys(input).some(k=>!owned(DEFAULTS,k)))return null;
 const cfg={...DEFAULTS,...input};
 return Object.keys(DEFAULTS).every(k=>safe(cfg[k])&&cfg[k]<=limit[k])?cfg:null;
}
function summarize(rehearsal,now,thresholdInput){
 const cfg=thresholds(thresholdInput);
 if(!cfg||!safe(now)||!rehearsal||typeof rehearsal.snapshot!=="function"||
  typeof rehearsal.reconcile!=="function")return response({valid:false,code:"INVALID_INPUT",
   totals:null,alerts:[{code:"INVALID_TELEMETRY",severity:"critical",count:1}],recoveries:[]});
 let data,reconciled;
 try{data=rehearsal.snapshot();reconciled=rehearsal.reconcile();}
 catch(e){return response({valid:false,code:"INSPECTION_FAILURE",totals:null,
  alerts:[{code:"INVALID_TELEMETRY",severity:"critical",count:1}],recoveries:[]});}
 if(!obj(data)||!Array.isArray(data.events)||!Array.isArray(data.notifications)||
  !obj(reconciled)||typeof reconciled.valid!=="boolean")
  return response({valid:false,code:"INVALID_SNAPSHOT",totals:null,
   alerts:[{code:"INVALID_TELEMETRY",severity:"critical",count:1}],recoveries:[]});
 const counts=Object.fromEntries(STATUS.map(k=>[k,0])),pendingIds=new Set();
 const issues={RECONCILIATION_MISMATCH:reconciled.valid?0:
  Math.max(1,Array.isArray(reconciled.issues)?reconciled.issues.length:1)};
 let future=0;
 for(const x of data.events){
  if(!obj(x)||!STATUS.includes(x.status)||!safe(x.occurredAt)||
    !safe(x.nextAt)||!safe(x.attempts)||
    (x.status==="leased"&&!safe(x.leaseUntil))){
   issues.INVALID_TELEMETRY=(issues.INVALID_TELEMETRY||0)+1;continue;
  }
  counts[x.status]++;
  if(x.occurredAt>now)future++;
  if(x.status==="pending"&&now>=x.nextAt&&now-x.occurredAt>=cfg.pendingAge)
   issues.STALE_PENDING=(issues.STALE_PENDING||0)+1;
  if(x.status==="retry"&&now>=x.nextAt&&now-x.nextAt>=cfg.retryOverdue)
   issues.OVERDUE_RETRY=(issues.OVERDUE_RETRY||0)+1;
  if(x.status==="leased"&&now>x.leaseUntil+cfg.leaseExpired)
   issues.EXPIRED_LEASE=(issues.EXPIRED_LEASE||0)+1;
  if(x.status==="dead_letter")
   issues.DEAD_LETTER=(issues.DEAD_LETTER||0)+1;
 }
 if(future)issues.AGE_IN_FUTURE=future;
 const backlog=counts.pending+counts.retry+counts.leased;
 if(backlog>=cfg.backlogLimit&&backlog>0)
  issues.BACKLOG_LIMIT=backlog;
 const notes={total:data.notifications.length,read:0,delivered:0,unread:0};
 for(const x of data.notifications){
  if(!obj(x)||typeof x.read!=="boolean"||typeof x.delivered!=="boolean"){
   issues.INVALID_TELEMETRY=(issues.INVALID_TELEMETRY||0)+1;continue;
  }
  if(x.delivered)notes.delivered++;
  if(x.read)notes.read++;
  if(x.delivered&&!x.read)notes.unread++;
 }
 const alerts=Object.keys(ALERTS).filter(k=>issues[k]>0)
  .map(k=>({code:k,severity:ALERTS[k],count:issues[k]}));
 const recoveries=[];
 for(const a of alerts){
  if(a.code==="DEAD_LETTER")recoveries.push("REVIEW_DEAD_LETTER_MANUALLY");
  if(a.code==="EXPIRED_LEASE")recoveries.push("CHECK_LEASE_AND_FENCING_BEFORE_RECOVERY");
  if(a.code==="OVERDUE_RETRY")recoveries.push("INSPECT_RETRY_BACKOFF_AND_RECIPIENT_SCOPE");
  if(a.code==="STALE_PENDING"||a.code==="BACKLOG_LIMIT")
   recoveries.push("INVESTIGATE_QUEUE_BACKLOG");
  if(a.code==="RECONCILIATION_MISMATCH")
   recoveries.push("COMPARE_DURABLE_OUTBOX_WITH_COMMITTED_SOURCE");
  if(a.code==="INVALID_TELEMETRY"||a.code==="AGE_IN_FUTURE")
   recoveries.push("VERIFY_TELEMETRY_AND_CLOCK");
 }
 const valid=reconciled.valid&&!(issues.INVALID_TELEMETRY>0);
 return response({valid,code:valid?"STATIC_OBSERVATION_ONLY":"UNTRUSTED_TELEMETRY",
  at:now,totals:{events:data.events.length,notifications:notes,...counts,backlog},
  alerts,needsAttention:alerts.length>0,readiness:"NO_GO",
  recoveryPlan:[...new Set(recoveries)],recoveries:[],
  // Only aggregate metrics: no tenant ids, recipient IDs or payloads are exposed.
  dataRedacted:true,realDeliveriesVerified:0});
}
function compare(previous,current){
 if(!obj(previous)||!obj(current)||!Array.isArray(previous.events)||!Array.isArray(current.events)||
  !Array.isArray(previous.notifications)||!Array.isArray(current.notifications))
  return response({valid:false,code:"INVALID_SNAPSHOTS",alerts:[{code:"INVALID_TELEMETRY",severity:"critical",count:1}]});
 const issues={},record=k=>issues[k]=(issues[k]||0)+1;
 const currentEvents=new Map(current.events.map(x=>[x&&x.id,x]));
 const currentNotes=new Map(current.notifications.map(x=>[x&&x.id,x]));
 const seen=new Set();
 for(const e of previous.events){
  if(!obj(e)||typeof e.id!=="string"||seen.has(e.id)){
   record("INVALID_TELEMETRY");continue;}
  seen.add(e.id);const n=currentEvents.get(e.id);
  if(!n||!obj(n)){record("EVENT_DISAPPEARED");continue;}
  if(n.organizationId!==e.organizationId||n.siteId!==e.siteId||
   n.proposalId!==e.proposalId||n.recipientId!==e.recipientId||
   n.auditEventId!==e.auditEventId||n.action!==e.action)
   record("EVENT_IDENTITY_CHANGED");
  if(!safe(e.attempts)||!safe(n.attempts)||n.attempts<e.attempts)
   record("ATTEMPT_COUNTER_REWIND");
  if(e.status==="dispatched"&&n.status!=="dispatched")record("DELIVERY_REGRESSION");
  if(!safe(e.occurredAt)||!safe(n.occurredAt)||e.occurredAt!==n.occurredAt)
   record("TIME_REGRESSION");
 }
 seen.clear();
 for(const n of previous.notifications){
  if(!obj(n)||typeof n.id!=="string"||seen.has(n.id)){
   record("INVALID_TELEMETRY");continue;}
  seen.add(n.id);const next=currentNotes.get(n.id);
  if(!next||!obj(next)){record("EVENT_DISAPPEARED");continue;}
  if(next.eventId!==n.eventId||next.recipientId!==n.recipientId||
   next.organizationId!==n.organizationId||next.siteId!==n.siteId)
   record("EVENT_IDENTITY_CHANGED");
  if(n.delivered===true&&next.delivered!==true)record("DELIVERY_REGRESSION");
  if(n.read===true&&next.read!==true)record("READ_REGRESSION");
 }
 const alerts=Object.keys(ALERTS).filter(k=>issues[k]>0).map(code=>
  ({code,severity:ALERTS[code],count:issues[code]}));
 return response({valid:alerts.length===0,code:alerts.length?"SNAPSHOT_CHANGE_WARNING":"STATIC_COMPARISON_ONLY",
  alerts,readiness:"NO_GO",dataRedacted:true,realDeliveriesVerified:0});
}
root.MGObservabilityV31=Object.freeze({version:VERSION,mode:"memory-read-only",
  defaults:DEFAULTS,summarize,compare,validateThresholds:x=>thresholds(x)!==null});
})(typeof window!=="undefined"?window:globalThis);
