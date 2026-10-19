/* MG WEB STUDIO CLOUD — V23
 * Demo-only policy evaluator. Simulated trusted session is caller-supplied.
 * NOT authentication, an HTTP API, RLS, or an authorization control.
 * Never accept this "trustedSession" from a browser in production.
 */
(function(root) {
"use strict";
const VERSION="23.0-review";
const ROLE_PERMISSIONS=Object.freeze({
 CLIENT_OWNER:Object.freeze(["read","edit","publish","members","billing","support","proposalApprove","proposalChanges","proposalReject","proposalApply"]),
 CLIENT_ADMIN:Object.freeze(["read","edit","publish","members","support","proposalApprove","proposalChanges","proposalReject","proposalApply"]),
 CLIENT_EDITOR:Object.freeze(["read","edit","proposalChanges","proposalApply"]),
 CLIENT_VIEWER:Object.freeze(["read"])
});
const validId=x=>typeof x==="string"&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(x);
const isObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const result=(allowed,code)=>Object.freeze({allowed,code,simulationOnly:true,authorizationIsReal:false,go:false});
const deny=code=>result(false,code);
const allow=()=>result(true,"SIMULATED_ALLOW");
function validDirectory(d){
 return isObject(d)&&["organizations","sites","memberships","scopes","sessions","staff"].every(k=>Array.isArray(d[k]));
}
function verifiedSession(d,session,now){
 if(!isObject(session)||session.verified!==true||!validId(session.userId)||!validId(session.sessionId))
  return null;
 const records=d.sessions.filter(s=>s.id===session.sessionId);
 if(records.length!==1)return null;
 const s=records[0];
 if(s.userId!==session.userId||s.status!=="active"||!Number.isFinite(s.expiresAt)||s.expiresAt<=now)return null;
 return s;
}
function authorize(directory,trustedSession,request,now){
 if(!validDirectory(directory)||!Number.isFinite(now)||now<0||!isObject(request))return deny("INVALID_CONTEXT");
 const s=verifiedSession(directory,trustedSession,now);
 if(!s)return deny("SESSION_DENIED");
 // Session identity comes from separate simulated trustedSession, NEVER request fields.
 if(request.action==="adminRead"){
  const roles=directory.staff.filter(x=>x.userId===s.userId);
  if(roles.length!==1||roles[0].role!=="SUPERADMIN"||roles[0].status!=="active"||s.aal!=="aal2")
   return deny("STAFF_MFA_DENIED");
  return allow();
 }
 if(!validId(request.organizationId)||!validId(request.siteId)||
  !Object.values(ROLE_PERMISSIONS).some(actions=>actions.includes(request.action)))return deny("INVALID_SCOPE");
 const orgs=directory.organizations.filter(x=>x.id===request.organizationId);
 const sites=directory.sites.filter(x=>x.id===request.siteId);
 if(orgs.length!==1||sites.length!==1||orgs[0].status!=="active"||
  sites[0].organizationId!==orgs[0].id||sites[0].status==="suspended")
  return deny("RESOURCE_DENIED");
 const memberships=directory.memberships.filter(x=>x.userId===s.userId&&x.organizationId===orgs[0].id);
 if(memberships.length!==1)return deny("MEMBERSHIP_DENIED");
 const m=memberships[0];
 if(m.status!=="active"||!Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS,m.role)||
  !ROLE_PERMISSIONS[m.role].includes(request.action))return deny("ROLE_DENIED");
 if(m.role==="CLIENT_EDITOR"||m.role==="CLIENT_VIEWER"){
  const scopes=directory.scopes.filter(x=>x.membershipId===m.id&&x.organizationId===orgs[0].id&&
    x.siteId===sites[0].id&&x.status==="active");
  if(scopes.length!==1)return deny("SITE_SCOPE_DENIED");
 }
 return allow();
}
function visibleSites(directory,trustedSession,organizationId,now){
 if(!validDirectory(directory))return [];
 return directory.sites.filter(s=>s.organizationId===organizationId&&
  authorize(directory,trustedSession,{organizationId,siteId:s.id,action:"read"},now).allowed)
  .map(s=>s.id);
}
function mayDeliver(directory,trustedSession,event,now){
 if(!isObject(event)||!isObject(trustedSession)||event.recipientUserId!==trustedSession.userId)
  return deny("RECIPIENT_DENIED");
 return authorize(directory,trustedSession,{organizationId:event.organizationId,siteId:event.siteId,action:"read"},now);
}
function mutateFixture(directory,kind,identifier,siteId){
 if(!validDirectory(directory)||!validId(identifier))return null;
 // Creates a new fixture only; callers must not mistake it for a real revocation.
 let copy;try{copy=JSON.parse(JSON.stringify(directory));}catch(e){return null;}
 if(kind==="revokeMembership"){
  const matches=copy.memberships.filter(m=>m.id===identifier);
  if(matches.length!==1)return null;matches[0].status="revoked";
 }else if(kind==="revokeSession"){
  const matches=copy.sessions.filter(s=>s.id===identifier);
  if(matches.length!==1)return null;matches[0].status="revoked";
 }else if(kind==="removeScope"){
  if(!validId(siteId))return null;
  const matches=copy.scopes.filter(s=>s.membershipId===identifier&&s.siteId===siteId&&s.status==="active");
  if(matches.length!==1)return null;matches[0].status="revoked";
 }else return null;
 return copy;
}
root.MGTenantSecurityV23=Object.freeze({
 version:VERSION,mode:"demo-only",ROLE_PERMISSIONS,authorize,visibleSites,mayDeliver,mutateFixture
});
})(typeof window!=="undefined"?window:globalThis);
