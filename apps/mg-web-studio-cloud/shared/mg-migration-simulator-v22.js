/* V22: pure in-memory transactional rehearsal; no SQL, IO, credentials or network. */
(function(root){"use strict";
const clone=x=>JSON.parse(JSON.stringify(x));
const fail=(code)=>({ok:false,code,committed:false});
function simulate(input,operations){
 if(!input||!Array.isArray(input.pages)||!Array.isArray(input.proposals)||!Array.isArray(operations))return fail("INVALID_INPUT");
 let state;try{state=clone(input)}catch(e){return fail("INVALID_INPUT")}
 const before=clone(state),events=[];
 for(const op of operations){
  if(!op||typeof op!=="object")return fail("INVALID_OPERATION");
  if(op.type==="normalizeHome"){
   const pages=state.pages.filter(p=>p.siteId===op.siteId);
   if(!pages.length)return fail("MISSING_SITE_PAGES");
   const homes=pages.filter(p=>p.slug===""||p.slug==="home");
   if(homes.length!==1)return fail("HOME_CARDINALITY");
   if(pages.some(p=>p!==homes[0]&&p.slug==="home"))return fail("HOME_CARDINALITY");
   homes[0].slug="home";events.push("HOME_NORMALIZED");
  }else if(op.type==="normalizeStatuses"){
   for(const p of state.proposals){
    if(p.status==="submitted_for_review")p.status="submitted";
    else if(p.status==="applied_to_draft")p.status="applied";
    else if(!["draft","submitted","needs_changes","rejected","approved","applied"].includes(p.status))return fail("UNKNOWN_STATUS");
   }events.push("STATUSES_NORMALIZED");
  }else if(op.type==="compareAndSwap"){
   const p=state.proposals.find(x=>x.id===op.id);
   if(!p)return fail("PROPOSAL_NOT_FOUND");
   if(!Number.isSafeInteger(op.expectedRevision)||p.revision!==op.expectedRevision)return fail("STALE_REVISION");
   if(!["draft","submitted","needs_changes","rejected","approved","applied"].includes(op.nextStatus))return fail("UNKNOWN_STATUS");
   if(p.status!==op.expectedStatus)return fail("STALE_STATUS");
   if(!Number.isSafeInteger(p.revision)||p.revision<1||p.revision===Number.MAX_SAFE_INTEGER)return fail("INVALID_REVISION");
   p.status=op.nextStatus;p.revision++;events.push("CAS_UPDATED");
  }else return fail("UNKNOWN_OPERATION");
 }
 // Ensure each site in simulated fixture has exactly one Home after normalization when pages are being touched.
 if(operations.some(op=>op.type==="normalizeHome")){
  for(const site of new Set(state.pages.map(p=>p.siteId))){
   const list=state.pages.filter(p=>p.siteId===site);
   if(list.filter(p=>p.slug==="home").length!==1)return fail("HOME_CARDINALITY");
   if(new Set(list.map(p=>p.slug)).size!==list.length)return fail("DUPLICATE_SLUG");
  }
 }
 return {ok:true,committed:true,state,originalUnchanged:JSON.stringify(input)===JSON.stringify(before),events,
  simulationOnly:true,sqlExecuted:false,productionReady:false,go:false};
}
function gate(manifest){
 const e=manifest&&manifest.execution||{};
 return {go:false,mayRunMigrations:false,mayDeploy:false,mayPublish:false,
   reason:"No real authorization can be inferred from an in-memory manifest",
   observedDryRun:e.dryRunOnly===true};
}
root.MGMigrationSimulatorV22=Object.freeze({simulate,gate,version:"22.0-review"});
})(typeof window!=="undefined"?window:globalThis);
