/* MG WEB STUDIO CLOUD V24 — local audit rehearsal, NOT a production audit log.
 * All identities, timestamps and directory entries are fixtures.
 * FNV32 is a non-cryptographic error detector, not a signature or tamper protection.
 * No persistence, encryption, network, SQL, authentication or authorization.
 */
(function(root) {
"use strict";
const VERSION="24.0-review",GENESIS="00000000",MAX_EVENTS=2000;
const PERMISSIONS=Object.freeze({
 access_read:"read",
 proposal_approved:"proposalApprove",
 proposal_rejected:"proposalReject",
 proposal_applied:"proposalApply",
 membership_revoked:"members",
 scope_revoked:"members",
 admin_access:"adminRead"
});
const KEYS=["sequence","eventId","happenedAt","action","organizationId","siteId","targetId","actorId","outcome","reason","previousChecksum","checksum"];
const isObj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const id=x=>typeof x==="string"&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(x);
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const err=code=>({ok:false,code,simulationOnly:true,go:false});
function digest(event){
 const canonical=JSON.stringify([event.sequence,event.eventId,event.happenedAt,event.action,event.organizationId,
  event.siteId,event.targetId,event.actorId,event.outcome,event.reason,event.previousChecksum]);
 let h=2166136261;
 for(let i=0;i<canonical.length;i++){h^=canonical.charCodeAt(i);h=Math.imul(h,16777619);}
 return ("00000000"+(h>>>0).toString(16)).slice(-8);
}
function validate(entries){
 if(!Array.isArray(entries)||entries.length>MAX_EVENTS)return err("INVALID_LEDGER");
 let previous=GENESIS,previousTime=-1;const seen=new Set();
 for(let i=0;i<entries.length;i++){
  const e=entries[i];
  if(!isObj(e)||Object.keys(e).length!==KEYS.length||KEYS.some(k=>!has(e,k))||
   e.sequence!==i+1||!id(e.eventId)||seen.has(e.eventId)||
   !Number.isSafeInteger(e.happenedAt)||e.happenedAt<previousTime||
   !has(PERMISSIONS,e.action)||!["allowed","denied"].includes(e.outcome)||
   (e.action==="admin_access"?(e.organizationId!==null||e.siteId!==null||e.targetId!==null):
    (!id(e.organizationId)||!id(e.siteId)||((e.action!=="access_read")&&!id(e.targetId))||
      (e.targetId!==null&&!id(e.targetId))))||
   (e.outcome==="allowed"?!id(e.actorId):e.actorId!==null)||
   typeof e.reason!=="string"||!/^([A-Z][A-Z0-9_]{1,63})$/.test(e.reason)||
   e.previousChecksum!==previous||typeof e.checksum!=="string"||e.checksum!==digest(e))
    return err("LEDGER_CORRUPTED");
  seen.add(e.eventId);previous=e.checksum;previousTime=e.happenedAt;
 }
 return {ok:true,count:entries.length,checksum:previous,simulationOnly:true,cryptographicallySecure:false,go:false};
}
function record(entries,policy,directory,trustedSession,intent,now,eventId){
 const initial=validate(entries);if(!initial.ok)return initial;
 if(!policy||typeof policy.authorize!=="function")return err("POLICY_REQUIRED");
 if(!isObj(intent)||!has(PERMISSIONS,intent.action)||!id(eventId))return err("INVALID_EVENT");
 if(!Number.isSafeInteger(now)||now<0||
  (entries.length&&now<entries[entries.length-1].happenedAt))return err("INVALID_TIME");
 if(entries.some(e=>e.eventId===eventId))return err("DUPLICATE_EVENT");
 if(entries.length===MAX_EVENTS)return err("LEDGER_LIMIT");
 const admin=intent.action==="admin_access";
 if(admin?(intent.organizationId!==undefined&&intent.organizationId!==null||
            intent.siteId!==undefined&&intent.siteId!==null||intent.targetId!==undefined&&intent.targetId!==null):
   (!id(intent.organizationId)||!id(intent.siteId)||
    (intent.action!=="access_read"&&!id(intent.targetId))||
    (intent.targetId!==undefined&&intent.targetId!==null&&!id(intent.targetId))))
  return err("INVALID_SCOPE");
 let decision;
 try{decision=policy.authorize(directory,trustedSession,admin?{action:"adminRead"}:
  {organizationId:intent.organizationId,siteId:intent.siteId,action:PERMISSIONS[intent.action]},now);}
 catch(e){return err("POLICY_ERROR");}
 if(!isObj(decision)||typeof decision.allowed!=="boolean"||decision.authorizationIsReal!==false||
  decision.go!==false||typeof decision.code!=="string"||
  !/^([A-Z][A-Z0-9_]{1,63})$/.test(decision.code))return err("POLICY_INVALID");
 const item={
  sequence:entries.length+1,eventId,happenedAt:now,action:intent.action,
  organizationId:admin?null:intent.organizationId,siteId:admin?null:intent.siteId,
  targetId:admin?null:(intent.targetId||null),
  actorId:decision.allowed&&trustedSession&&id(trustedSession.userId)?trustedSession.userId:null,
  outcome:decision.allowed?"allowed":"denied",reason:decision.code,
  previousChecksum:initial.checksum
 };
 item.checksum=digest(item);
 const next=entries.map(x=>({...x})).concat([item]);
 return {ok:true,event:{...item},events:next,simulatedDecision:decision.allowed,
  checksum:item.checksum,simulationOnly:true,cryptographicallySecure:false,go:false};
}
function querySite(entries,policy,directory,trustedSession,organizationId,siteId,now){
 const verified=validate(entries);if(!verified.ok)return verified;
 if(!id(organizationId)||!id(siteId)||!policy||typeof policy.authorize!=="function"||
  !Number.isSafeInteger(now)||now<0)return err("INVALID_QUERY");
 let decision;try{decision=policy.authorize(directory,trustedSession,
  {organizationId,siteId,action:"members"},now);}catch(e){return err("POLICY_ERROR");}
 if(!decision||decision.allowed!==true||decision.authorizationIsReal!==false||decision.go!==false)return err("AUDIT_ACCESS_DENIED");
 return {ok:true,items:entries.filter(e=>e.organizationId===organizationId&&e.siteId===siteId)
  .slice().reverse().map(e=>({...e})),simulationOnly:true,go:false};
}
function queryAdmin(entries,policy,directory,trustedSession,now){
 const verified=validate(entries);if(!verified.ok)return verified;
 if(!policy||typeof policy.authorize!=="function"||!Number.isSafeInteger(now)||now<0)return err("INVALID_QUERY");
 let decision;try{decision=policy.authorize(directory,trustedSession,{action:"adminRead"},now);}catch(e){return err("POLICY_ERROR");}
 if(!decision||decision.allowed!==true||decision.authorizationIsReal!==false||decision.go!==false)return err("AUDIT_ACCESS_DENIED");
 return {ok:true,items:entries.filter(e=>e.action==="admin_access").slice().reverse().map(e=>({...e})),
  simulationOnly:true,go:false};
}
root.MGAuditTrailV24=Object.freeze({
 version:VERSION,mode:"memory-demo-only",PERMISSIONS,
 validate,record,querySite,queryAdmin
});
})(typeof window!=="undefined"?window:globalThis);
