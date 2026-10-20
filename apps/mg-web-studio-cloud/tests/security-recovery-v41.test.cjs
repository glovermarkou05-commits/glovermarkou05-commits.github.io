"use strict";
/* V41 threat-review regressions only; no real DB, SQL, client or cloud operations.
 * node apps/mg-web-studio-cloud/tests/security-recovery-v41.test.cjs
 */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const BASE=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(BASE,p),"utf8");
const source=read("staging/v41-review-preflight.cjs");
const copy=x=>JSON.parse(JSON.stringify(x));
function setup(cli=false){
 const mod={exports:{}},logs=[],proc={exitCode:0};
 const req=k=>require(k);req.main=cli?mod:null;
 new Function("require","__dirname","module","console","process",source)(
  req,path.join(BASE,"staging"),mod,{log:s=>logs.push(s)},proc);
 return {api:mod.exports,logs,exitCode:proc.exitCode};
}
const api=setup().api,initial=api.readFiles(read),baseline=api.assess(initial);
let n=0;const check=(name,v)=>{assert.ok(v,name);n++};
const noGo=r=>r.decision==="NO_GO"&&r.mayExecuteSql===false&&r.mayDeploy===false&&
 r.mayPublish===false&&r.productionReady===false&&r.stagingSqlReady===false;
