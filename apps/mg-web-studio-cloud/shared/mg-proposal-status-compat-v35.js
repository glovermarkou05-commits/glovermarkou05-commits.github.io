/* MG WEB STUDIO CLOUD V35 | C02 proposal status compatibility, REVIEW ONLY.
 * No SQL execution, DB/network calls, authentication, writes or real migration.
 * V13 SQL CHECK remains untouched. No backend semantics guaranteed.
 */
(function(root){"use strict";
const VERSION="35.0-review";
const CANONICAL=Object.freeze(["draft","submitted","needs_changes","rejected","approved","applied"]);
const LEGACY=Object.freeze(["draft","submitted_for_review","needs_changes","rejected","approved","applied_to_draft"]);
const ALIASES=Object.freeze({submitted_for_review:"submitted",applied_to_draft:"applied"});
const INVERSE=Object.freeze({submitted:"submitted_for_review",applied:"applied_to_draft"});
const REVIEW=Object.freeze(["approved","changes","rejected"]);
const EVENTS=Object.freeze(["submitted","approved","changes","rejected","applied"]);
const DECISION_STATE=Object.freeze({approved:"approved",changes:"needs_changes",rejected:"rejected"});
const ACTION_EVENT=Object.freeze({create:null,submit:"submitted",approve:"approved",
 changes:"changes",reject:"rejected",revise:null,apply:"applied"});
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const id=x=>typeof x==="string"&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(x);
const validRevision=x=>Number.isSafeInteger(x)&&x>=1;
const base=x=>({ok:true,version:VERSION,mode:"read-only-proposal-status-review",
 simulationOnly:true,go:false,mayRunSQL:false,mayWrite:false,mayPublish:false,
 realSchemaVerified:false,...x});
const fail=code=>base({ok:false,code});
function normalize(status,contracts){
 if(typeof status!=="string"||!contracts||typeof contracts.normalizedState!=="function")
  return fail("STATUS_OR_CONTRACT_REQUIRED");
 const value=contracts.normalizedState(status);
 if(!value||value.ok!==true||!CANONICAL.includes(value.status))return fail("INVALID_STATUS");
 return base({status:value.status,wasLegacy:own(ALIASES,status),sourceLabel:status,
  legacyStorageLabel:own(INVERSE,value.status)?INVERSE[value.status]:value.status,
  canonicalStorageLabel:value.status,writeRequiresVerifiedMigration:true});
}
function inspectFixture(rows,contracts){
 if(!Array.isArray(rows)||rows.length>1000||!contracts||
  typeof contracts.normalizedState!=="function")return fail("INVALID_FIXTURE");
 const seen=new Set(),summaries=[],counts=Object.fromEntries(CANONICAL.map(s=>[s,0]));
 let legacy=0;
 for(const row of rows){
  if(!obj(row)||!id(row.id)||!id(row.organizationId)||!id(row.siteId)||
   !validRevision(row.revision))return fail("INVALID_PROPOSAL_ROW");
  if(seen.has(row.id))return fail("DUPLICATE_PROPOSAL");
  seen.add(row.id);
  const check=normalize(row.status,contracts);
  if(!check.ok)return fail("UNRECOGNIZED_PROPOSAL_STATUS");
  if(check.wasLegacy)legacy++;
  counts[check.status]++;
  summaries.push({id:row.id,organizationId:row.organizationId,siteId:row.siteId,
   revision:row.revision,sourceStatus:row.status,canonicalStatus:check.status,
   wasLegacy:check.wasLegacy});
 }
 return base({rows:JSON.parse(JSON.stringify(summaries)),counts,legacyCount:legacy,
  canonicalCount:rows.length-legacy,rowsInspected:rows.length,
  proposedOnly:true,recordsConvertedInDatabase:0,changesApplied:false});
}
function verifyRelatedTypes(review,outbox,notifications){
 if(!Array.isArray(review)||!Array.isArray(outbox)||!Array.isArray(notifications))
  return fail("INVALID_RELATED_FIXTURE");
 const totals={reviews:review.length,outbox:outbox.length,notifications:notifications.length};
 for(const x of review){
  if(!obj(x)||!REVIEW.includes(x.decision)||!validRevision(x.revision))
   return fail("UNKNOWN_REVIEW_DECISION");
 }
 for(const [items,kind] of [[outbox,"OUTBOX"],[notifications,"NOTIFICATION"]]){
  for(const x of items){
   if(!obj(x)||!EVENTS.includes(x.eventType)||!validRevision(x.revision))
    return fail("UNKNOWN_"+kind+"_EVENT");
  }
 }
 return base({totals,decisionToState:{...DECISION_STATE},
  eventTypes:EVENTS.slice(),separateStatusAndEvents:true,recordsModified:0});
}
function stripComments(sql){
 if(typeof sql!=="string")return "";
 return sql.replace(/\/\*[\s\S]*?\*\//g," ").replace(/--[^\n]*/g," ");
}
function extractCheck(sql,table,column,pattern){
 const cleaned=stripComments(sql);
 const found=cleaned.match(new RegExp("create\\s+table\\s+"+table.replace(".","\\.")+"\\s*\\(([\\s\\S]*?)(?=\\n\\s*\\);)","i"));
 if(!found)return [];
 const col=found[1].match(new RegExp("\\b"+column+"\\s+text\\s+not\\s+null[\\s\\S]*?check\\s*\\(\\s*"+pattern+"\\s+in\\s*\\(([\\s\\S]*?)\\)\\s*\\)","i"));
 return col?[...col[1].matchAll(/'([^']+)'/g)].map(x=>x[1]):[];
}
function checkV13(sql){
 const states=extractCheck(sql,"public.mg_site_proposals","status","status");
 const decisions=extractCheck(sql,"public.mg_proposal_reviews","decision","decision");
 const notices=extractCheck(sql,"public.mg_proposal_notifications","event_type","event_type");
 const outbox=extractCheck(sql,"mg_private.mg_proposal_outbox","event_type","event_type");
 const checks={
  legacyProposalStates:JSON.stringify(states)===JSON.stringify(LEGACY),
  reviewDecisionTypes:JSON.stringify(decisions)===JSON.stringify(REVIEW),
  notificationEventTypes:JSON.stringify(notices)===JSON.stringify(EVENTS),
  outboxEventTypes:JSON.stringify(outbox)===JSON.stringify(EVENTS),
  statusIsDifferentFromEvents:!EVENTS.includes("needs_changes")&&!CANONICAL.includes("changes"),
  oldSubmittedDistinctFromEvent:states.includes("submitted_for_review")&&notices.includes("submitted")
 };
 return base({valid:Object.values(checks).every(Boolean),checks,
  found:{states,decisions,notices,outbox},statusContractMismatch:true,
  sqlExecuted:false,parserVerified:false,migrationApplied:false});
}
function projectWriteStatus(status,storedContract,contracts){
 const parsed=normalize(status,contracts);
 if(!parsed.ok)return parsed;
 if(!["legacy-v13-proposed","canonical-v20-proposed"].includes(storedContract))
  return fail("UNVERIFIED_TARGET_CONTRACT");
 const next=storedContract==="legacy-v13-proposed"?
  parsed.legacyStorageLabel:parsed.canonicalStorageLabel;
 return base({proposedStatus:next,targetReviewContract:storedContract,
  requiresTrustedBackendValidation:true,
  requiresVersionedMigration:storedContract==="canonical-v20-proposed",
  actualTargetVerified:false,realWritesPerformed:0});
}
function reviewTransition({status,action,contracts,actor,scope,organizationId,siteId,
 currentRevision,expectedRevision,currentDraftVersion,expectedDraftVersion,note}){
 if(!contracts||typeof contracts.contractDecision!=="function")return fail("CONTRACT_REQUIRED");
 let normalized=normalize(status,contracts);
 if(!normalized.ok)return normalized;
 let result;
 try{result=contracts.contractDecision({action,status:normalized.status,actor,scope,
  organizationId,siteId,currentRevision,expectedRevision,currentDraftVersion,expectedDraftVersion,note});}
 catch(e){return fail("TRANSITION_CHECK_FAILED");}
 if(!result||result.ok!==true)return fail(result&&result.code||"TRANSITION_DENIED");
 return base({from:normalized.status,wasLegacy:normalized.wasLegacy,action,
  to:result.state,revision:result.revision,relatedEvent:own(ACTION_EVENT,action)?ACTION_EVENT[action]:null,
  simulatedPermissionOnly:true,actualAuthorization:false,notPublished:true});
}
root.MGProposalStatusCompatV35=Object.freeze({version:VERSION,canonicalStates:CANONICAL,
 legacyStates:LEGACY,legacyAliases:ALIASES,reviewDecisions:REVIEW,eventTypes:EVENTS,
 normalize,inspectFixture,verifyRelatedTypes,checkV13,projectWriteStatus,reviewTransition});
})(typeof window!=="undefined"?window:globalThis);
