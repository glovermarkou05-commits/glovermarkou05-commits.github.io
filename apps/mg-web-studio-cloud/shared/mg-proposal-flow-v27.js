/* MG WEB STUDIO CLOUD V27 | Seven-action proposal flow, MEMORY DEMO ONLY.
 * Builds on V20 contracts, V23 mock policy, and V24 mock ledger.
 * Simulated sessions are supplied by the TEST caller, never trusted in production.
 * No HTTP, authentication, SQL, storage, external calls, publication or payments.
 */
(function(root){"use strict";
const VERSION="27.0-review";
const CONFIG=Object.freeze({
 create:{staff:true,event:"proposal_created"},
 submit:{staff:true,event:"proposal_submitted"},
 changes:{staff:false,event:"proposal_changes",permission:"proposalChanges"},
 revise:{staff:true,event:"proposal_revised"},
 approve:{staff:false,event:"proposal_approved",permission:"proposalApprove"},
 reject:{staff:false,event:"proposal_rejected",permission:"proposalReject"},
 apply:{staff:false,event:"proposal_applied",permission:"proposalApply"}
});
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const id=x=>typeof x==="string"&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(x);
const opId=x=>typeof x==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,99}$/.test(x);
const deep=x=>JSON.parse(JSON.stringify(x));
const fail=(code,attemptLogged=false,extra={})=>({
 ok:false,code,committed:false,attemptLogged,simulationOnly:true,go:false,...extra
});
function createWorkflow(config){
 if(!plain(config)||typeof config.directory!=="function"||!config.contracts||
  typeof config.contracts.contractDecision!=="function"||typeof config.contracts.canonicalPages!=="function"||
  typeof config.contracts.normalizedState!=="function"||!config.security||
  typeof config.security.authorize!=="function"||!config.audit||
  typeof config.audit.validate!=="function"||
  typeof config.audit.recordSimulatedDecision!=="function"||
  !plain(config.initial)||!Array.isArray(config.initial.sites)||
  !Array.isArray(config.initial.proposals)||!Array.isArray(config.initial.ledger))
  throw new TypeError("V27 requires V20/V23/V24 and a JSON test fixture.");
 let state=deep(config.initial),completed=new Map();
 if(!config.audit.validate(state.ledger).ok)throw new TypeError("Bad initial ledger.");
 const keys=new Set(),proposals=new Set();
 for(const s of state.sites){
  if(!plain(s)||!id(s.id)||!id(s.organizationId)||!Number.isSafeInteger(s.draftVersion)||
    s.draftVersion<1||!Array.isArray(s.pages))throw new TypeError("Bad site fixture");
  const key=s.organizationId+"|"+s.id;
  if(keys.has(key))throw new TypeError("Duplicate site");keys.add(key);
 }
 for(const p of state.proposals){
  if(!plain(p)||!id(p.id)||proposals.has(p.id)||
   !keys.has(p.organizationId+"|"+p.siteId)||
   !Number.isSafeInteger(p.revision)||p.revision<1||
   !config.contracts.normalizedState(p.status).ok)
    throw new TypeError("Bad proposal fixture");
  proposals.add(p.id);
 }
 function snapshot(){return deep(state);}
 function execute(request){
  if(!plain(request)||!plain(request.trustedSession)||!Object.prototype.hasOwnProperty.call(CONFIG,request.action)||
   !id(request.proposalId)||!id(request.organizationId)||!id(request.siteId)||
   !id(request.eventId)||!opId(request.operationId)||
   !Number.isSafeInteger(request.now)||request.now<0)
    return fail("INVALID_REQUEST");
  const {action,organizationId,siteId,proposalId,trustedSession}=request,step=CONFIG[action];
  const auditIntent={eventId:request.eventId,happenedAt:request.now,action:step.event,
    organizationId,siteId,targetId:proposalId};
  function auditAttempt(allowed,reason){
   let item;
   try{
    item=config.audit.recordSimulatedDecision(state.ledger,{
     ...auditIntent,outcome:allowed?"allowed":"denied",
     reason:allowed?"SIMULATED_ALLOW":reason,
     actorId:allowed?trustedSession.userId:null
    });
    if(!item||item.ok!==true||!Array.isArray(item.events)||
      item.events.length!==state.ledger.length+1||
      !config.audit.validate(item.events).ok||item.event.outcome!==(allowed?"allowed":"denied"))
     return null;
   }catch(e){return null;}
   return item.events;
  }
  function reject(code){
   const entries=auditAttempt(false,code);
   if(!entries)return fail("AUDIT_FAILED");
   // REJECTED business operation; only the fake audit ledger changes.
   state={...state,ledger:deep(entries)};
   return fail(code,true,{eventSequence:entries.length});
  }
  let d,policy,membership=null,actor,scope=null;
  try{
   d=config.directory();
   policy=config.security.authorize(d,trustedSession,
    step.staff?{action:"adminRead"}:{organizationId,siteId,action:step.permission},request.now);
  }catch(e){return fail("SECURITY_CHECK_FAILED");}
  if(!plain(policy)||policy.authorizationIsReal!==false||policy.go!==false||
    typeof policy.allowed!=="boolean")return fail("SECURITY_CHECK_FAILED");
  if(!policy.allowed)return reject("ACCESS_DENIED");
  if(step.staff){
   // V23 adminRead checks staff role/MFA but not site membership.
   const org=d.organizations.filter(x=>x.id===organizationId&&x.status==="active");
   const site=d.sites.filter(x=>x.id===siteId&&x.organizationId===organizationId&&x.status!=="suspended");
   if(org.length!==1||site.length!==1)return reject("SITE_NOT_FOUND");
   const principals=d.staff.filter(x=>x.userId===trustedSession.userId&&x.role==="SUPERADMIN"&&x.status==="active");
   if(principals.length!==1)return reject("ACCESS_DENIED");
   actor={role:"SUPERADMIN",kind:"staff",active:true,aal:"aal2"};
  }else{
   const members=d.memberships.filter(x=>x.organizationId===organizationId&&x.userId===trustedSession.userId);
   if(members.length!==1||members[0].status!=="active")return reject("ACCESS_DENIED");
   membership=members[0];
   if(d.staff.some(x=>x.userId===trustedSession.userId&&x.status==="active"))
     return reject("STAFF_CLIENT_CONTEXT_CONFLICT");
   const all=["CLIENT_OWNER","CLIENT_ADMIN"].includes(membership.role);
   scope=all?{organizationId,level:"all",siteIds:[]}:
     {organizationId,level:"selected",siteIds:d.scopes.filter(x=>
       x.membershipId===membership.id&&x.organizationId===organizationId&&x.status==="active").map(x=>x.siteId)};
   actor={role:membership.role,kind:"client",active:true,aal:"aal1"};
  }
  // The request's actor/role/scope/claims are never read.
  const signature=JSON.stringify([trustedSession.userId,trustedSession.sessionId,organizationId,
   siteId,proposalId,action,request.expectedRevision,request.expectedDraftVersion??null,
   request.note??null,request.eventId]);
  const previous=completed.get(request.operationId);
  if(previous){
   if(signature!==previous.signature)return reject("IDEMPOTENCY_CONFLICT");
   return {...deep(previous.receipt),replayed:true};
  }
  const sites=state.sites.filter(s=>s.id===siteId&&s.organizationId===organizationId);
  if(sites.length!==1)return reject("SITE_NOT_FOUND");
  const site=sites[0],matches=state.proposals.filter(p=>p.id===proposalId);
  if(action==="create"&&matches.length!==0)return reject("PROPOSAL_EXISTS");
  if(action!=="create"&&(
   matches.length!==1||matches[0].organizationId!==organizationId||
   matches[0].siteId!==siteId))return reject("PROPOSAL_NOT_FOUND");
  const p=action==="create"?null:matches[0];
  let contract;
  try{
   contract=config.contracts.contractDecision({
    action,status:p?p.status:null,
    currentRevision:p?p.revision:0,expectedRevision:request.expectedRevision,
    currentDraftVersion:site.draftVersion,expectedDraftVersion:request.expectedDraftVersion,
    actor,scope,organizationId,siteId,note:request.note
   });
  }catch(e){return fail("CONTRACT_ERROR");}
  if(!plain(contract)||contract.authorizationIsReal===true||
    typeof contract.ok!=="boolean")return fail("CONTRACT_ERROR");
  if(!contract.ok)return reject(contract.code);
  if(contract.authorizationIsReal!==false)return fail("CONTRACT_ERROR");
  let home=null;
  if(action==="apply"){
   home=config.contracts.canonicalPages(site.pages);
   if(!home.ok)return reject(home.code);
  }
  // Prepare a new snapshot. If simulated audit fails, business state stays unchanged.
  const log=auditAttempt(true,"SIMULATED_ALLOW");
  if(!log)return fail("AUDIT_FAILED");
  const next=deep(state),target=next.sites.find(x=>x.id===siteId&&x.organizationId===organizationId);
  let proposal;
  if(action==="create"){
   proposal={id:proposalId,organizationId,siteId,status:contract.state,revision:contract.revision};
   next.proposals.push(proposal);
  }else{
   proposal=next.proposals.find(x=>x.id===proposalId);
   proposal.status=contract.state;
   proposal.revision=contract.revision;
  }
  if(action==="apply"){
   target.draftVersion=contract.draftVersion;
   target.pages=home.pages;
  }
  next.ledger=deep(log);
  const receipt={ok:true,committed:true,attemptLogged:true,
   proposalId,state:proposal.status,revision:proposal.revision,
   draftVersion:target.draftVersion,eventSequence:log.length,replayed:false,
   simulationOnly:true,go:false,published:false};
  state=next;
  completed.set(request.operationId,{signature,receipt:deep(receipt)});
  return receipt;
 }
 return Object.freeze({version:VERSION,mode:"memory-demo-only",execute,snapshot});
}
root.MGProposalFlowV27=Object.freeze({version:VERSION,actions:Object.freeze(Object.keys(CONFIG)),
 createWorkflow});
})(typeof window!=="undefined"?window:globalThis);
