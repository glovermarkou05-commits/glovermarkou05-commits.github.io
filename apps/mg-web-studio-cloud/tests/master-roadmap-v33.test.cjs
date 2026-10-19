"use strict";
/* V33 MASTER QA — static GitHub-only backlog + gate review. No SQL or HTTP.
 * node apps/mg-web-studio-cloud/tests/master-roadmap-v33.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const read=f=>fs.readFileSync(path.join(root,f),"utf8");
const source=read("staging/v33-master-preflight.cjs");
function loadApi(cli=false){
 const moduleShim={exports:{}},logs=[],exit={exitCode:0};
 const mockRequire=k=>require(k);
 mockRequire.main=cli?moduleShim:null;
 new Function("require","__dirname","module","console","process",source)(
  mockRequire,path.join(root,"staging"),moduleShim,{log:x=>logs.push(x)},exit);
 return {api:moduleShim.exports,logs,exitCode:exit.exitCode};
}
const loaded=loadApi(),api=loaded.api,baseline=api.load(read),original=JSON.stringify(baseline);
let n=0;const check=(message,value)=>{assert.ok(value,message);n++};
const result=api.assess(baseline);
check("V33 preflight is pure review",result.mode==="review-only-static");
check("V33 version",result.version===33);
check("Valid baseline manifest",result.valid===true);
check("Baseline no inconsistencies",result.problems.length===0);
check("Master decision NO GO",result.decision==="NO_GO");
check("Staging NO GO",!result.stagingReady);
check("Production NO GO",!result.productionReady);
check("No real authorization",result.actualAuthorization===false);
check("No verified real backend tests",result.liveBackendTestsVerified===0);
check("Never provision",result.mayProvision===false);
check("Never execute SQL",result.mayRunSQL===false);
check("Never deploy",result.mayDeploy===false);
check("Never publish",result.mayPublish===false);
check("Never activate billing",result.mayCharge===false);
check("Never call paid AI",result.mayCallPaidAI===false);
check("First GitHub task C01",result.firstGithubTask==="C01");
check("Thirteen tasks",result.tasksTotal===13);
check("Two immediately GitHub-ready",result.githubReady===2);
check("Ten authorization-dependent work items",result.approvalBlocked===10);
check("V18 16 checks pending",result.checks.v18Pending===16);
check("V28 30 real tests pending",result.checks.v28Unexecuted===30);
check("V30 18 real tests pending",result.checks.v30Unexecuted===18);
check("V31 20 real tests pending",result.checks.v31Unexecuted===20);
check("V32 24 real tests pending",result.checks.v32Unexecuted===24);
check("92 scenario records overlap, not 92 defects",result.overlappingScenarioCount===92);
check("Read-only assessment doesn't mutate",JSON.stringify(baseline)===original);
check("Workstreams present",JSON.stringify(baseline.roadmap.milestones.map(x=>x.id))===JSON.stringify(["M1","M2","M3","M4"]));
check("M1 all GitHub",baseline.roadmap.milestones[0].taskIds.every(id=>id.startsWith("C")));
check("Production signoff separate",baseline.roadmap.tasks.find(x=>x.id==="P01").mode==="separate-production-approval");
check("Paid features optional",baseline.roadmap.tasks.find(x=>x.id==="X01").mode==="optional-separate-approval");
check("C01 resolves home conflict",baseline.roadmap.tasks.find(x=>x.id==="C01").gate.includes("home_slug"));
check("C02 resolves SQL status contract",baseline.roadmap.tasks.find(x=>x.id==="C02").gate.includes("sql_compat"));
check("C03 depends on C01 and C02",JSON.stringify(baseline.roadmap.tasks.find(x=>x.id==="C03").deps)===JSON.stringify(["C01","C02"]));
check("Real PostgreSQL task depends on G01",baseline.roadmap.tasks.find(x=>x.id==="S02").deps.includes("G01"));
check("Production signoff blocked on QA",baseline.roadmap.tasks.find(x=>x.id==="P01").deps.includes("Q01"));
check("No proposed actual implementation marked complete",baseline.roadmap.tasks.every(x=>x.status!=="DONE"));
check("All milestone signoffs false",baseline.roadmap.milestones.every(x=>x.goAllowed===false));
check("Known home blocker preserved",baseline.roadmap.openBlockers.includes("HOME_SLUG_CONFLICT"));
check("Known SQL mismatch blocker preserved",baseline.roadmap.openBlockers.includes("STATUS_CONTRACT_MISMATCH"));
check("Known RLS risk preserved",baseline.roadmap.openBlockers.includes("SECURITY_DEFINER_REVIEW"));
check("No claim of disjoint issue counts",baseline.roadmap.summary.inventory.disjointIssueCountClaimed===false);
const rendered=api.render(result);
check("Output says NO GO",rendered.includes("NO GO"));
check("Output prints 16 pending",rendered.includes("16"));
check("Output prints first task C01",rendered.includes("C01"));
check("Output warns overlap",rendered.includes("superpuestas"));
check("Output mentions no spending",rendered.includes("sin SQL, gasto"));
check("Missing inputs fail closed",!api.assess({}).valid&&api.assess({}).decision==="NO_GO");
check("Null input fail closed",!api.assess(null).valid);
check("No network in CLI",!source.includes("fetch(")&&!source.includes("https.request"));
check("No SQL DB access",!source.includes("supabase.")&&!source.includes("pg.Client"));
check("No writes",!source.includes("writeFileSync")&&!source.includes("appendFileSync"));
check("No subprocess calls",!source.includes("child_process"));
const clone=x=>JSON.parse(JSON.stringify(x));
function tamper(name,fn,code){
 const mutated=clone(baseline);fn(mutated);
 const outcome=api.assess(mutated);
 check(name+" invalid",!outcome.valid&&outcome.problems.includes(code));
 check(name+" NO GO",outcome.decision==="NO_GO"&&!outcome.mayDeploy&&!outcome.mayRunSQL);
}
const edits=[
 ["change branch",x=>x.roadmap.sourceBranch="main","ROADMAP_IDENTITY_OR_APPROVAL"],
 ["change project",x=>x.roadmap.project="other","ROADMAP_IDENTITY_OR_APPROVAL"],
 ["claim staging approval",x=>x.roadmap.stagingAuthorized=true,"ROADMAP_IDENTITY_OR_APPROVAL"],
 ["claim production approval",x=>x.roadmap.productionAuthorized=true,"ROADMAP_IDENTITY_OR_APPROVAL"],
 ["allow SQL",x=>x.roadmap.execution.mayRunSQL=true,"ROADMAP_EXECUTION_UNSAFE"],
 ["allow provisioning",x=>x.roadmap.execution.mayProvision=true,"ROADMAP_EXECUTION_UNSAFE"],
 ["allow publishing",x=>x.roadmap.execution.mayPublish=true,"ROADMAP_EXECUTION_UNSAFE"],
 ["allow Lovable/AI",x=>x.roadmap.execution.mayUsePaidAI=true,"ROADMAP_EXECUTION_UNSAFE"],
 ["allow spending",x=>x.roadmap.execution.mayActivateBilling=true,"ROADMAP_EXECUTION_UNSAFE"],
 ["allow main edits",x=>x.roadmap.execution.mayModifyMain=true,"ROADMAP_EXECUTION_UNSAFE"],
 ["unknown capabilities",x=>x.roadmap.execution.sshExecute=true,"ROADMAP_EXECUTION_UNSAFE"],
 ["claim summary GO",x=>x.roadmap.summary.decision="GO","SUMMARY_CHANGED"],
 ["inflate tests",x=>x.roadmap.summary.inventory.v30Unexecuted=0,"SUMMARY_CHANGED"],
 ["falsify next task",x=>x.roadmap.summary.nextTask="P01","SUMMARY_CHANGED"],
 ["claim distinct issues",x=>x.roadmap.summary.inventory.disjointIssueCountClaimed=true,"SUMMARY_CHANGED"],
 ["drop Home blocker",x=>x.roadmap.openBlockers.splice(0,1),"UNRESOLVED_BLOCKERS_CHANGED"],
 ["duplicate blocker",x=>x.roadmap.openBlockers.push("HOME_SLUG_CONFLICT"),"UNRESOLVED_BLOCKERS_CHANGED"],
 ["drop task",x=>x.roadmap.tasks.pop(),"TASK_SET_CHANGED"],
 ["duplicate task",x=>x.roadmap.tasks.push(clone(x.roadmap.tasks[0])),"TASK_SET_CHANGED"],
 ["unapproved task marked ready",x=>x.roadmap.tasks.find(z=>z.id==="S02").status="READY_FOR_GITHUB_WORK","APPROVAL_BYPASS"],
 ["production marked ready",x=>x.roadmap.tasks.find(z=>z.id==="P01").status="READY_FOR_GITHUB_WORK","APPROVAL_BYPASS"],
 ["C01 incorrectly blocked",x=>x.roadmap.tasks.find(z=>z.id==="C01").status="BLOCKED_DEPENDENCY","NEXT_TASK_NOT_READY"],
 ["unknown task dependency",x=>x.roadmap.tasks.find(z=>z.id==="C03").deps=["C99"],"INVALID_TASK"],
 ["task dependency self-loop",x=>x.roadmap.tasks.find(z=>z.id==="C03").deps=["C03"],"INVALID_TASK"],
 ["cyclic tasks",x=>x.roadmap.tasks.find(z=>z.id==="C01").deps=["C03"],"DEPENDENCY_CYCLE"],
 ["task without acceptance",x=>x.roadmap.tasks.find(z=>z.id==="C01").exit="short","INVALID_TASK"],
 ["unapproved task SQL mode",x=>x.roadmap.tasks.find(z=>z.id==="C01").mode="exec_sql","INVALID_TASK"],
 ["milestone includes invalid task",x=>x.roadmap.milestones[0].taskIds=["C99"],"MILESTONES_INCOMPLETE"],
 ["milestone declares GO",x=>x.roadmap.milestones[0].goAllowed=true,"MILESTONES_INCOMPLETE"],
 ["omit milestone",x=>x.roadmap.milestones.pop(),"MILESTONES_INCOMPLETE"],
 ["invent v18 staging approval",x=>x.v18.authorization.granted=true,"V18_GATE_CHANGED"],
 ["v18 SQL on",x=>x.v18.execution.mayRunMigrations=true,"V18_GATE_CHANGED"],
 ["v18 mark passed",x=>x.v18.checks[0].status="passed","V18_GATE_CHANGED"],
 ["v18 invent evidence",x=>x.v18.checks[0].evidenceRef="test","V18_GATE_CHANGED"],
 ["v28 fake evidence",x=>x.v28.cases[0].evidenceStatus="PASS","V28_EVIDENCE_CHANGED"],
 ["v28 no-go removed",x=>x.v28.authorizationGranted=true,"SOURCE_APPROVAL_CHANGED"],
 ["v29 fake real backend",x=>x.v29.integration.backendImplemented=true,"V29_BACKEND_CONTRACT_CHANGED"],
 ["v29 claim SQL",x=>x.v29.integration.sqlExecuted=true,"V29_BACKEND_CONTRACT_CHANGED"],
 ["v30 fake delivery",x=>x.v30.checklist[1].status="DONE","V30_EVIDENCE_CHANGED"],
 ["v30 activate mail",x=>x.v30.execution.maySendEmail=true,"SOURCE_APPROVAL_CHANGED"],
 ["v31 fake monitoring",x=>x.v31.checklist[0].evidenceStatus="PASS","V31_EVIDENCE_CHANGED"],
 ["v31 enable cron",x=>x.v31.execution.mayScheduleCron=true,"SOURCE_APPROVAL_CHANGED"],
 ["v32 fake backend test",x=>x.v32.cases[0].evidenceStatus="PASS","V32_EVIDENCE_CHANGED"],
 ["v32 deploy",x=>x.v32.execution.mayDeploy=true,"SOURCE_APPROVAL_CHANGED"],
 ["change evidence paths",x=>x.roadmap.evidenceManifestPaths[0]="random","SOURCE_LINKS_CHANGED"]
];
for(const [name,fn,code] of edits)tamper(name,fn,code);
const cli=loadApi(true);
check("CLI expected NO GO exit 2",cli.exitCode===2);
check("CLI provides readable summary",cli.logs.length===1&&cli.logs[0].includes("NO GO"));
check("CLI doesn't mutate files",JSON.stringify(api.load(read))===original);
const badRead=f=>{
 if(f==="staging/v28-backend-rls-matrix.review.json")throw Error("simulated missing file");
 return read(f);
};
let rejected=false;try{api.load(badRead);}catch(e){rejected=true;}
check("Missing evidence file cannot be treated as success",rejected);
console.log(n+" / "+n+" V33 roadmap/preflight assertions passed. Decision NO GO.");
