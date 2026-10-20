"use strict";
/* V46: GitHub source-only readiness checks. NEVER opens PostgreSQL or Supabase.
 * node apps/mg-web-studio-cloud/tests/preinstall-readiness-v46.test.cjs
 */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const ROOT=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(ROOT,p),"utf8");
const M=JSON.parse(read("staging/v46-preinstall-authorization.review.json"));
const DDL=read("db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt");
const REC=read("PLAN-RECUPERACION-STAGING-V46.md");
const OLD=JSON.parse(read("staging/v45-permission-correction.review.json"));
const V44=JSON.parse(read("staging/v44-real-catalog-observations.review.json"));
let n=0;
function yes(title,v){assert.ok(v,title);n++}
const copy=x=>JSON.parse(JSON.stringify(x));
const strip=x=>x.replace(/\/\*[\s\S]*?\*\//g," ").replace(/--[^\n]*/g," ");
const count=(x,re)=>[...x.matchAll(re)].length;
const regex=[
 [/create\s+table\b/gi,16],
 [/enable\s+row\s+level\s+security/gi,16],
 [/create\s+policy\b/gi,12],
 [/alter\s+default\s+privileges\b/gi,0],
 [/\bbegin\s*;/gi,1],
 [/\bcommit\s*;/gi,1]
];
function verify(m,ddl,recovery){
 const issues=[],warn=x=>{if(!issues.includes(x))issues.push(x)};
 if(m?.version!==46||m?.format!=="mg-web-studio/v46-preinstall-authority-review"||
 m?.project!=="MG WEB STUDIO CLOUD"||m?.branch!=="feature/mg-digital-v5-web-services"||
 m?.scope!=="REVALIDATION_AND_APPROVAL_PREPARATION_NOT_INSTALLATION"||
 m?.target!=="ISOLATED_STAGING_ONLY")warn("IDENTITY");
 if(m?.source?.v45Install?.githubBlobSha!==OLD.artifacts[0].githubBlobSha||
 m?.source?.v45Verify?.githubBlobSha!==OLD.artifacts[1].githubBlobSha||
 m?.source?.v45Install?.path!=="db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt")warn("SOURCE_PIN");
 const a=m?.actualReadOnly||{};
 if(a.schemaPublicOwner!=="pg_database_owner"||a.schemaPrivateMgExists!==false||
 !a.publicUsageForAnonAndAuthenticated||a.publicCreateForAnonAndAuthenticated!==false||
 a.defaultAclRowsObservedInV44!==6||
 JSON.stringify(a.defaultAclCreatorsObservedInV44)!==JSON.stringify(["postgres","supabase_admin"])||
 a.observedPublicTables!==0||a.observedMigrationRecords!==0||
 a.noClaimsOfAllSchemasEmpty!==true||a.schemaOwnerReadOnlySelectExecuted!==1)
 warn("READ_ONLY_FACTS");
 const p=m?.proposedMigration||{},s=strip(ddl||"");
 if(!regex.every(([re,n])=>count(s,re)===n)||
 p.tables!==16||p.rls!==16||p.selectPolicies!==12||
 p.defaultAclMutations!==0||p.transactions!==1||p.commits!==1||
 p.browserWritesGranted!==false||p.publicPublishingAllowed!==false||
 p.defaultAclGloballyFixed!==false||p.futureTableDefaultAclRiskStillOpen!==true)
 warn("DDL_CONTRACT");
 if(/\b(?:drop\s+table|truncate\s+|delete\s+from|create\s+function|security\s+definer)\b/i.test(s)||
 /grant\s+(?:all|insert|update|delete)\b[^;]+to\s+authenticated\s*;/i.test(s)||
 /grant\s+[^;]+to\s+anon\s*;/i.test(s))
 warn("UNSAFE_DDL");
 const r=m?.recoveryProposal||{};
 if(r.tier!=="Supabase Free"||r.approved!==false||r.backupTaken!==false||
 r.backupVerified!==false||r.restoreTested!==false||
 r.owner!==null||r.rpo!==null||r.rto!==null||r.mayDeleteProject!==false||
 r.mayCreateRestoreTarget!==false||r.storageObjectsIncluded!==false||
 r.initialRollback.indexOf("before commit")<0)
 warn("RECOVERY_UNPROVEN");
 const approve=m?.approvals||{};
 if(approve.readOnlySchemaOwnerCheck!==true||approve.githubReview!==true||
 ["installDDL","applyMigration","postgresTestDDL","backupCreation","restore",
  "deployBackend","sendNotifications","production","payments","modifyMain",
  "modifyOtherProjects"].some(k=>approve[k]!==false))warn("UNAUTHORIZED");
 const ct=m?.counts||{};
 if(ct.sqlCatalogReadsPerformedInV46!==1||
 ["actualDDLStatements","migrationsInstalled","mgTablesInstalled","rlsRealTests",
 "restoreTests","additionalSupabaseChargesAuthorized"].some(k=>ct[k]!==0))
 warn("FAKE_EXECUTION");
 if(!Array.isArray(m?.gates)||m.gates.length!==9||
 m.gates.some(x=>x.status==="GO"||x.status==="PASS")||
 !m.gates.some(x=>x.id==="G46-07"&&x.status==="NOT_AUTHORIZED")||
 !m.gates.some(x=>x.id==="G46-05"&&x.status==="NOT_TESTED"))
 warn("GATE_BYPASS");
 if(m?.decision?.readyForExecution!==false||
 m?.decision?.productionGo!==false||
 !Array.isArray(m?.decision?.blockingConditions)||
 m.decision.blockingConditions.length!==4)warn("FALSE_SIGNOFF");
 if(typeof recovery!=="string"||
 !recovery.includes("NO APROBADA")||
 !recovery.includes("RPO")||!recovery.includes("RTO")||
 !recovery.includes("DROP CASCADE")||
 !recovery.includes("no incluye")&&!recovery.includes("excluyen")||
 !recovery.includes("NO se logró"))
 warn("RECOVERY_PLAN_INVALID");
 return {valid:issues.length===0,issues,decision:"NO_GO",actualDDL:0,restoreTests:0};
}
yes("V46 manifest structurally coherent",verify(M,DDL,REC).valid);
yes("GO not possible",verify(M,DDL,REC).decision==="NO_GO");
yes("Source from V44 retained",V44.queries.find(x=>x.id==="R03").result.defaultAclRecords===6);
yes("Unchanged V45 blob",M.source.v45Install.githubBlobSha===OLD.artifacts[0].githubBlobSha);
yes("No prior schema owner forged",OLD.securityStatus.schemaOwnersVerified===false);
yes("V46 owner now explicitly confirmed",M.actualReadOnly.schemaPublicOwner==="pg_database_owner");
yes("Private MG schema still absent",M.actualReadOnly.schemaPrivateMgExists===false);
yes("Two default ACL creators",M.actualReadOnly.defaultAclCreatorsObservedInV44.length===2);
yes("No unsupported global default revocation",!/^\s*alter\s+default\s+privileges/mi.test(DDL));
yes("No credential material",!JSON.stringify(M).includes("sb_secret_"));
yes("No private project ref stored",!JSON.stringify(M).includes("yefcgjtovfnsqtdjdsod"));
yes("No backup files in repo",M.recoveryProposal.backupTaken===false);
yes("Auth/backend not authorized",M.approvals.deployBackend===false);
yes("No automatic project deletion",M.recoveryProposal.mayDeleteProject===false);
yes("Original DDL not in migrations directory",!M.source.v45Install.path.includes("migrations/"));
yes("No direct SQL parser claims",M.gates.find(x=>x.id==="G46-06").status==="NOT_TESTED");
const mutations=[
 ["false owner",x=>x.actualReadOnly.schemaPublicOwner="postgres","READ_ONLY_FACTS"],
 ["fake private schema",x=>x.actualReadOnly.schemaPrivateMgExists=true,"READ_ONLY_FACTS"],
 ["miscount default ACL",x=>x.actualReadOnly.defaultAclRowsObservedInV44=0,"READ_ONLY_FACTS"],
 ["allow browser CREATE",x=>x.actualReadOnly.publicCreateForAnonAndAuthenticated=true,"READ_ONLY_FACTS"],
 ["pretend backup approval",x=>x.recoveryProposal.approved=true,"RECOVERY_UNPROVEN"],
 ["pretend backup test",x=>x.recoveryProposal.backupTaken=true,"RECOVERY_UNPROVEN"],
 ["pretend restore",x=>x.recoveryProposal.restoreTested=true,"RECOVERY_UNPROVEN"],
 ["invent recovery owner",x=>x.recoveryProposal.owner="assumed","RECOVERY_UNPROVEN"],
 ["allow project deletion",x=>x.recoveryProposal.mayDeleteProject=true,"RECOVERY_UNPROVEN"],
 ["authorize DDL",x=>x.approvals.installDDL=true,"UNAUTHORIZED"],
 ["authorize migration",x=>x.approvals.applyMigration=true,"UNAUTHORIZED"],
 ["authorize restore",x=>x.approvals.restore=true,"UNAUTHORIZED"],
 ["authorize backend",x=>x.approvals.deployBackend=true,"UNAUTHORIZED"],
 ["authorize payments",x=>x.approvals.payments=true,"UNAUTHORIZED"],
 ["move to main",x=>x.approvals.modifyMain=true,"UNAUTHORIZED"],
 ["touch other projects",x=>x.approvals.modifyOtherProjects=true,"UNAUTHORIZED"],
 ["report fake DDL",x=>x.counts.actualDDLStatements=16,"FAKE_EXECUTION"],
 ["report fake migrations",x=>x.counts.migrationsInstalled=1,"FAKE_EXECUTION"],
 ["report fake RLS",x=>x.counts.rlsRealTests=25,"FAKE_EXECUTION"],
 ["skip gate",x=>x.gates[6].status="GO","GATE_BYPASS"],
 ["drop test gate",x=>x.gates.splice(4,1),"GATE_BYPASS"],
 ["claim ready",x=>x.decision.readyForExecution=true,"FALSE_SIGNOFF"],
 ["change pin",x=>x.source.v45Install.githubBlobSha="0".repeat(40),"SOURCE_PIN"],
 ["approve production",x=>x.decision.productionGo=true,"FALSE_SIGNOFF"],
 ["falsify SQL count",x=>x.proposedMigration.tables=15,"DDL_CONTRACT"]
];
for(const [label,change,issue] of mutations){
 const data=copy(M);change(data);
 yes("Detects "+label,verify(data,DDL,REC).issues.includes(issue));
 yes("Keeps NO GO "+label,verify(data,DDL,REC).decision==="NO_GO");
}
const sqlChanges=[
 ["REMOVE RLS",x=>x.replace("alter table public.mg_pages enable row level security;",""),"DDL_CONTRACT"],
 ["Add blanket default ACL",x=>x+"\nalter default privileges for role supabase_admin in schema public revoke all on tables from anon;","DDL_CONTRACT"],
 ["GRANT browser writes",x=>x+"\ngrant update on public.mg_sites to authenticated;","UNSAFE_DDL"],
 ["Add destructive SQL",x=>x+"\ndrop table public.mg_sites;","UNSAFE_DDL"],
 ["Change released status",x=>x.replace("('draft','review','suspended')","('draft','review','published','suspended')"),"DDL_CONTRACT"]
];
for(const [label,change,issue] of sqlChanges)
 yes("Tampered SQL "+label,verify(M,change(DDL),REC).issues.includes(issue));
yes("Plan tampering caught",verify(M,DDL,REC.replace("NO APROBADA","AUTORIZADO")).issues.includes("RECOVERY_PLAN_INVALID"));
console.log(n+" / "+n+" V46 source-only readiness checks PASS — NO GO.");