check("V41 version",baseline.version===41);
check("Review only",baseline.mode==="source-only-security-review");
check("Source package coherent",baseline.valid&&baseline.issues.length===0);
check("No GO",noGo(baseline));
check("No SQL executed",baseline.sqlExecuted===0);
check("No database tests",baseline.postgresTests===0);
check("No RLS real tests",baseline.rlsRealTests===0);
check("No restore tests",baseline.actualRestoreTests===0);
check("No security approval",baseline.securitySignoff===false);
check("No recovery approval",baseline.recoverySignoff===false);
check("12 open risks",baseline.openFindings===12);
check("5 risks P0",baseline.p0BeforeAnySql===5);
check("3 predecessor SQL drafts",baseline.preparedDrafts===3);
check("Partial commits risk",baseline.partialCommitRiskDocumented===true);
check("Review is source-based",baseline.securityFindingsVerifiedOnlyAgainstSource===true);
check("12 unique risk IDs",new Set(initial.manifest.findings.map(f=>f.id)).size===12);
check("All findings open",initial.manifest.findings.every(f=>f.status==="OPEN"&&f.realEvidence===null));
check("Five urgent P0",initial.manifest.findings.filter(f=>f.priority==="P0").length===5);
check("Seven P1",initial.manifest.findings.filter(f=>f.priority==="P1").length===7);
check("Default privileges gap tracked",initial.manifest.findings[0].finding.includes("pg_default_acl"));
check("Partial commit tracked",initial.manifest.findings[1].finding.includes("transacciones"));
check("Authorization blocked",initial.manifest.findings[2].priority==="P0");
check("RLS tests pending",initial.manifest.findings[3].priority==="P0");
check("Audit tenant FK risk",initial.manifest.findings[4].finding.includes("organization_id"));
check("Outbox uniqueness risk",initial.manifest.findings[5].title.includes("Outbox")||initial.manifest.findings[5].title.includes("Unicidad"));
check("service role risk",initial.manifest.findings[6].finding.includes("RLS"));
check("Home locked",initial.manifest.findings[7].finding.includes("published"));
check("V40 overclaim tracked",initial.manifest.findings[8].finding.includes("allTenantScopedObjectsHaveCompositeFk"));
check("V39 snapshot not forever",initial.manifest.findings[9].finding.includes("V39"));
check("MFA pending",initial.manifest.findings[10].title.includes("MFA"));
check("Recovery custody",initial.manifest.findings[11].finding.includes("custodia")||initial.manifest.findings[11].title.includes("Custodia"));
check("Six review phases",initial.manifest.stages.length===6);
check("Zero backup",initial.manifest.recovery.backupsMade===0);
check("Zero restoration",initial.manifest.recovery.restoreAttempts===0);
check("No RPO approval",initial.manifest.recovery.rpoApproved===false);
check("No RTO approval",initial.manifest.recovery.rtoApproved===false);
check("No restoration owner",initial.manifest.recovery.ownerApproved===false);
check("No credentials access",initial.manifest.evidence.credentialsRead===0);
check("No changed tables",initial.manifest.evidence.physicalTablesChanged===0);
check("No SQL authorized",initial.manifest.permissions.sqlExecution===false);
check("No deploy authorized",initial.manifest.permissions.deploy===false);
check("No payments authorized",initial.manifest.permissions.charge===false);
check("No other projects",initial.manifest.permissions.modifyOtherProjects===false);
check("No source secrets",!JSON.stringify(initial.manifest).includes("sb_secret_"));
check("No project reference",!JSON.stringify(initial.manifest).includes("yefcgjtovfnsqtdjdsod"));
check("Hardening is only comments",initial.hardening.split(/\r?\n/).every(x=>!x.trim()||x.trim().startsWith("--")));
check("No runnable migration added",api.FILES.hardening.endsWith(".review.sql"));
check("Backup plan blocks live data",initial.recovery.includes("datos sintéticos"));
check("Recovery no Dropbox/Drive secrets",!initial.recovery.includes("service_role_key"));
check("V40 remains unapproved",initial.v40.authorization.executeSQL===false);
check("V39 recorded zero app tables",initial.baseline.counts.publicTables===0);
check("V40 no published state",!api.stripped?.(initial.core)?.includes("published")||!initial.core.includes("('draft','review','published','suspended')"));
check("No damage to original input",JSON.stringify(initial)===JSON.stringify(api.readFiles(read)));
const rendered=api.summary(baseline);
check("Summary says NO GO",rendered.includes("NO GO"));
check("Summary states zero SQL",rendered.includes("SQL ejecutado: 0"));
function caseOf(name,fn,error){
 const x=copy(initial);fn(x);
 const r=api.assess(x);
 check(name+": fail closed",!r.valid&&r.issues.includes(error));
 check(name+": never GO",noGo(r));
}
const cases=[
 ["wrong target",x=>x.manifest.target="PRODUCTION","REVIEW_IDENTITY_CHANGED"],
 ["wrong branch",x=>x.manifest.branch="main","REVIEW_IDENTITY_CHANGED"],
 ["SQL draft list truncated",x=>x.manifest.sourceDrafts.pop(),"REVIEW_IDENTITY_CHANGED"],
 ["missing high priority risk",x=>x.manifest.findings.pop(),"SECURITY_FINDINGS_CLOSED_WITHOUT_EVIDENCE"],
 ["fake risk closure",x=>x.manifest.findings[0].status="DONE","SECURITY_FINDINGS_CLOSED_WITHOUT_EVIDENCE"],
 ["fake evidence",x=>x.manifest.findings[0].realEvidence="report","SECURITY_FINDINGS_CLOSED_WITHOUT_EVIDENCE"],
 ["risk demoted",x=>x.manifest.findings[0].priority="P2","SECURITY_FINDINGS_CLOSED_WITHOUT_EVIDENCE"],
 ["risk reclassified",x=>x.manifest.findings[5].priority="P0","SECURITY_FINDINGS_CLOSED_WITHOUT_EVIDENCE"],
 ["duplicated risk",x=>x.manifest.findings[1].id="V41-01","SECURITY_FINDINGS_CLOSED_WITHOUT_EVIDENCE"],
 ["skip review phase",x=>x.manifest.stages.splice(2,1),"STAGE_GATE_CHANGED"],
 ["pretend SQL stage ran",x=>x.manifest.stages[3].status="PASSED","STAGE_GATE_CHANGED"],
 ["claim outside link",x=>x.manifest.references[0].url="https://example.com","OFFICIAL_GUIDANCE_MISSING"],
 ["pretend backup",x=>x.manifest.recovery.backupsMade=1,"RECOVERY_PROOF_FABRICATED"],
 ["pretend restore",x=>x.manifest.recovery.restoreAttempts=1,"RECOVERY_PROOF_FABRICATED"],
 ["pretend RPO",x=>x.manifest.recovery.rpoApproved=true,"RECOVERY_PROOF_FABRICATED"],
 ["remove freeze checks",x=>x.manifest.recovery.minimumChecks=[],"RECOVERY_PROOF_FABRICATED"],
 ["pretend SQL permission",x=>x.manifest.permissions.sqlExecution=true,"EXECUTION_PERMISSION_FALSIFIED"],
 ["pretend deploy permission",x=>x.manifest.permissions.deploy=true,"EXECUTION_PERMISSION_FALSIFIED"],
 ["pretend charge permission",x=>x.manifest.permissions.charge=true,"EXECUTION_PERMISSION_FALSIFIED"],
 ["pretend other project permissions",x=>x.manifest.permissions.modifyOtherProjects=true,"EXECUTION_PERMISSION_FALSIFIED"],
 ["pretend SQL result",x=>x.manifest.evidence.realSqlExecuted=1,"REAL_EVIDENCE_FALSIFIED"],
 ["pretend RLS result",x=>x.manifest.evidence.realRlsScenarios=14,"REAL_EVIDENCE_FALSIFIED"],
 ["pretend recovery result",x=>x.manifest.evidence.realBackupRestores=1,"REAL_EVIDENCE_FALSIFIED"],
 ["pretend secret access",x=>x.manifest.evidence.credentialsRead=1,"REAL_EVIDENCE_FALSIFIED"],
 ["pretend security signed",x=>x.manifest.decision.securitySignoff=true,"SIGNOFF_FORGED"],
 ["pretend recovery signed",x=>x.manifest.decision.recoverySignoff=true,"SIGNOFF_FORGED"],
 ["pretend production",x=>x.manifest.decision.readyForProduction=true,"SIGNOFF_FORGED"],
 ["V40 SQL permitted",x=>x.v40.authorization.executeSQL=true,"V40_APPROVAL_GATE_CHANGED"],
 ["V40 already installed",x=>x.v40.outcomes.stagingSchemaInstalled=true,"V40_APPROVAL_GATE_CHANGED"],
 ["V39 tables already exist",x=>x.baseline.counts.publicTables=3,"V39_SNAPSHOT_CHANGED"],
 ["V39 authorized SQL",x=>x.baseline.approvalBoundary.executeSQLApproved=true,"V39_SNAPSHOT_CHANGED"],
 ["published allowed",x=>x.core=x.core.replace("('draft','review','suspended')","('draft','review','published','suspended')"),"PUBLISHED_STATUS_BLOCK_NOT_OBSERVED"],
 ["remove pages",x=>x.core=x.core.replace("create table public.mg_pages","create table public.old_pages"),"PUBLISHED_STATUS_BLOCK_NOT_OBSERVED"],
 ["audit now has FK",x=>x.core=x.core.replace("organization_id uuid,\n  action","organization_id uuid references public.mg_organizations(id),\n  action"),"AUDIT_TENANT_FK_REVIEW_ASSUMPTION_CHANGED"],
 ["proposal event table removed",x=>x.proposal=x.proposal.replace("create table mg_private.mg_proposal_outbox","create table mg_private.mg_old_outbox"),"OUTBOX_IDEMPOTENCY_BASELINE_CHANGED"],
 ["status idempotency changed",x=>x.proposal=x.proposal.replace("primary key(organization_id,actor_user_id,operation_key)","primary key(operation_key)"),"OUTBOX_IDEMPOTENCY_BASELINE_CHANGED"],
 ["service role grant removed",x=>x.rls=x.rls.replace("to service_role;","to nobody;"),"DEFAULT_GRANTS_OR_SERVICE_ROLE_RISK_CHANGED"],
 ["alter default privileges added",x=>x.rls+="\nalter default privileges for role postgres in schema public revoke execute on functions from public;","DEFAULT_GRANTS_OR_SERVICE_ROLE_RISK_CHANGED"],
 ["hardening runnable SQL",x=>x.hardening+="\nalter default privileges for role postgres revoke execute on functions from public;","HARDENING_DESIGN_INVALID"],
 ["hardening removed review disclaimer",x=>x.hardening=x.hardening.replace("NO ES MIGRACION","PUEDE EJECUTAR"),"HARDENING_DESIGN_INVALID"],
 ["recovery missing",x=>x.recovery="","RECOVERY_RUNBOOK_MISSING"],
 ["recovery falsified",x=>x.recovery=x.recovery.replace("NO EJECUTADO","FINALIZADO"),"RECOVERY_RUNBOOK_MISSING"]
];
for(const [name,mut,expected] of cases)caseOf(name,mut,expected);
check("Missing review file fails",!api.assess({}).valid);
check("Null input fails",!api.assess(null).valid);
const cli=setup(true);
check("CLI exit 2 means coherent but NO GO",cli.exitCode===2);
check("CLI logs NO GO",cli.logs[0].includes("NO GO"));
check("No hidden network access",!source.includes("fetch("));
check("No SQL execution API",!source.includes("execute_sql("));
check("No filesystem writing",!source.includes("writeFileSync("));
console.log(n+" / "+n+" V41 source-review checks OK, ALL real gates remain NO GO.");
