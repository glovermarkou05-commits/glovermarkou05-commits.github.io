"use strict";
/* V36 coordinated review test; fake filesystem and pure manifest checks only.
 * node apps/mg-web-studio-cloud/tests/coordinated-review-v36.test.cjs
 * No SQL execution, DB, network, migration runner, browser or deployment.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(base,p),"utf8");
const source=read("staging/v36-preflight.cjs");
function initialize(cli=false){
 const module={exports:{}},messages=[],processStub={exitCode:0};
 const customRequire=n=>require(n);
 customRequire.main=cli?module:null;
 new Function("require","__dirname","module","console","process",source)(
  customRequire,path.join(base,"staging"),module,{log:s=>messages.push(s)},processStub);
 return {api:module.exports,messages,exitCode:processStub.exitCode};
}
const api=initialize().api,files=api.readFiles(read),original=JSON.stringify(files);
let n=0;const check=(name,v)=>{assert.ok(v,name);n++},copy=x=>JSON.parse(JSON.stringify(x));
const report=api.assess(files);
check("V36 version",report.version===36);
check("V36 mode read only",report.mode==="static-review-no-execution");
check("V36 manifest valid",report.valid);
check("V36 has zero issues",report.issues.length===0);
check("Decision NO GO",report.decision==="NO_GO");
check("Staging NO GO",report.stagingReady===false);
check("Production NO GO",report.productionReady===false);
check("Zero backend tests",report.actualDatabaseTests===0);
check("Zero SQL statements executed",report.actualSqlStatements===0);
check("Zero backups performed",report.actualBackups===0);
check("Cannot provision",report.mayProvision===false);
check("Cannot run SQL",report.mayRunSQL===false);
check("Cannot deploy",report.mayDeploy===false);
check("Cannot publish",report.mayPublish===false);
check("Cannot send email",report.maySendEmail===false);
check("Cannot charge",report.mayCharge===false);
check("Cannot call paid AI",report.mayUsePaidAI===false);
check("Seven source docs",report.sourceDocuments===7);
check("Four comment-only docs",report.reviewedCommentOnlyFiles===4);
check("Eight gated phases",report.phases===8);
check("Sixteen V18 gates pending",report.realGatesPending===16);
check("Two separate approvals pending",report.approvalsPending===2);
check("Historical active SQL quarantined",report.historicalActiveSqlQuarantined);
check("Only permitted step review",report.nextPermittedStep==="REVIEW_PLAN_ONLY");
check("Input not mutated",JSON.stringify(files)===original);
check("Expected manifest ref",api.FILES.manifest==="staging/v36-coordinated-changes.review.json");
check("Expected SQL hazard ref",api.FILES.rlsHazard==="db/v13-endurecimiento-rls-legado.review.sql");
check("Original SQL still has active statements",/\nbegin;\s*\n/i.test(files.rlsHazard));
check("Hazard never executable in manifest",files.manifest.sourceDocs.find(x=>x.path===api.FILES.rlsHazard).execute===false);
check("Migration package never executable",files.manifest.intendedMode==="review-only-not-executable");
check("Migration phases unauthorized",files.manifest.phases.every(x=>x.status==="BLOCKED_NOT_AUTHORIZED"));
check("Migration phases all demand real environment",files.manifest.phases.every(x=>x.requiresRealEnvironment));
check("No successful evidence",Object.values(files.manifest.evidence).every(x=>x===0||x===false));
check("No approval provider",files.manifest.authorization.provider===null);
check("No approved region",files.manifest.authorization.region===null);
check("No approved budget",files.manifest.authorization.costApproved===false);
check("No accepted signoff",files.manifest.acceptance.signoffRef===null);
check("Core schema already has unique site slug",files.originalCore.includes("unique(site_id,slug)"));
check("Core grants insert to authenticated",files.originalCore.includes("grant select, insert on public.mg_pages to authenticated"));
check("Historical V13 status exists",files.originalV13.includes("submitted_for_review"));
check("Historical V13 applied exists",files.originalV13.includes("applied_to_draft"));
check("Current V13 historical unchanged",!files.originalV13.includes("check(status in ('draft','submitted','needs_changes'"));
check("Comment-only V36 rollback documented",files.reviewV36.includes("Mapping inverso SOLO en status"));
for(const name of ["reviewV20","reviewV34","reviewV35","reviewV36"])
 check(name+" comment only",files[name].split(/\r?\n/).every(l=>!l.trim()||l.trim().startsWith("--")));
const summary=api.output(report);
check("Output says NO GO",summary.includes("NO GO"));
check("Output warns SQL quarantine",summary.includes("CUARENTENA"));
check("Output says no SQL executed",summary.includes("SQL ejecutado: 0"));
check("No CLI SQL executor",!source.includes("child_process"));
check("No CLI file writes",!source.includes("writeFileSync")&&!source.includes("appendFileSync"));
check("No fetch",!source.includes("fetch("));
check("No Supabase SDK",!source.includes("supabase."));
check("Missing source invalid",!api.assess({}).valid&&api.assess({}).decision==="NO_GO");
check("Null source invalid",!api.assess(null).valid);
const replace=(src,change)=>{const next=copy(src);change(next);return api.assess(next)};
function tamper(name,change,expected){
 const v=replace(files,change);
 check(name+" rejected",!v.valid&&v.issues.includes(expected));
 check(name+" stays NO GO",v.decision==="NO_GO"&&!v.mayRunSQL&&!v.mayPublish);
}
const mutations=[
 ["Wrong project",x=>x.manifest.project="other","IDENTITY_OR_DEPENDENCIES_CHANGED"],
 ["Wrong branch",x=>x.manifest.branch="main","IDENTITY_OR_DEPENDENCIES_CHANGED"],
 ["Change task",x=>x.manifest.taskId="D01","IDENTITY_OR_DEPENDENCIES_CHANGED"],
 ["Remove predecessor",x=>x.manifest.previous.pop(),"IDENTITY_OR_DEPENDENCIES_CHANGED"],
 ["Fake staging",x=>x.manifest.authorization.stagingApproved=true,"AUTHORIZATION_FORGED"],
 ["Fake production",x=>x.manifest.authorization.productionApproved=true,"AUTHORIZATION_FORGED"],
 ["Fake costs",x=>x.manifest.authorization.costApproved=true,"AUTHORIZATION_FORGED"],
 ["Set provider",x=>x.manifest.authorization.provider="Supabase","AUTHORIZATION_FORGED"],
 ["Set region",x=>x.manifest.authorization.region="us-east-1","AUTHORIZATION_FORGED"],
 ["Write SQL allowed",x=>x.manifest.execution.mayRunSQL=true,"EXECUTION_ALLOWED"],
 ["Provision allowed",x=>x.manifest.execution.mayProvision=true,"EXECUTION_ALLOWED"],
 ["Deploy allowed",x=>x.manifest.execution.mayDeploy=true,"EXECUTION_ALLOWED"],
 ["Publish allowed",x=>x.manifest.execution.mayPublish=true,"EXECUTION_ALLOWED"],
 ["Cron allowed",x=>x.manifest.execution.mayScheduleCron=true,"EXECUTION_ALLOWED"],
 ["Email allowed",x=>x.manifest.execution.maySendEmail=true,"EXECUTION_ALLOWED"],
 ["AI allowed",x=>x.manifest.execution.mayUsePaidAI=true,"EXECUTION_ALLOWED"],
 ["Charge allowed",x=>x.manifest.execution.mayCharge=true,"EXECUTION_ALLOWED"],
 ["Modify main",x=>x.manifest.execution.mayModifyMain=true,"EXECUTION_ALLOWED"],
 ["Modify other projects",x=>x.manifest.execution.mayModifyOtherProjects=true,"EXECUTION_ALLOWED"],
 ["Inject unknown flag",x=>x.manifest.execution.mayExecuteAnything=true,"EXECUTION_ALLOWED"],
 ["Remove SQL source",x=>x.manifest.sourceDocs.pop(),"SQL_SOURCE_QUARANTINE_FAILED"],
 ["Make RLS hazard runnable",x=>x.manifest.sourceDocs.find(y=>y.path===api.FILES.rlsHazard).execute=true,"SQL_SOURCE_QUARANTINE_FAILED"],
 ["Misclassify RLS hazard",x=>x.manifest.sourceDocs.find(y=>y.path===api.FILES.rlsHazard).kind="comment-only-design","SQL_SOURCE_QUARANTINE_FAILED"],
 ["Change V34 to runnable SQL",x=>x.reviewV34+="\nupdate public.mg_pages set slug='home';","ACTIVE_SQL_IN_COMMENT_ONLY_PACKAGE"],
 ["Change V35 to runnable SQL",x=>x.reviewV35+="\nbegin;","ACTIVE_SQL_IN_COMMENT_ONLY_PACKAGE"],
 ["Change V36 to runnable SQL",x=>x.reviewV36+="\ncommit;","ACTIVE_SQL_IN_COMMENT_ONLY_PACKAGE"],
 ["Change V20 to runnable SQL",x=>x.reviewV20+="\nalter table public.mg_pages add column foo text;","ACTIVE_SQL_IN_COMMENT_ONLY_PACKAGE"],
 ["Remove historical hazard",x=>x.rlsHazard="-- no active code","RLS_HISTORICAL_HAZARD_NOT_RECOGNIZED"],
 ["Core baseline missing",x=>x.originalCore="","HOME_BASELINE_UNVERIFIED"],
 ["Original proposals missing",x=>x.originalV13="","V13_STATUS_BASELINE_UNVERIFIED"],
 ["Change Home slug",x=>x.manifest.compatibility.homeInternalSlug="","COMPATIBILITY_OR_ROLLBACK_UNSAFE"],
 ["Change public root",x=>x.manifest.compatibility.homePublicRoute="/home","COMPATIBILITY_OR_ROLLBACK_UNSAFE"],
 ["Claim Home implemented",x=>x.manifest.compatibility.homeGuaranteeImplemented=true,"COMPATIBILITY_OR_ROLLBACK_UNSAFE"],
 ["Remove mapping",x=>x.manifest.compatibility.mappings.pop(),"COMPATIBILITY_OR_ROLLBACK_UNSAFE"],
 ["Change mapping target",x=>x.manifest.compatibility.mappings[0].to="submitted_for_review","COMPATIBILITY_OR_ROLLBACK_UNSAFE"],
 ["Modify historical decisions",x=>x.manifest.compatibility.preserveReviewDecisions[1]="needs_changes","COMPATIBILITY_OR_ROLLBACK_UNSAFE"],
 ["Modify event types",x=>x.manifest.compatibility.preserveEventTypes[2]="needs_changes","COMPATIBILITY_OR_ROLLBACK_UNSAFE"],
 ["Claim atomicity implemented",x=>x.manifest.compatibility.transactionImplemented=true,"COMPATIBILITY_OR_ROLLBACK_UNSAFE"],
 ["Drop rollback strategy",x=>x.manifest.compatibility.rollbackStrategy="none","COMPATIBILITY_OR_ROLLBACK_UNSAFE"],
 ["Remove phase",x=>x.manifest.phases.pop(),"PHASES_OR_GATES_CHANGED"],
 ["Swap phase order",x=>x.manifest.phases.reverse(),"PHASES_OR_GATES_CHANGED"],
 ["Skip phase approval",x=>x.manifest.phases[0].status="PASSED","PHASES_OR_GATES_CHANGED"],
 ["Fake environment unnecessary",x=>x.manifest.phases[1].requiresRealEnvironment=false,"PHASES_OR_GATES_CHANGED"],
 ["Forward dependency",x=>x.manifest.phases[0].depends.push("P07"),"PHASES_OR_GATES_CHANGED"],
 ["Fake SQL executions",x=>x.manifest.evidence.sqlStatementsExecuted=1,"REAL_EVIDENCE_FABRICATED"],
 ["Fake DB tests",x=>x.manifest.evidence.realDatabaseTests=1,"REAL_EVIDENCE_FABRICATED"],
 ["Fake backup",x=>x.manifest.evidence.backupTested=true,"REAL_EVIDENCE_FABRICATED"],
 ["Fake migration",x=>x.manifest.evidence.statusMigrationApplied=true,"REAL_EVIDENCE_FABRICATED"],
 ["Fake stage GO",x=>x.manifest.acceptance.staging="GO","RELEASE_GATE_CHANGED"],
 ["Fake prod GO",x=>x.manifest.acceptance.production="GO","RELEASE_GATE_CHANGED"],
 ["Pretend signed off",x=>x.manifest.acceptance.signoffRef="GO","RELEASE_GATE_CHANGED"],
 ["Original master authorized",x=>x.planV33.stagingAuthorized=true,"MASTER_ROADMAP_GATE_CHANGED"],
 ["C03 marked complete in master",x=>x.planV33.tasks.find(t=>t.id==="C03").status="DONE","MASTER_ROADMAP_GATE_CHANGED"],
 ["Staging authorization changed",x=>x.gateV18.authorization.granted=true,"STAGING_GATE_CHANGED"],
 ["Staging SQL enabled",x=>x.gateV18.execution.mayRunMigrations=true,"STAGING_GATE_CHANGED"],
 ["Staging check marked passed",x=>x.gateV18.checks[0].status="passed","STAGING_GATE_CHANGED"],
 ["Remove rollback discussion",x=>x.reviewV36="-- Summary only","DOCUMENTATION_INCOMPLETE"]
];
for(const [name,fn,code] of mutations)tamper(name,fn,code);
const cli=initialize(true);
check("Valid CLI returns expected NO GO exit 2",cli.exitCode===2);
check("Valid CLI prints NO GO",cli.messages.length===1&&cli.messages[0].includes("NO GO"));
let missing=false;try{api.readFiles(p=>{if(p===api.FILES.rlsHazard)throw Error("simulated missing");return read(p)})}catch(e){missing=true;}
check("Missing source does not silently pass",missing);
check("No source mutation after tests",JSON.stringify(files)===original);
console.log(n+" / "+n+" V36 coordinated review checks passed. NO GO, 0 SQL executed.");
