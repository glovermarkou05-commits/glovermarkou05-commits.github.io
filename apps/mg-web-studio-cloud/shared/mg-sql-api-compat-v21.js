/* MG WEB STUDIO CLOUD V21 | read-only SQL/API compatibility audit.
 * Pure JavaScript. Never connects to database, network or deployment.
 */
(function(root) {
"use strict";
const STATES=Object.freeze(["draft","submitted","needs_changes","rejected","approved","applied"]);
const LEGACY=Object.freeze({submitted_for_review:"submitted",applied_to_draft:"applied"});
function clean(source){return String(source||"").replace(/--[^\n]*/g," ").replace(/\/\*[\s\S]*?\*\//g," ");}
function statusTokens(sql){
 const s=clean(sql), section=s.match(/create\s+table\s+public\.mg_site_proposals\s*\(([\s\S]*?)(?=\n\s*\);)/i);
 if(!section)return [];
 const m=section[1].match(/\bstatus\s+text\s+not\s+null[\s\S]*?check\s*\(\s*status\s+in\s*\(([\s\S]*?)\)\s*\)/i);
 return m?[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]):[];
}
function pageContract(sql){
 const s=clean(sql),t=s.match(/create\s+table\s+public\.mg_pages\s*\(([\s\S]*?)(?=\n\s*\);)/i);
 const v=t?t[1]:"";
 return {tableFound:!!t,nonEmptySlug:/slug\s+text\s+not\s+null\s+check/i.test(v),slugRegexAcceptsHome:/slug\s*~\s*'\^\[a-z0-9\]/i.test(v),uniqueSiteSlug:/unique\s*\(\s*site_id\s*,\s*slug\s*\)/i.test(v)};
}
function audit(inputs){
 const core=inputs&&inputs.core||"",proposals=inputs&&inputs.proposals||"",api=inputs&&inputs.api||"";
 const pages=pageContract(core),sqlStates=statusTokens(proposals);
 const apiStates=STATES.filter(s=>new RegExp("['\"]"+s+"['\"]").test(api));
 const issues=[];
 const add=(code,severity,detail)=>issues.push({code,severity,detail});
 if(!pages.tableFound||!pages.nonEmptySlug||!pages.slugRegexAcceptsHome||!pages.uniqueSiteSlug)
  add("HOME_SCHEMA_REVIEW","blocker","Page table/slug/uniqueness must be reviewed.");
 if(!sqlStates.length)add("SQL_STATUS_UNREADABLE","blocker","Proposal status CHECK not found.");
 else if(sqlStates.join("|")!==STATES.join("|"))add("STATUS_CONTRACT_MISMATCH","blocker","Legacy SQL status CHECK differs from canonical V20.");
 if(apiStates.length!==STATES.length)add("API_CONTRACT_UNVERIFIED","blocker","Canonical state tokens not all found in API contract.");
 add("HOME_EXISTENCE_UNPROVEN","blocker","Unique(site_id,slug) does not guarantee a Home for a published site.");
 add("SECURITY_DEFINER_REVIEW","blocker","Owner, EXECUTE, search_path and RLS must be verified in PostgreSQL.");
 add("CAS_SQL_TRANSACTION_UNPROVEN","blocker","Atomic compare-and-swap/idempotency/outbox not validated.");
 add("POSTGRES_REQUIRED","blocker","Real PostgreSQL parser, RLS and rollback tests not run.");
 return {version:"21.0-review",mode:"static-no-execution",pages,sqlStates,canonicalStates:STATES.slice(),apiStates,
  legacyReadAliases:{...LEGACY},issues,go:false,sqlExecuted:false,productionReady:false};
}
root.MGSqlApiCompatV21=Object.freeze({audit,statusTokens,pageContract,STATES,LEGACY});
})(typeof window!=="undefined"?window:globalThis);
