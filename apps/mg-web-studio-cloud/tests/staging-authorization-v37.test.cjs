"use strict";
/* V37: document-only approval boundaries, no SQL, Supabase, external apps.
 * node apps/mg-web-studio-cloud/tests/staging-authorization-v37.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const code=read("staging/v37-authorization-preflight.cjs");
const clone=x=>JSON.parse(JSON.stringify(x));
function setup(asCli=false){
 const module={exports:{}},logs=[],processShim={exitCode:0};
 const mockRequire=k=>require(k);mockRequire.main=asCli?module:null;
 new Function("require","__dirname","module","console","process",code)(
  mockRequire,path.join(__dirname,"..","staging"),module,{log:s=>logs.push(s)},processShim
 );
 return {api:module.exports,logs,exitCode:processShim.exitCode};
}
const {api}=setup();
const files=api.readFiles(read),original=JSON.stringify(files);
let n=0;function check(name,ok){assert.ok(ok,name);n++;}
const baseline=api.assess(files),packet=files.request;
check("V37 version",baseline.version===37);
check("V37 mode",baseline.mode==="static-request-review");
check("V37 packet consistent",baseline.valid);
check("No inconsistencies",baseline.issues.length===0);
check("NO GO status",baseline.status==="NO_GO");
check("Not authorized decision",baseline.decision==="NOT_AUTHORIZED");
check("No staging ready",baseline.stagingReady===false);
check("No production ready",baseline.productionReady===false);
check("No real tests",baseline.realTestsVerified===0);
check("No real resources",baseline.realResourcesCreated===0);
for(const key of ["mayProvision","mayConnectDatabase","mayExecuteSQL","mayDeploy",
 "mayPublish","mayBill","maySendNotifications","mayCallPaidAI"])
 check("Cannot "+key,baseline[key]===false);
check("Preapproval count is 5",baseline.preApprovalPending===5);
check("Postapproval count is 11",baseline.postApprovalChecksPending===11);
check("V18 all 16 classified",baseline.classifiedV18Checks===16);
check("No question answered",baseline.openQuestions===9);
check("Seven risks",baseline.risksToReview===7);
check("No automatic authorization",baseline.authorizationCanBeInferredFromJson===false);
check("G01 explicit decision",baseline.firstRequiredDecision==="APPROVE_ONLY_A_BOUNDED_STAGING_REQUEST_EXTERNALLY");
check("No input mutation",JSON.stringify(files)===original);
check("Request is not authorization",packet.notAnAuthorization===true);
check("Historical SQL quarantined",packet.knownRisks.some(x=>x.code==="SQL_ACTIVE_IN_REVIEW_FILE"));
check("No production data",packet.dataRestrictions.noProductionData===true);
check("No Github secrets",packet.dataRestrictions.noSecretsInGitHub===true);
check("No user datasets",packet.dataRestrictions.syntheticOnly===true);
check("Only static Github review permitted",packet.boundedScope.reviewExistingGitHub===true);
check("All other actions forbidden",Object.entries(packet.boundedScope).every(([k,v])=>k==="reviewExistingGitHub"?v===true:v===false));
check("Checks match V18 ids",JSON.stringify(packet.evidenceClassification.map(x=>x.id))===JSON.stringify(files.v18.checks.map(x=>x.id)));
check("All 16 V18 original pending",files.v18.checks.every(x=>x.status==="pending"&&x.evidenceRef===null));
check("All 16 V37 pending",packet.evidenceClassification.every(x=>x.status==="PENDING"&&x.evidence===null));
check("Five prereqs",packet.evidenceClassification.filter(x=>x.stage==="approval-prerequisite").length===5);
check("Eleven real validation checks",packet.evidenceClassification.filter(x=>x.stage==="post-approval-validation").length===11);
check("QA smoke test after approval",packet.evidenceClassification.find(x=>x.id==="smoke_e2e").stage==="post-approval-validation");
check("Restoration after approval",packet.evidenceClassification.find(x=>x.id==="backup_restore").stage==="post-approval-validation");
check("Privacy policy before approval",packet.evidenceClassification.find(x=>x.id==="privacy_fixtures").stage==="approval-prerequisite");
check("All questions blank",packet.decisionQuestions.every(x=>x.value===null&&x.required===true));
check("All six reviewer checks open",packet.reviewerChecklist.every(x=>x.status==="OPEN"));
check("Seven known risks high",packet.knownRisks.every(x=>x.severity==="high"));
check("No real resources in packet",Object.values(packet.realExecution).every(x=>x===0));
check("No signoff in V36",files.v36.acceptance.signoffRef===null);
check("No staging authorization in V18",files.v18.authorization.granted===false);
check("No staging authorization in V33",files.v33.stagingAuthorized===false);
check("No staging authorization in V36",files.v36.authorization.stagingApproved===false);
check("No production authorization in V36",files.v36.authorization.productionApproved===false);
check("Active SQL is recognized not run",files.rlsHazard.includes("begin;")&&files.rlsHazard.includes("revoke insert,update,delete"));
check("Packet does not contain keys",!JSON.stringify(packet).includes("service_role_key"));
check("Packet has no URLs with credentials",!JSON.stringify(packet).includes("postgres://"));
check("No network in inspector",!code.includes("fetch(")&&!code.includes("http.request"));
check("No Supabase in inspector",!code.includes("supabase."));
check("No SQL runner",!code.includes("child_process")&&!code.includes("pg.Client"));
check("No writing local files",!code.includes("writeFileSync")&&!code.includes("appendFileSync"));
check("No fake timer",!code.includes("setTimeout("));
check("No environment variable read",!code.includes("process.env"));
const summary=api.render(baseline);
check("Readable NO GO response",summary.includes("NO GO"));
check("Readable not-authorized response",summary.includes("NO AUTORIZADO"));
check("Readable questions count",summary.includes("9"));
check("Readable pre/post split",summary.includes("5 requisitos")&&summary.includes("11"));
function mut(name,change,expected){
 const altered=clone(files);change(altered);
 const res=api.assess(altered);
 check(name+" detected",!res.valid&&res.issues.includes(expected));
 check(name+" remains NO GO",res.status==="NO_GO"&&res.decision==="NOT_AUTHORIZED"&&!res.mayProvision&&!res.mayExecuteSQL);
}
const tamper=[
 ["Wrong project",x=>x.request.project="Other","PACKAGE_IDENTITY_CHANGED"],
 ["Wrong branch",x=>x.request.branch="main","PACKAGE_IDENTITY_CHANGED"],
 ["Wrong task",x=>x.request.sourceTask="P01","PACKAGE_IDENTITY_CHANGED"],
 ["Fake current decision",x=>x.request.currentDecision="AUTHORIZED","PACKAGE_IDENTITY_CHANGED"],
 ["Claim packet is approval",x=>x.request.notAnAuthorization=false,"PACKAGE_IDENTITY_CHANGED"],
 ["Fake approval",x=>x.request.authorization.granted=true,"FORGED_APPROVAL"],
 ["Fake approver",x=>x.request.authorization.approver="example","FORGED_APPROVAL"],
 ["Fake approval reference",x=>x.request.authorization.reference="123","FORGED_APPROVAL"],
 ["Choose provider",x=>x.request.target.provider="Supabase","PROVIDER_OR_BUDGET_UNVERIFIED"],
 ["Set account",x=>x.request.target.account="actual","PROVIDER_OR_BUDGET_UNVERIFIED"],
 ["Set region",x=>x.request.target.region="US","PROVIDER_OR_BUDGET_UNVERIFIED"],
 ["Set budget",x=>x.request.target.monthlyBudgetUsd=50,"PROVIDER_OR_BUDGET_UNVERIFIED"],
 ["Set plan",x=>x.request.target.plan="Pro","PROVIDER_OR_BUDGET_UNVERIFIED"],
 ["Unexpected target value",x=>x.request.target.hiddenToken="secret","PROVIDER_OR_BUDGET_UNVERIFIED"],
 ["Permit production data",x=>x.request.dataRestrictions.noProductionData=false,"DATA_BOUNDARY_UNSAFE"],
 ["Permit secrets in Github",x=>x.request.dataRestrictions.noSecretsInGitHub=false,"DATA_BOUNDARY_UNSAFE"],
 ["Permit client uploads",x=>x.request.dataRestrictions.noClientUploads=false,"DATA_BOUNDARY_UNSAFE"],
 ["Permit cross-tenant shared instance",x=>x.request.dataRestrictions.separateTenantAndAccess=false,"DATA_BOUNDARY_UNSAFE"],
 ["Create env",x=>x.request.boundedScope.createEnvironment=true,"UNAUTHORIZED_OPERATIONS"],
 ["Connect DB",x=>x.request.boundedScope.accessDatabase=true,"UNAUTHORIZED_OPERATIONS"],
 ["Run SQL",x=>x.request.boundedScope.runSQL=true,"UNAUTHORIZED_OPERATIONS"],
 ["Deploy backend",x=>x.request.boundedScope.deployBackend=true,"UNAUTHORIZED_OPERATIONS"],
 ["Send notices",x=>x.request.boundedScope.sendNotifications=true,"UNAUTHORIZED_OPERATIONS"],
 ["Activate payments",x=>x.request.boundedScope.activatePayments=true,"UNAUTHORIZED_OPERATIONS"],
 ["Schedule worker",x=>x.request.boundedScope.scheduleJobs=true,"UNAUTHORIZED_OPERATIONS"],
 ["Publish",x=>x.request.boundedScope.publish=true,"UNAUTHORIZED_OPERATIONS"],
 ["Call paid AI",x=>x.request.boundedScope.callPaidAI=true,"UNAUTHORIZED_OPERATIONS"],
 ["Change main",x=>x.request.boundedScope.modifyMain=true,"UNAUTHORIZED_OPERATIONS"],
 ["Change other projects",x=>x.request.boundedScope.modifyOtherProjects=true,"UNAUTHORIZED_OPERATIONS"],
 ["Extra rights",x=>x.request.boundedScope.sudo=true,"UNAUTHORIZED_OPERATIONS"],
 ["Remove Github-only review",x=>x.request.boundedScope.reviewExistingGitHub=false,"UNAUTHORIZED_OPERATIONS"],
 ["Fake answer",x=>x.request.decisionQuestions[0].value="approved","AUTHORIZATION_QUESTIONS_UNANSWERED_OR_TAMPERED"],
 ["Missing question",x=>x.request.decisionQuestions.pop(),"AUTHORIZATION_QUESTIONS_UNANSWERED_OR_TAMPERED"],
 ["Duplicate question",x=>x.request.decisionQuestions[1].key="approver","AUTHORIZATION_QUESTIONS_UNANSWERED_OR_TAMPERED"],
 ["Question optional",x=>x.request.decisionQuestions[1].required=false,"AUTHORIZATION_QUESTIONS_UNANSWERED_OR_TAMPERED"],
 ["Reclassify QA as prerequisite",x=>x.request.evidenceClassification.find(z=>z.id==="smoke_e2e").stage="approval-prerequisite","CLASSIFICATION_CHANGED"],
 ["Make backup passed",x=>x.request.evidenceClassification.find(z=>z.id==="backup_restore").status="PASSED","CLASSIFICATION_CHANGED"],
 ["Fake RLS evidence",x=>x.request.evidenceClassification.find(z=>z.id==="rls_pgtest").evidence="db-proof","CLASSIFICATION_CHANGED"],
 ["Remove evidence id",x=>x.request.evidenceClassification.pop(),"CLASSIFICATION_CHANGED"],
 ["Fake reviewer done",x=>x.request.reviewerChecklist[0].status="DONE","REVIEW_CHECKLIST_CHANGED"],
 ["Drop reviewer step",x=>x.request.reviewerChecklist.pop(),"REVIEW_CHECKLIST_CHANGED"],
 ["Drop source",x=>x.request.sourceRefs.pop(),"EVIDENCE_SOURCES_CHANGED"],
 ["Duplicate source",x=>x.request.sourceRefs[0]=x.request.sourceRefs[1],"EVIDENCE_SOURCES_CHANGED"],
 ["Remove RLS risk",x=>x.request.knownRisks=x.request.knownRisks.filter(z=>z.code!=="RLS_MFA_NOT_TESTED"),"RISKS_REMOVED"],
 ["Downgrade risk",x=>x.request.knownRisks[0].severity="low","RISKS_REMOVED"],
 ["Drop safe action",x=>x.request.nextAllowedActions.pop(),"SAFE_NEXT_ACTIONS_CHANGED"],
 ["Fake preapproval count",x=>x.request.criteria.preApprovalRequirements=0,"READINESS_FALSIFIED"],
 ["Fake ready",x=>x.request.criteria.stage="GO","READINESS_FALSIFIED"],
 ["Fake production ready",x=>x.request.criteria.production="GO","READINESS_FALSIFIED"],
 ["Fake real tests",x=>x.request.criteria.realSQLTests=1,"READINESS_FALSIFIED"],
 ["Fake resources",x=>x.request.realExecution.resourcesCreated=1,"EXECUTION_FALSIFIED"],
 ["Fake SQL executed",x=>x.request.realExecution.queriesExecuted=1,"EXECUTION_FALSIFIED"],
 ["Fake charge",x=>x.request.realExecution.charges=5,"EXECUTION_FALSIFIED"],
 ["V18 fake approval",x=>x.v18.authorization.granted=true,"V18_PRECONDITIONS_CHANGED"],
 ["V18 SQL enabled",x=>x.v18.execution.mayRunMigrations=true,"V18_PRECONDITIONS_CHANGED"],
 ["V18 evidence forged",x=>x.v18.checks[0].status="passed","V18_PRECONDITIONS_CHANGED"],
 ["V33 stages approved",x=>x.v33.stagingAuthorized=true,"MASTER_APPROVAL_BOUNDARY_CHANGED"],
 ["V33 G01 complete",x=>x.v33.tasks.find(z=>z.id==="G01").status="DONE","MASTER_APPROVAL_BOUNDARY_CHANGED"],
 ["V36 fake approval",x=>x.v36.authorization.stagingApproved=true,"V36_MIGRATION_BOUNDARY_CHANGED"],
 ["V36 SQL allowed",x=>x.v36.execution.mayRunSQL=true,"V36_MIGRATION_BOUNDARY_CHANGED"],
 ["V36 phase executed",x=>x.v36.phases[0].status="DONE","V36_MIGRATION_BOUNDARY_CHANGED"],
 ["V36 evidence fake",x=>x.v36.evidence.sqlStatementsExecuted=1,"V36_MIGRATION_BOUNDARY_CHANGED"],
 ["Remove SQL hazard",x=>x.rlsHazard="-- no active sql","ACTIVE_SQL_HAZARD_NOT_RECOGNIZED"]
];
for(const [name,fn,expected] of tamper)mut(name,fn,expected);
const cli=setup(true);
check("CLI exits 2 when coherent but not authorized",cli.exitCode===2);
check("CLI prints NO GO",cli.logs.length===1&&cli.logs[0].includes("NO GO"));
let unreadable=false;try{api.readFiles(p=>{if(p===api.FILES.v18)throw Error("missing source");return read(p)})}catch(e){unreadable=true;}
check("Missing source cannot pass",unreadable);
check("Missing files fail closed",!api.assess({}).valid&&api.assess({}).status==="NO_GO");
check("Null input fail closed",!api.assess(null).valid);
check("Source unchanged after mutation tests",JSON.stringify(files)===original);
console.log(n+" / "+n+" V37 static authorization preflight checks passed; NOT_AUTHORIZED.");
