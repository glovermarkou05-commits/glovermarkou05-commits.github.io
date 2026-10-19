/* MG WEB STUDIO CLOUD V25 — SIMULATED orchestration only.
 * No real authorization, signing, HTTP, SQL, persistence or production deployment.
 * Caller-supplied sessions are TEST FIXTURES, never trustworthy outside test harness.
 * Integrates V20 proposal contracts, V23 tenant policy and V24 audit IN MEMORY.
 */
(function(root){"use strict";
const VERSION="25.0-review";
const MAPPING=Object.freeze({
 approve:Object.freeze({permission:"proposalApprove",audit:"proposal_approved"}),
 reject:Object.freeze({permission:"proposalReject",audit:"proposal_rejected"}),
 apply:Object.freeze({permission:"proposalApply",audit:"proposal_applied"})
});
const clone=x=>JSON.parse(JSON.stringify(x));
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const id=x=>typeof x==="string"&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(x);
const operation=x=>typeof x==="string"&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{7,99}$/.test(x);
const fail=(code)=>({ok:false,code,committed:false,simulationOnly:true,go:false});
const response=(payload)=>({ok:true,committed:true,simulationOnly:true,go:false,...payload});
function createWorkflow(config){
 if(!obj(config)||typeof config.directory!=="function"||!config.contracts||
  typeof config.contracts.contractDecision!=="function"||typeof config.contracts.canonicalPages!=="function"||
  !config.security||typeof config.security.authorize!=="function"||
  !config.audit||typeof config.audit.record!=="function"||typeof config.audit.validate!=="function"||
  !obj(config.initial)||!Array.isArray(config.initial.sites)||!Array.isArray(config.initial.proposals)||
  !Array.isArray(config.initial.ledger))throw new TypeError("Missing V20/V23/V24 modules or fixture.");
 let state=clone(config.initial),performed=new Map();
 if(!config.audit.validate(state.ledger).ok)throw new TypeError("Initial audit ledger invalid.");
 const proposalIds=new Set(),siteKeys=new Set();
 for(const site of state.sites){
  if(!obj(site)||!id(site.id)||!id(site.organizationId)||!Number.isSafeInteger(site.draftVersion)||
   site.draftVersion<1||!Array.isArray(site.pages))throw new TypeError("Invalid site fixture");
  const key=site.organizationId+"|"+site.id;
  if(siteKeys.has(key))throw new TypeError("Duplicate site fixture");
  siteKeys.add(key);
 }
 for(const p of state.proposals){
  if(!obj(p)||!id(p.id)||!siteKeys.has(p.organizationId+"|"+p.siteId)||
   !Number.isSafeInteger(p.revision)||p.revision<1||
   !config.contracts.normalizedState(p.status).ok||proposalIds.has(p.id))
   throw new TypeError("Invalid proposal fixture");
  proposalIds.add(p.id);
 }
 function snapshot(){return clone(state);}
 function execute(request){
  if(!obj(request)||!obj(request.trustedSession)||!Object.prototype.hasOwnProperty.call(MAPPING,request.action)||
   !operation(request.operationId)||!id(request.eventId)||
   !id(request.organizationId)||!id(request.siteId)||!id(request.proposalId)||
   !Number.isSafeInteger(request.now)||request.now<0)return fail("INVALID_REQUEST");
  const {action,organizationId,siteId,proposalId,trustedSession}=request;
  // V23 mock rechecks active membership, session and scope even for replay.
  let directory,policyDecision;
  try{
   directory=config.directory();
   policyDecision=config.security.authorize(directory,trustedSession,
    {organizationId,siteId,action:MAPPING[action].permission},request.now);
  }catch(e){return fail("SECURITY_CHECK_FAILED");}
  if(!obj(policyDecision)||policyDecision.authorizationIsReal!==false||policyDecision.go!==false||
   policyDecision.allowed!==true)return fail("ACCESS_DENIED");
  const member=directory&&Array.isArray(directory.memberships)?
   directory.memberships.filter(m=>m.organizationId===organizationId&&m.userId===trustedSession.userId):[];
  if(member.length!==1||member[0].status!=="active")return fail("AMBIGUOUS_MEMBERSHIP");
  const m=member[0],staff=Array.isArray(directory.staff)?directory.staff:[];
  if(staff.some(x=>x.userId===trustedSession.userId&&x.status==="active"))
   return fail("STAFF_CLIENT_CONTEXT_CONFLICT");
  const validOwner=m.role==="CLIENT_OWNER"||m.role==="CLIENT_ADMIN";
  const scoped=validOwner?{level:"all",organizationId,siteIds:[]}:
   {level:"selected",organizationId,siteIds:directory.scopes
    .filter(s=>s.membershipId===m.id&&s.organizationId===organizationId&&s.status==="active")
    .map(s=>s.siteId)};
  // Disallow payload-driven actor/role/scope; source is directory TEST fixture.
  const signature=JSON.stringify([trustedSession.userId,organizationId,siteId,proposalId,action,
   request.expectedRevision,request.expectedDraftVersion??null,request.note??null,request.eventId]);
  const prior=performed.get(request.operationId);
  if(prior){
   if(prior.signature!==signature)return fail("IDEMPOTENCY_CONFLICT");
   return {...clone(prior.receipt),replayed:true};
  }
  const matching=state.proposals.filter(p=>p.id===proposalId&&p.organizationId===organizationId&&p.siteId===siteId);
  if(matching.length!==1)return fail("PROPOSAL_NOT_FOUND");
  const p=matching[0],sites=state.sites.filter(s=>s.id===siteId&&s.organizationId===organizationId);
  if(sites.length!==1)return fail("SITE_NOT_FOUND");
  const site=sites[0];
  const contract=config.contracts.contractDecision({
   action,status:p.status,currentRevision:p.revision,expectedRevision:request.expectedRevision,
   currentDraftVersion:site.draftVersion,expectedDraftVersion:request.expectedDraftVersion,
   actor:{kind:"client",role:m.role,active:true,aal:"aal1"},
   organizationId,siteId,scope:scoped,note:request.note
  });
  if(!contract.ok)return fail(contract.code);
  if(contract.authorizationIsReal!==false)return fail("INVALID_CONTRACT");
  if(action==="apply"){
   const home=config.contracts.canonicalPages(site.pages);
   if(!home.ok)return fail(home.code);
  }
  // Attempt audit before changing the state: if recording fails, no business state can change.
  let auditResult;
  try{
   auditResult=config.audit.record(state.ledger,config.security,directory,trustedSession,
    {action:MAPPING[action].audit,organizationId,siteId,targetId:proposalId},
    request.now,request.eventId);
  }catch(e){return fail("AUDIT_FAILED");}
  if(!auditResult||auditResult.ok!==true||auditResult.simulatedDecision!==true||
    !Array.isArray(auditResult.events)||auditResult.events.length!==state.ledger.length+1||
    !config.audit.validate(auditResult.events).ok)return fail("AUDIT_FAILED");
  // All checks passed: one simulated snapshot swap, NOT a DB transaction.
  const next=clone(state);
  const nextP=next.proposals.find(x=>x.id===proposalId);
  const nextSite=next.sites.find(x=>x.id===siteId&&x.organizationId===organizationId);
  nextP.status=contract.state;
  nextP.revision=contract.revision;
  if(action==="apply"){
   nextSite.draftVersion=contract.draftVersion;
   nextSite.pages=config.contracts.canonicalPages(nextSite.pages).pages;
  }
  next.ledger=clone(auditResult.events);
  const receipt=response({proposalId,state:nextP.status,revision:nextP.revision,
   draftVersion:nextSite.draftVersion,eventSequence:next.ledger.length,replayed:false});
  state=next;performed.set(request.operationId,{signature,receipt:clone(receipt)});
  return receipt;
 }
 return Object.freeze({version:VERSION,mode:"memory-integration-only",execute,snapshot});
}
root.MGWorkflowV25=Object.freeze({version:VERSION,createWorkflow});
})(typeof window!=="undefined"?window:globalThis);
