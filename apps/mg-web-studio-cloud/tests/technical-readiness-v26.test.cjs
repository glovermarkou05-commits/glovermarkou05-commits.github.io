"use strict";
/* V26: static NO GO inspection only. Read local UTF-8 files; no SQL, HTTP or provisioning.
 * node apps/mg-web-studio-cloud/tests/technical-readiness-v26.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=path.join(__dirname,".."),read=name=>fs.readFileSync(path.join(base,name),"utf8");
const window={};
for(const name of ["mg-staging-readiness-v17.js","mg-staging-package-v18.js","mg-sql-compat-v19.js",
 "mg-sql-api-compat-v21.js","mg-readiness-v26.js"])
 new Function("window",read("shared/"+name))(window);
const deps={v17:window.MGStageGateV17,v18:window.MGStagingPackageV18,
 v19:window.MGSqlCompatibilityV19,v21:window.MGSqlApiCompatV21};
const paths=deps.v18.expectedSQL;
const initial=()=>({
 manifest:JSON.parse(read("staging/v18-manifest.review.json")),
 env:JSON.parse(read("staging/v18-env-names.review.json")),
 procedure:JSON.parse(read("staging/v18-procedure.review.json")),
 sqlReviews:Object.fromEntries(paths.map(file=>[file,read(file)])),
 v20ContractSource:read("shared/mg-contracts-v20.js"),
 v25WorkflowSource:read("shared/mg-e2e-workflow-v25.js"),
 v14DemoCode:read("tests/transactional-api-v14.test.cjs")
});
const v26=window.MGTechnicalReadinessV26;
const clone=x=>JSON.parse(JSON.stringify(x));
let n=0;function check(label,yes){assert.ok(yes,label);n++;}
const input=initial(),orig=JSON.stringify(input),result=v26.assess(deps,input);
check("V26 version",result.version==="26.0-review");
check("Mode static",result.mode==="consolidated-static-no-execution");
check("Canonical source branch",result.sourceBranch==="feature/mg-digital-v5-web-services");
check("V26 no go",result.decision==="NO_GO");
check("Base artifacts valid static",result.validInputs===true);
check("Staging never ready",result.stageReady===false);
check("Production never ready",result.productionReady===false);
check("No provisioning",result.mayProvision===false);
check("No SQL",result.mayRunSQL===false);
check("No deploy",result.mayDeploy===false);
check("No publishing",result.mayPublish===false);
check("No charges",result.mayCharge===false);
check("No paid AI",result.mayCallPaidAI===false);
check("No real approval",result.authorizationReal===false);
check("Marked simulation",result.simulationOnly===true);
check("V17 count",result.checks.v17Total===32);
check("No V17 evidence",result.checks.v17Pending===32);
check("V18 manifest 16 pending",result.checks.v18ManifestPending===16);
check("V18 static format valid",result.checks.v18StaticFormatValid===true);
check("Four SQL review files",result.checks.v18SqlLoaded===4);
check("V19 table inventory",result.checks.v19Tables===21);
check("Both original V19 blockers still exist",result.checks.v19BlockerCount===2);
check("V21 5 open issues",result.checks.v21OpenCount===5);
check("V25 3 simulated actions",result.checks.v25SimulatedActions===3);
check("No real backend tests",result.checks.realBackendTestsVerified===0);
check("No mutation",JSON.stringify(input)===orig);
for(const code of [
 "AUTHORIZATION_MISSING","ISOLATED_STAGING_NOT_PROVEN","AUTH_MFA_REAL_UNTESTED",
 "RLS_GRANTS_REAL_UNTESTED","REAL_CAS_OUTBOX_UNTESTED","BACKUP_RESTORE_REAL_UNTESTED",
 "REAL_MULTI_DEVICE_E2E_UNTESTED","AUDIT_INTEGRITY_UNPROVEN","V25_PARTIAL_FLOW",
 "PRODUCTION_SIGNOFF_MISSING","HOME_SLUG_CONFLICT","STATUS_CONTRACT_MISMATCH",
 "HOME_EXISTENCE_UNPROVEN","SECURITY_DEFINER_REVIEW","CAS_SQL_TRANSACTION_UNPROVEN","POSTGRES_REQUIRED"
])check("Outstanding "+code,result.openCodes.includes(code));
check("Unique open blockers",new Set(result.openCodes).size===result.openCodes.length);
check("Open codes reflected in blockers",result.openCodes.every(code=>result.blockers.some(b=>b.code===code)));
const output=v26.render(result);
check("Report NO GO",output.includes("NO GO"));
check("Report 32 V17",output.includes("32"));
check("Report 16 V18",output.includes("16"));
check("Report 2 V19",output.includes("V19 SQL-design blockers: 2"));
check("Report 5 V21",output.includes("V21 contract issues: 5"));
check("Report doesn't state authorized",!output.includes("DECISION: GO"));
check("Missing inputs rejected",v26.assess(null,null).decision==="NO_GO");
check("Missing inputs invalid",v26.assess(null,null).validInputs===false);
check("Malformed report renders no go",v26.render(null).includes("NO GO"));
const tests=[
 ["main branch",x=>{x.manifest.sourceBranch="main"},"WRONG_BRANCH"],
 ["real approval spoof",x=>{x.manifest.authorization.granted=true},"V18_PACKAGE_INVALID"],
 ["enabled deployment",x=>{x.manifest.execution.mayDeploy=true},"EXECUTION_FLAGS_CHANGED"],
 ["enabled SQL",x=>{x.manifest.execution.mayRunMigrations=true},"EXECUTION_FLAGS_CHANGED"],
 ["enabled paid AI",x=>{x.manifest.execution.mayCallPaidAI=true},"EXECUTION_FLAGS_CHANGED"],
 ["enabled charges",x=>{x.manifest.execution.mayCharge=true},"EXECUTION_FLAGS_CHANGED"],
 ["main unprotected",x=>{x.manifest.protectedBranches=[]},"V18_PACKAGE_INVALID"],
 ["new project target",x=>{x.manifest.target.projectRef="unapproved-project"},"V18_PACKAGE_INVALID"],
 ["nonempty executables",x=>{x.procedure.executables=["run"]},"V18_PACKAGE_INVALID"],
 ["SQL missing",x=>{delete x.sqlReviews["db/schema_core.review.sql"]},"V18_PACKAGE_INVALID"],
 ["unauthorized SQL rewrite",x=>{x.sqlReviews["db/schema_core.review.sql"]="alter table public.users drop column id;"},"V18_PACKAGE_INVALID"],
 ["V20 input missing",x=>{delete x.v20ContractSource},"MISSING_V20CONTRACTSOURCE"],
 ["V14 sample missing",x=>{delete x.v14DemoCode},"MISSING_V14DEMOCODE"],
 ["V25 sample missing",x=>{delete x.v25WorkflowSource},"MISSING_V25WORKFLOWSOURCE"],
 ["V25 action removed",x=>{x.v25WorkflowSource=x.v25WorkflowSource.replace("approve:Object.freeze","confirm:Object.freeze")},"V25_INTEGRATION_MISSING"],
 ["V25 scope expansion",x=>{x.v25WorkflowSource+="\ncreate:Object.freeze";},"V25_SCOPE_REVIEW"]
];
for(const [label,mutate,code] of tests){
 const changed=initial();mutate(changed);
 const r=v26.assess(deps,changed);
 check(label+" no go",r.decision==="NO_GO"&&r.stageReady===false&&!r.mayPublish);
 check(label+" warning",r.openCodes.includes(code));
}
const brokenDeps={...deps,v21:null};
check("Missing dependency blocked",v26.assess(brokenDeps,initial()).openCodes.includes("DEPENDENCY_V21"));
const v17Status=deps.v17.evaluate({approval:{status:"simulated_checked",evidence:"mock-only"}});
check("V17 simulated note is not real auth",v17Status.actualAuthorization===false);
const v26Again=v26.assess(deps,{...initial(),hypotheticalEvidence:{authorization:"YES",pgTap:"PASS"}});
check("Forged evidence cannot allow deployment",v26Again.decision==="NO_GO"&&!v26Again.mayDeploy);
check("No fetch in evaluator",!read("shared/mg-readiness-v26.js").includes("fetch("));
check("No execution shell in evaluator",!read("shared/mg-readiness-v26.js").includes("child_process"));
check("No Supabase in evaluator",!read("shared/mg-readiness-v26.js").includes("supabase."));
console.log(n+" / "+n+" V26 static technical readiness assertions passed. Decision NO GO.");
