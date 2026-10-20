"use strict";
/* V43 offline Git blob pin and catalog SQL allowlist tests, NO EXECUTION.
 * node apps/mg-web-studio-cloud/tests/pre-sql-gates-v43.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(base,p),"utf8");
const source=read("staging/v43-preflight.cjs");
const clone=x=>JSON.parse(JSON.stringify(x));
function create(asCli=false){
 const module={exports:{}},logs=[],processShim={exitCode:0};
 const req=k=>require(k);req.main=asCli?module:null;
 new Function("require","__dirname","module","console","process",source)(
  req,path.join(base,"staging"),module,{log:x=>logs.push(x)},processShim);
 return {api:module.exports,logs,exitCode:processShim.exitCode};
}
const api=create().api,input=api.readFiles(read),before=JSON.stringify(input),manifest=input.manifest;
let n=0;
function yes(label,condition){assert.ok(condition,label);n++}
const baseCheck=api.assess(input);
yes("V43 is review only",baseCheck.version===43&&baseCheck.mode==="offline-review-only");
yes("baseline coherent",baseCheck.valid&&baseCheck.issues.length===0);
yes("NO GO enforced",baseCheck.decision==="NO_GO");
yes("catalog SQL requires permission",baseCheck.mayRunCatalogSql===false);
yes("DDL SQL requires permission",baseCheck.mayApplyDDL===false);
yes("deploy blocked",baseCheck.mayDeploy===false);
yes("publish blocked",baseCheck.mayPublish===false);
yes("zero SELECT executed",baseCheck.catalogSqlExecuted===0);
yes("zero DDL executed",baseCheck.ddlExecuted===0);
yes("zero restores",baseCheck.restoreTests===0);
yes("no production readiness",baseCheck.productionReady===false);
yes("no staging SQL readiness",baseCheck.stagingSqlReady===false);
yes("source git blob pin validated",baseCheck.sourceShaVerified===true);
yes("seven read-only selects",baseCheck.catalogStatements===7);
yes("eight approval questions open",baseCheck.approvalQuestionsOpen===8);
yes("eight operational workstreams",baseCheck.mandatoryOperationalRemaining===8);
yes("git empty blob reference",api.gitBlobSha("")==="e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
yes("pins match actual GitHub ddl",api.gitBlobSha(input.ddl)===manifest.source.ddl.githubBlobSha);
yes("pins match actual GitHub catalog",api.gitBlobSha(input.catalog)===manifest.source.catalogReadOnly.githubBlobSha);
yes("catalog SQL review only",input.catalog.includes("NOT AUTHORIZED TO EXECUTE"));
yes("catalog has BEGIN READ ONLY",input.catalog.includes("READ ONLY;"));
yes("catalog has ROLLBACK",input.catalog.includes("ROLLBACK;"));
yes("catalog has zero COMMIT",!/\bCOMMIT\s*;/i.test(input.catalog));
yes("catalog is not in migration folder",!manifest.source.catalogReadOnly.path.includes("migrations/"));
yes("DDL separate blob",manifest.source.ddl.githubBlobSha!==manifest.source.catalogReadOnly.githubBlobSha);
yes("no project ref in GitHub manifest",!JSON.stringify(manifest).includes("yefcgjtovfnsqtdjdsod"));
yes("no secrets in GitHub manifest",!JSON.stringify(manifest).includes("sb_secret_"));
yes("staging project target",manifest.target==="MG WEB STUDIO CLOUD - STAGING");
yes("all nine blocked permissions false",Object.entries(manifest.authorizationBoundaries).every(([k,v])=>k==="githubDraftReview"?v===true:v===false));
yes("all evidence counters zero",manifest.realEvidence.readOnlySQLQueriesRun===0&&manifest.realEvidence.ddlStatementsRun===0);
yes("all approvals blank",Object.values(manifest.ownerDecision).every(x=>x===null));
yes("no invalid project creation claim",manifest.realEvidence.projectExistencePreviouslyChecked===true);
yes("no actual schema empty claim",manifest.realEvidence.allSchemasVerifiedEmpty===false);
yes("source V42 continues NO GO",input.prior.status==="NO_GO"&&input.prior.authorization.sql===false);
yes("source V39 SQL not approved",input.snapshot.approvalBoundary.executeSQLApproved===false);
yes("no input mutation",JSON.stringify(input)===before);
const noGo=r=>r.decision==="NO_GO"&&r.mayRunCatalogSql===false&&r.mayApplyDDL===false&&r.mayPublish===false;
function tamper(label,mutator,issue){
 const f=clone(input);mutator(f);
 const r=api.assess(f);
 yes(label+" detects problem",!r.valid&&r.issues.includes(issue));
 yes(label+" stays NO GO",noGo(r));
}
const sample=[
 ["wrong branch",f=>f.manifest.branch="main","IDENTITY_DRIFT"],
 ["production instead of staging",f=>f.manifest.target="production","IDENTITY_DRIFT"],
 ["wrong version",f=>f.manifest.version=42,"IDENTITY_DRIFT"],
 ["catalog allowed",f=>f.manifest.authorizationBoundaries.metadataCatalogReadOnlySQL=true,"PERMISSION_BOUNDARY_BROKEN"],
 ["migration allowed",f=>f.manifest.authorizationBoundaries.databaseDDL=true,"PERMISSION_BOUNDARY_BROKEN"],
 ["backend allowed",f=>f.manifest.authorizationBoundaries.backendDeployment=true,"PERMISSION_BOUNDARY_BROKEN"],
 ["payments allowed",f=>f.manifest.authorizationBoundaries.paidExternalServices=true,"PERMISSION_BOUNDARY_BROKEN"],
 ["production allowed",f=>f.manifest.authorizationBoundaries.production=true,"PERMISSION_BOUNDARY_BROKEN"],
 ["other projects allowed",f=>f.manifest.authorizationBoundaries.otherProjects=true,"PERMISSION_BOUNDARY_BROKEN"],
 ["unexpected permission",f=>f.manifest.authorizationBoundaries.admin=true,"PERMISSION_BOUNDARY_BROKEN"],
 ["missing source hash",f=>delete f.manifest.source.ddl.githubBlobSha,"SOURCE_PIN_MISSING"],
 ["missing entire source metadata",f=>delete f.manifest.source.catalogReadOnly,"SOURCE_PIN_MISSING"],
 ["DDL source mutated",f=>f.ddl+="\n-- DIFFERENT DDL\n","DDL_BLOB_CHANGED"],
 ["Catalog source mutated",f=>f.catalog+="\n-- DIFFERENT CATALOG\n","CATALOG_BLOB_CHANGED"],
 ["DDL hash forged",f=>f.manifest.source.ddl.githubBlobSha="0".repeat(40),"DDL_BLOB_CHANGED"],
 ["Catalog hash forged",f=>f.manifest.source.catalogReadOnly.githubBlobSha="0".repeat(40),"CATALOG_BLOB_CHANGED"],
 ["switch DDL and catalog",f=>f.manifest.source.ddl.path=f.manifest.source.catalogReadOnly.path,"SOURCE_PIN_MISSING"],
 ["change operation count",f=>f.manifest.scope.catalogOperations=8,"SCOPE_CHANGED"],
 ["change transaction semantics",f=>f.manifest.scope.catalogTransaction="WRITE ALLOWED","SCOPE_CHANGED"],
 ["fake catalog attempt",f=>f.manifest.scope.catalogRunAttempts=1,"SCOPE_CHANGED"],
 ["fake DDL attempt",f=>f.manifest.scope.ddlRunAttempts=1,"SCOPE_CHANGED"],
 ["claim target id committed",f=>f.manifest.scope.targetIdPublicGitHubRedacted=false,"SCOPE_CHANGED"],
 ["break catalog READ ONLY",f=>{f.catalog=f.catalog.replace("READ ONLY;","READ WRITE;");f.manifest.source.catalogReadOnly.githubBlobSha=api.gitBlobSha(f.catalog);f.manifest.source.catalogReadOnly.chars=f.catalog.length},"UNSAFE_CATALOG_SQL"],
 ["catalog INSERT masquerading as SELECT",f=>{f.catalog=f.catalog.replace("SELECT current_database()","INSERT INTO public.anything SELECT current_database()");f.manifest.source.catalogReadOnly.githubBlobSha=api.gitBlobSha(f.catalog);f.manifest.source.catalogReadOnly.chars=f.catalog.length},"UNSAFE_CATALOG_SQL"],
 ["catalog delay function",f=>{f.catalog=f.catalog.replace("SELECT current_database()","SELECT pg_sleep(1),current_database()");f.manifest.source.catalogReadOnly.githubBlobSha=api.gitBlobSha(f.catalog);f.manifest.source.catalogReadOnly.chars=f.catalog.length},"UNSAFE_CATALOG_SQL"],
 ["catalog extra SELECT",f=>{f.catalog=f.catalog.replace("ROLLBACK;","SELECT * FROM auth.users;\nROLLBACK;");f.manifest.source.catalogReadOnly.githubBlobSha=api.gitBlobSha(f.catalog);f.manifest.source.catalogReadOnly.chars=f.catalog.length},"UNSAFE_CATALOG_SQL"],
 ["catalog COMMIT",f=>{f.catalog=f.catalog.replace("ROLLBACK;","COMMIT;");f.manifest.source.catalogReadOnly.githubBlobSha=api.gitBlobSha(f.catalog);f.manifest.source.catalogReadOnly.chars=f.catalog.length},"UNSAFE_CATALOG_SQL"],
 ["DDL publish slipped in",f=>{f.ddl=f.ddl.replace("('draft','review','suspended')","('draft','review','published','suspended')");f.manifest.source.ddl.githubBlobSha=api.gitBlobSha(f.ddl);f.manifest.source.ddl.chars=f.ddl.length},"DDL_CONTRACT_DRIFT"],
 ["DDL new DROP",f=>{f.ddl+="\nDROP TABLE public.mg_pages;";f.manifest.source.ddl.githubBlobSha=api.gitBlobSha(f.ddl);f.manifest.source.ddl.chars=f.ddl.length},"UNSAFE_DDL_CONTENT"],
 ["DDL grant anon",f=>{f.ddl+="\nGRANT SELECT ON public.mg_pages TO anon;";f.manifest.source.ddl.githubBlobSha=api.gitBlobSha(f.ddl);f.manifest.source.ddl.chars=f.ddl.length},"UNSAFE_DDL_CONTENT"],
 ["DDL direct authenticated update",f=>{f.ddl+="\nGRANT UPDATE ON public.mg_pages TO authenticated;";f.manifest.source.ddl.githubBlobSha=api.gitBlobSha(f.ddl);f.manifest.source.ddl.chars=f.ddl.length},"UNSAFE_DDL_CONTENT"],
 ["mark required catalog check done",f=>f.manifest.reviewItems[0].status="DONE","GATES_NOT_PENDING"],
 ["drop review item",f=>f.manifest.reviewItems.pop(),"GATES_NOT_PENDING"],
 ["fake approval",f=>f.manifest.ownerDecision.catalogSQLApproval=true,"APPROVAL_FORGED"],
 ["fake DDL approval",f=>f.manifest.ownerDecision.ddlSQLApproval=true,"APPROVAL_FORGED"],
 ["fake backup owner",f=>f.manifest.ownerDecision.backupAndRestoreOwner="admin","APPROVAL_FORGED"],
 ["fake SQL executed",f=>f.manifest.realEvidence.ddlStatementsRun=16,"REAL_EVIDENCE_FABRICATED"],
 ["fake all schemas empty",f=>f.manifest.realEvidence.allSchemasVerifiedEmpty=true,"REAL_EVIDENCE_FABRICATED"],
 ["fake backup",f=>f.manifest.realEvidence.backupCreated=true,"REAL_EVIDENCE_FABRICATED"],
 ["fake PostgreSQL parser",f=>f.manifest.realEvidence.postgresParserTested=true,"REAL_EVIDENCE_FABRICATED"],
 ["fake status catalog ready",f=>f.manifest.decision.catalogSQLReadyToRun=true,"RELEASE_GATE_FORGED"],
 ["fake DDL ready",f=>f.manifest.decision.ddlReadyToRun=true,"RELEASE_GATE_FORGED"],
 ["fake production",f=>f.manifest.decision.productionGo=true,"RELEASE_GATE_FORGED"],
 ["falsify previous SQL permission",f=>f.prior.authorization.sql=true,"SOURCE_BASELINE_INVALID"],
 ["falsify baseline tables",f=>f.snapshot.counts.publicTables=1,"SOURCE_BASELINE_INVALID"]
];
for(const [label,fn,expected] of sample)tamper(label,fn,expected);
const cli=create(true);
yes("valid review command exit 2",cli.exitCode===2);
yes("output says NO GO",cli.logs.length===1&&cli.logs[0].includes("NO GO"));
yes("source cannot write files",!source.includes("writeFileSync")&&!source.includes("appendFileSync"));
yes("source has no SQL API",!source.includes("execute_sql(")&&!source.includes("apply_migration("));
yes("source no fetch",!source.includes("fetch("));
yes("missing input invalid",!api.assess({}).valid);
yes("null input invalid",!api.assess(null).valid);
console.log(n+" / "+n+" V43 offline approval and catalog guard tests PASS — NO GO.");
