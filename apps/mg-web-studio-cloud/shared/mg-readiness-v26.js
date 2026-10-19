/* MG WEB STUDIO CLOUD V26 — CONSOLIDATED STATIC READINESS REPORT
 * Pure in-memory assessment of V17/V18/V19/V21 + V25 inventory.
 * Never authenticates, provisions, deploys, publishes, charges or executes SQL.
 * No user-supplied claim can produce GO. This is NOT a live security check.
 */
(function(root){"use strict";
const VERSION="26.0-review", BRANCH="feature/mg-digital-v5-web-services";
const validObject=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const uniq=items=>[...new Set(items)];
const frozen=x=>Object.freeze(x);
const CRITICAL_REVIEW=[
 ["AUTHORIZATION_MISSING","Governance","Specific approval for isolated infrastructure, region, owner, and spend limit is absent."],
 ["ISOLATED_STAGING_NOT_PROVEN","Infrastructure","No independent staging environment has been provisioned or checked."],
 ["AUTH_MFA_REAL_UNTESTED","Security","Only simulated sessions and MFA tests exist."],
 ["RLS_GRANTS_REAL_UNTESTED","Security","Database policies, grants, scopes and SECURITY DEFINER were not exercised on PostgreSQL."],
 ["REAL_CAS_OUTBOX_UNTESTED","Data","ACID, race handling, idempotency and outbox are unproven on a server."],
 ["BACKUP_RESTORE_REAL_UNTESTED","Recovery","No real backup/restore or rollback rehearsal exists."],
 ["REAL_MULTI_DEVICE_E2E_UNTESTED","Quality","No genuine multi-device, multi-session or browser integration run exists."],
 ["AUDIT_INTEGRITY_UNPROVEN","Security","V24 checksum is not cryptographic or persistent."],
 ["V25_PARTIAL_FLOW","Integration","V25 only rehearses approve, reject and apply; other transitions and publication are not integrated."],
 ["PRODUCTION_SIGNOFF_MISSING","Governance","Production and payment/AI activation require independent approvals."]
].map(x=>frozen({code:x[0],area:x[1],detail:x[2],kind:"requires-real-evidence"}));
function assess(deps,source){
 const issues=[],push=(code,area,detail,kind="invalid-source")=>issues.push({code,area,detail,kind});
 if(!validObject(deps)||!validObject(source)){
  push("MISSING_INPUT","Inventory","Dependencies and source artifacts are required.");
  return {version:VERSION,decision:"NO_GO",validInputs:false,blockers:issues.concat(CRITICAL_REVIEW),stageReady:false,
   productionReady:false,mayRunSQL:false,mayDeploy:false,simulationOnly:true,authorizationReal:false};
 }
 const versions=[["v17","17.0-review"],["v18","18.0-review"],["v19","19.0-review"],["v21","21.0-review"]];
 for(const [k,version] of versions)
  if(!validObject(deps[k])||deps[k].version!==version)push("DEPENDENCY_"+k.toUpperCase(),"Inventory","Missing or unexpected "+k+" evaluator.");
 const needed=["manifest","env","procedure","sqlReviews","v20ContractSource","v25WorkflowSource"];
 for(const key of needed)
  if(source[key]===undefined||source[key]===null)push("MISSING_"+key.toUpperCase(),"Inventory","Missing required input "+key+".");
 let stage=null,packageV18=null,sqlV19=null,contractV21=null;
 if(issues.length===0){
  try{
   stage=deps.v17.evaluate({});
   packageV18=deps.v18.inspect(source.manifest,source.env,source.procedure,source.sqlReviews);
   sqlV19=deps.v19.assess({manifest:source.manifest,sqlReviews:source.sqlReviews});
   contractV21=deps.v21.audit({
    core:source.sqlReviews["db/schema_core.review.sql"],
    proposals:source.sqlReviews["db/v13-propuestas-scopes.review.sql"],
    api:source.v20ContractSource
   });
  }catch(e){push("EVALUATOR_FAILED","Inventory","A required evaluator could not inspect the supplied snapshot.");}
 }
 if(stage&&!Array.isArray(deps.v17.requirements))
  push("STAGE_REQUIREMENTS_UNKNOWN","Governance","V17 requirement catalog is missing.");
 if(stage&&(stage.actualAuthorization!==false||stage.actualProductionPublished!==false||
    stage.summary.total!==deps.v17.requirements.length))
  push("STAGE_RESULT_UNTRUSTED","Governance","V17 evaluation result has unexpected shape.");
 if(packageV18&&(!packageV18.valid||packageV18.authorizedToDeploy!==false||
    packageV18.readyForStaging!==false||packageV18.readyForProduction!==false)){
  push("V18_PACKAGE_INVALID","Governance","Dry-run staging package has format or scope inconsistencies.");
 }
 if(sqlV19&&(!sqlV19.validInputs||sqlV19.readyForMigrations!==false||sqlV19.authorizedToDeploy!==false))
  push("V19_SQL_INVENTORY_INVALID","Data","Legacy SQL inventory is missing, altered or no longer dry-run.");
 if(contractV21&&(!Array.isArray(contractV21.issues)||contractV21.go!==false||
    contractV21.sqlExecuted!==false||contractV21.productionReady!==false))
  push("V21_CONTRACT_INVALID","Data","SQL/API analysis has unexpected shape.");
 if(typeof source.v25WorkflowSource==="string"){
  for(const term of ["approve:Object.freeze","reject:Object.freeze","apply:Object.freeze"])
   if(!source.v25WorkflowSource.includes(term))
    push("V25_INTEGRATION_MISSING","Integration","Expected V25 integration action is absent: "+term+".");
  if(/create:Object\.freeze|submit:Object\.freeze|publish:Object\.freeze/.test(source.v25WorkflowSource))
   push("V25_SCOPE_REVIEW","Integration","V25 scope has changed and needs a renewed review.");
 } else if(!issues.some(x=>x.code==="MISSING_V25WORKFLOWSOURCE"))
  push("V25_SOURCE_INVALID","Integration","V25 workflow is not a source-text fixture.");
 const m=source.manifest;
 if(validObject(m)&&m.sourceBranch!==BRANCH)push("WRONG_BRANCH","Governance","Unexpected source branch.");
 if(validObject(m)&&validObject(m.execution)&&
  Object.entries(m.execution).some(([key,val])=>key==="dryRunOnly"?val!==true:val!==false))
  push("EXECUTION_FLAGS_CHANGED","Governance","A capability flag is enabled.");
 const blocked=issues.concat(CRITICAL_REVIEW);
 const mismatches=contractV21&&Array.isArray(contractV21.issues)?
  contractV21.issues.map(x=>({code:x.code,area:"Contract",detail:x.detail,kind:"static-open"})):[];
 const staticIssues=sqlV19&&Array.isArray(sqlV19.issues)?
  sqlV19.issues.filter(x=>x.severity==="blocker").map(x=>({code:x.code,area:"SQL design",detail:x.detail,kind:"static-open"})):[];
 for(const i of mismatches.concat(staticIssues)){
  if(!blocked.some(x=>x.code===i.code))blocked.push(i);
 }
 const pending=validObject(m)&&Array.isArray(m.checks)?
  m.checks.filter(x=>x&&x.status==="pending").length:null;
 return {
  version:VERSION,mode:"consolidated-static-no-execution",decision:"NO_GO",
  sourceBranch:BRANCH,validInputs:issues.length===0&&!!packageV18&&packageV18.valid&&!!sqlV19&&sqlV19.validInputs,
  stageReady:false,productionReady:false,mayProvision:false,mayRunSQL:false,mayDeploy:false,
  mayPublish:false,mayCharge:false,mayCallPaidAI:false,authorizationReal:false,simulationOnly:true,
  checks:{
   v17Total:stage?stage.summary.total:null,
   v17Pending:stage?stage.summary.pending:null,
   v18ManifestPending:pending,
   v18StaticFormatValid:packageV18?packageV18.valid:false,
   v18SqlLoaded:packageV18&&packageV18.summary?packageV18.summary.reviewSqlLoaded:null,
   v19Tables:sqlV19?sqlV19.tables.length:null,
   v19BlockerCount:sqlV19?sqlV19.counts.blocker:null,
   v21OpenCount:contractV21&&contractV21.issues?contractV21.issues.length:null,
   v25SimulatedActions:3,
   realBackendTestsVerified:0
  },
  blockers:blocked,openCodes:uniq(blocked.map(x=>x.code)),
  warnings:["Passing JavaScript simulation cannot authorize use of PostgreSQL, paid AI, Lovable or production.",
   "Documented evidence is not independently verified; no live infrastructure was checked.",
   "Neither this evaluator nor repository content supplies authorization to spend or deploy."]
 };
}
function render(report){
 if(!validObject(report)||!Array.isArray(report.blockers))return "V26 NO GO | invalid report.";
 const c=report.checks||{};
 return [
  "MG WEB STUDIO CLOUD — V26 | NO GO",
  "Mode: static inspection; no SQL, staging, billing or publication.",
  "Input format: "+(report.validInputs?"valid":"needs review"),
  "Staging V18: "+(c.v18StaticFormatValid?"valid static format":"invalid/missing"),
  "Pending V18 prerequisites: "+(c.v18ManifestPending??"unknown"),
  "V17 requirements without real evidence: "+(c.v17Pending??"unknown"),
  "V19 SQL-design blockers: "+(c.v19BlockerCount??"unknown"),
  "V21 contract issues: "+(c.v21OpenCount??"unknown"),
  "V25 simulated operations: approve, reject, apply",
  "Open gate codes: "+report.openCodes.join(", "),
  "DECISION: NO GO. Human authorization and real technical evidence required."
 ].join("\n");
}
root.MGTechnicalReadinessV26=frozen({version:VERSION,assess,render});
})(typeof window!=="undefined"?window:globalThis);
