/* MG WEB STUDIO CLOUD V30 — OUTBOX + NOTIFICATIONS SIMULATOR, MEMORY ONLY.
 * NO HTTP, SQL, Supabase, timers, email, pushes, production auth or real delivery.
 * Caller-supplied directory/sessions and V27 audit are TEST FIXTURES, not a trusted boundary.
 * Event enqueue is NOT transactional with V27 state: production MUST use one SQL transaction.
 */
(function(root){"use strict";
const VERSION="30.0-review",MAX_ATTEMPTS=3,LEASE_MS=30,RETRY_MS=[10,20,40];
const EVENTS=Object.freeze({
 create:"proposal_created",submit:"proposal_submitted",changes:"proposal_changes",
 revise:"proposal_revised",approve:"proposal_approved",reject:"proposal_rejected",apply:"proposal_applied"
});
const STATUS=Object.freeze({
 create:"draft",submit:"submitted",changes:"needs_changes",revise:"draft",
 approve:"approved",reject:"rejected",apply:"applied"
});
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const id=x=>typeof x==="string"&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(x);
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=code=>({ok:false,code,simulationOnly:true,go:false});
const ok=x=>({ok:true,...x,simulationOnly:true,go:false});
const nowOk=x=>Number.isSafeInteger(x)&&x>=0;
function createRehearsal({directory,security,audit,initial,ledger}){
 if(typeof directory!=="function"||!security||typeof security.authorize!=="function"||
  !audit||typeof audit.validate!=="function"||!Array.isArray(ledger)||
  !audit.validate(ledger).ok||!obj(initial)||!Array.isArray(initial.events)||
  !Array.isArray(initial.notifications))
  throw new TypeError("Invalid V30 fixture or simulated dependencies");
 let state=copy(initial),sourceLedger=copy(ledger);
 let sequence=state.events.length;
 function snapshot(){return copy(state);}
 function validate(){
  const issues=[],add=(code,k)=>issues.push({code,key:k||null});
  const outbox=new Set(),notifications=new Set(),mapped=new Map();
  for(const e of state.events){
   if(!obj(e)||!id(e.id)||outbox.has(e.id)||!id(e.organizationId)||!id(e.siteId)||
    !id(e.proposalId)||!id(e.auditEventId)||!Object.prototype.hasOwnProperty.call(EVENTS,e.action)||
    !id(e.recipientId)||!Number.isSafeInteger(e.revision)||e.revision<1||
    !["pending","leased","retry","dispatched","dead_letter"].includes(e.status)||
    !Number.isSafeInteger(e.attempts)||e.attempts<0||e.attempts>MAX_ATTEMPTS||
    !nowOk(e.nextAt)||!nowOk(e.occurredAt)||
    (e.status==="leased"&&(!id(e.leaseToken)||!nowOk(e.leaseUntil)))||
    (e.status!=="leased"&&(e.leaseToken!==null||e.leaseUntil!==null))||
    (e.status==="dispatched"&&e.attempts<1)||
    (e.status==="dead_letter"&&e.attempts!==MAX_ATTEMPTS)){
     add("INVALID_OUTBOX_EVENT",e&&e.id);continue;
   }
   outbox.add(e.id);
   const matches=sourceLedger.filter(x=>x.eventId===e.auditEventId);
   if(matches.length!==1||matches[0].outcome!=="allowed"||
    matches[0].action!==EVENTS[e.action]||
    matches[0].organizationId!==e.organizationId||
    matches[0].siteId!==e.siteId||matches[0].targetId!==e.proposalId)
    add("MISSING_COMMITTED_SOURCE",e.id);
   const k=[e.organizationId,e.siteId,e.proposalId,e.auditEventId,e.recipientId].join("|");
   if(mapped.has(k))add("DUPLICATE_DELIVERY_TARGET",e.id);
   mapped.set(k,e.id);
  }
  for(const n of state.notifications){
   if(!obj(n)||!id(n.id)||notifications.has(n.id)||!id(n.eventId)||
    !id(n.organizationId)||!id(n.siteId)||!id(n.proposalId)||!id(n.recipientId)||
    typeof n.delivered!=="boolean"||typeof n.read!=="boolean"||
    (n.read&&!n.delivered)) {add("INVALID_NOTIFICATION",n&&n.id);continue;}
   notifications.add(n.id);
   const events=state.events.filter(e=>e.id===n.eventId);
   if(events.length!==1||events[0].organizationId!==n.organizationId||
    events[0].siteId!==n.siteId||events[0].proposalId!==n.proposalId||
    events[0].recipientId!==n.recipientId||
    (events[0].status==="dispatched")!==n.delivered)
    add("NOTIFICATION_EVENT_MISMATCH",n.id);
  }
  for(const e of state.events)
   if(state.notifications.filter(n=>n.eventId===e.id).length!==1)
    add("MISSING_OR_DUPLICATE_NOTIFICATION",e&&e.id);
  return {valid:issues.length===0,issues,eventCount:state.events.length,
   notificationCount:state.notifications.length,simulationOnly:true,go:false,
   deliveredExternally:false,realDatabaseTested:false};
 }
 function recipientPermitted(d,recipientId,organizationId,siteId){
  if(!obj(d)||!Array.isArray(d.memberships)||!Array.isArray(d.sites)||
   !Array.isArray(d.organizations)||!Array.isArray(d.scopes))return false;
  const org=d.organizations.filter(o=>o.id===organizationId&&o.status==="active");
  const site=d.sites.filter(s=>s.id===siteId&&s.organizationId===organizationId&&s.status!=="suspended");
  const member=d.memberships.filter(m=>m.organizationId===organizationId&&m.userId===recipientId&&m.status==="active");
  if(org.length!==1||site.length!==1||member.length!==1)return false;
  if(["CLIENT_OWNER","CLIENT_ADMIN"].includes(member[0].role))return true;
  if(!["CLIENT_EDITOR","CLIENT_VIEWER"].includes(member[0].role))return false;
  return d.scopes.filter(s=>s.organizationId===organizationId&&s.siteId===siteId&&
    s.membershipId===member[0].id&&s.status==="active").length===1;
 }
 function enqueue(data){
  if(!obj(data)||!obj(data.receipt)||data.receipt.ok!==true||
   data.receipt.committed!==true||data.receipt.simulationOnly!==true||
   data.receipt.go!==false||data.receipt.published!==false||
   !Object.prototype.hasOwnProperty.call(EVENTS,data.action)||
   !id(data.organizationId)||!id(data.siteId)||!id(data.auditEventId)||
   !id(data.eventId)||!id(data.recipientId)||!nowOk(data.now)||
   !id(data.receipt.proposalId)||!Number.isSafeInteger(data.receipt.revision)||
   data.receipt.revision<1||data.receipt.state!==STATUS[data.action])return fail("INVALID_ENQUEUE");
  if(!validate().valid)return fail("INVALID_REHEARSAL_STATE");
  const source=sourceLedger.filter(e=>e.eventId===data.auditEventId);
  if(source.length!==1||source[0].outcome!=="allowed"||
   source[0].action!==EVENTS[data.action]||source[0].organizationId!==data.organizationId||
   source[0].siteId!==data.siteId||source[0].targetId!==data.receipt.proposalId)
   return fail("COMMIT_EVIDENCE_MISSING");
  const key=[data.organizationId,data.siteId,data.receipt.proposalId,
   data.auditEventId,data.recipientId].join("|");
  const prior=state.events.filter(x=>[x.organizationId,x.siteId,x.proposalId,x.auditEventId,
   x.recipientId].join("|")===key);
  if(prior.length){
   if(prior.length!==1)return fail("DUPLICATE_DELIVERY_TARGET");
   return ok({replayed:true,eventId:prior[0].id,notificationId:"n_"+prior[0].id,
    created:false});
  }
  if(state.events.some(x=>x.id===data.eventId)||state.notifications.some(x=>x.id==="n_"+data.eventId))
   return fail("EVENT_ID_COLLISION");
  let d;try{d=directory();}catch(e){return fail("DIRECTORY_UNAVAILABLE");}
  if(!recipientPermitted(d,data.recipientId,data.organizationId,data.siteId))
   return fail("RECIPIENT_NOT_AUTHORIZED");
  if(source[0].happenedAt>data.now)return fail("EVENT_TIME_INVALID");
  const event={id:data.eventId,organizationId:data.organizationId,siteId:data.siteId,
   proposalId:data.receipt.proposalId,revision:data.receipt.revision,action:data.action,
   auditEventId:data.auditEventId,recipientId:data.recipientId,
   status:"pending",attempts:0,nextAt:data.now,occurredAt:data.now,
   leaseToken:null,leaseUntil:null};
  const notification={id:"n_"+event.id,eventId:event.id,organizationId:event.organizationId,
   siteId:event.siteId,proposalId:event.proposalId,recipientId:event.recipientId,
   delivered:false,read:false};
  state={events:state.events.concat(event),notifications:state.notifications.concat(notification)};
  sequence++;
  return ok({replayed:false,created:true,eventId:event.id,notificationId:notification.id,
   sequence,deliveryPerformed:false});
 }
 function claim(eventId,workerId,now){
  if(!id(eventId)||!id(workerId)||!nowOk(now))return fail("INVALID_CLAIM");
  if(!validate().valid)return fail("INVALID_REHEARSAL_STATE");
  const matching=state.events.filter(e=>e.id===eventId);
  if(matching.length!==1)return fail("EVENT_NOT_FOUND");
  const x=matching[0];
  let d;try{d=directory();}catch(e){return fail("DIRECTORY_UNAVAILABLE");}
  if(!recipientPermitted(d,x.recipientId,x.organizationId,x.siteId))
   return fail("RECIPIENT_NOT_AUTHORIZED");
  if(!["pending","retry"].includes(x.status)||now<x.nextAt)return fail("NOT_CLAIMABLE");
  if(x.attempts>=MAX_ATTEMPTS)return fail("RETRIES_EXHAUSTED");
  const token="lease_"+eventId+"_"+(x.attempts+1)+"_"+workerId;
  state=copy(state);
  const target=state.events.find(e=>e.id===eventId);
  target.status="leased";target.attempts++;target.leaseToken=token;target.leaseUntil=now+LEASE_MS;
  return ok({eventId,token,attempt:target.attempts,leaseUntil:target.leaseUntil,
   deliveryPerformed:false});
 }
 function settle(eventId,token,success,now){
  if(!id(eventId)||!id(token)||typeof success!=="boolean"||!nowOk(now))
   return fail("INVALID_ACK");
  if(!validate().valid)return fail("INVALID_REHEARSAL_STATE");
  const source=state.events.find(e=>e.id===eventId);
  if(!source)return fail("EVENT_NOT_FOUND");
  if(source.status!=="leased"||source.leaseToken!==token||now>source.leaseUntil)
   return fail("STALE_LEASE");
  let d;try{d=directory();}catch(e){return fail("DIRECTORY_UNAVAILABLE");}
  if(!recipientPermitted(d,source.recipientId,source.organizationId,source.siteId))
   return fail("RECIPIENT_NOT_AUTHORIZED");
  state=copy(state);
  const x=state.events.find(e=>e.id===eventId);
  x.leaseToken=null;x.leaseUntil=null;
  if(success){
   x.status="dispatched";
   const n=state.notifications.find(z=>z.eventId===eventId);n.delivered=true;
  }else if(x.attempts>=MAX_ATTEMPTS){
   x.status="dead_letter";
  }else{
   x.status="retry";
   x.nextAt=now+RETRY_MS[x.attempts-1];
  }
  return ok({eventId,status:x.status,attempts:x.attempts,
   deliveryPerformed:false,simulatedAcknowledgment:true});
 }
 function expireLeases(now){
  if(!nowOk(now))return fail("INVALID_TIME");
  if(!validate().valid)return fail("INVALID_REHEARSAL_STATE");
  state=copy(state);let recovered=0;
  for(const x of state.events){
   if(x.status==="leased"&&now>x.leaseUntil){
    x.leaseToken=null;x.leaseUntil=null;
    x.status=x.attempts>=MAX_ATTEMPTS?"dead_letter":"retry";
    x.nextAt=now;recovered++;
   }
  }
  return ok({recovered,deliveryPerformed:false});
 }
 function markRead(notificationId,trustedSession,now){
  if(!id(notificationId)||!obj(trustedSession)||!nowOk(now))return fail("INVALID_READ");
  if(!validate().valid)return fail("INVALID_REHEARSAL_STATE");
  const notes=state.notifications.filter(n=>n.id===notificationId);
  if(notes.length!==1)return fail("NOTIFICATION_NOT_FOUND");
  const n=notes[0];
  if(n.recipientId!==trustedSession.userId)return fail("RECIPIENT_DENIED");
  let decision,d;try{
   d=directory();
   decision=security.authorize(d,trustedSession,
    {organizationId:n.organizationId,siteId:n.siteId,action:"read"},now);
  }catch(e){return fail("SECURITY_UNAVAILABLE");}
  if(!decision||decision.allowed!==true||decision.authorizationIsReal!==false||
   decision.go!==false||!recipientPermitted(d,n.recipientId,n.organizationId,n.siteId))
   return fail("ACCESS_DENIED");
  if(!n.delivered)return fail("NOT_DELIVERED");
  if(n.read)return ok({notificationId,replayed:true});
  state=copy(state);state.notifications.find(z=>z.id===notificationId).read=true;
  return ok({notificationId,replayed:false});
 }
 return Object.freeze({version:VERSION,mode:"memory-only-not-a-worker",
  enqueue,claim,settle,expireLeases,markRead,reconcile:validate,snapshot});
}
root.MGOutboxReconciliationV30=Object.freeze({version:VERSION,actions:Object.freeze(Object.keys(EVENTS)),
 createRehearsal,MAX_ATTEMPTS});
})(typeof window!=="undefined"?window:globalThis);
