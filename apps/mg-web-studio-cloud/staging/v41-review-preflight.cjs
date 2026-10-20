"use strict";
/* V41 SOURCE-ONLY SECURITY / RECOVERY PRE-FLIGHT.
 * NO SQL, DATABASE, SUPABASE, FILE WRITES, NETWORK, OR PERMISSION CHANGES.
 * Exit 2 = document findings consistent, but NO GO; exit 1 = inconsistent.
 */
const fs=require("node:fs"),path=require("node:path");
const BASE=path.join(__dirname,"..");
const FILES=Object.freeze({
 manifest:"staging/v41-security-recovery.review.json",
 v40:"staging/v40-sql-review-package.review.json",
 baseline:"staging/v39-initial-readonly-inventory.review.json",
 core:"db/v40-drafts/01_core_schema.sql.txt",
 proposal:"db/v40-drafts/02_proposals_audit.sql.txt",
 rls:"db/v40-drafts/03_readonly_rls.sql.txt",
 hardening:"db/v41-default-privileges.review.sql",
 recovery:"PLAN-RECUPERACION-STAGING-V41.md"
});
const ids=Object.freeze(Array.from({length:12},(_,i)=>"V41-"+String(i+1).padStart(2,"0")));
const priorityP0=Object.freeze(["V41-01","V41-02","V41-03","V41-04","V41-10"]);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const unique=a=>Array.isArray(a)&&new Set(a).size===a.length;
const stripped=s=>typeof s==="string"?s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/--[^\n]*/g,""):"";
function readFiles(reader){
 const fn=typeof reader==="function"?reader:p=>fs.readFileSync(path.join(BASE,p),"utf8");
 const out={};for(const [k,p] of Object.entries(FILES)){
  const raw=fn(p);out[k]=["manifest","v40","baseline"].includes(k)?JSON.parse(raw):raw;
 }return out;
}
function report(issues,extras={}){
 return {version:41,mode:"source-only-security-review",
 valid:issues.length===0,issues,decision:"NO_GO",sqlExecuted:0,
 securitySignoff:false,recoverySignoff:false,postgresTests:0,rlsRealTests:0,
 actualRestoreTests:0,mayExecuteSql:false,mayDeploy:false,mayPublish:false,
 productionReady:false,stagingSqlReady:false,...extras};
}
function assess(input){
 const issues=[],add=s=>{if(!issues.includes(s))issues.push(s)};
 if(!plain(input)||Object.keys(FILES).some(k=>!(k in input))){
  add("MISSING_REVIEW_SOURCE");return report(issues);
 }
 const m=input.manifest,old=input.v40,b=input.baseline;
 if(!plain(m)||m.format!=="mg-web-studio/v41-security-recovery-review"||
 m.version!==41||m.project!=="MG WEB STUDIO CLOUD"||
 m.branch!=="feature/mg-digital-v5-web-services"||
 m.target!=="MG WEB STUDIO CLOUD - STAGING"||
 m.baseline!==FILES.baseline||
 JSON.stringify(m.sourceDrafts)!==JSON.stringify([FILES.core,FILES.proposal,FILES.rls]))
 add("REVIEW_IDENTITY_CHANGED");
 const findings=m&&m.findings;
 if(!Array.isArray(findings)||findings.length!==12||
  !unique(findings.map(x=>x&&x.id))||
  !ids.every(id=>findings.some(x=>plain(x)&&x.id===id&&
    x.priority===(priorityP0.includes(id)?"P0":"P1")&&
    x.status==="OPEN"&&x.realEvidence===null&&
    typeof x.finding==="string"&&x.finding.length>50&&
    typeof x.acceptance==="string"&&x.acceptance.length>45)))
 add("SECURITY_FINDINGS_CLOSED_WITHOUT_EVIDENCE");
 if(!Array.isArray(m&&m.stages)||m.stages.length!==6||
  JSON.stringify(m.stages.map(x=>x.id))!==JSON.stringify(["S0","S1","S2","S3","S4","S5"])||
  JSON.stringify(m.stages.map(x=>x.status))!==JSON.stringify([
    "IN_REVIEW_ONLY","NOT_AUTHORIZED","NOT_EXECUTED","NOT_EXECUTED","NOT_EXECUTED","NO_GO"]))
 add("STAGE_GATE_CHANGED");
 if(!Array.isArray(m&&m.references)||m.references.length!==4||
  !m.references.every(x=>plain(x)&&typeof x.url==="string"&&
    x.url.startsWith("https://supabase.com/")))
 add("OFFICIAL_GUIDANCE_MISSING");
 const recovery=m&&m.recovery;
 if(!plain(recovery)||recovery.status!=="NOT_TESTED"||
  recovery.backupsMade!==0||recovery.restoreAttempts!==0||
  recovery.rpoApproved!==false||recovery.rtoApproved!==false||
  recovery.ownerApproved!==false||recovery.riskOfPartialCommit!==true||
  !Array.isArray(recovery.minimumChecks)||recovery.minimumChecks.length!==6||
  !Array.isArray(recovery.forbidden)||recovery.forbidden.length!==4)
 add("RECOVERY_PROOF_FABRICATED");
 const perm=m&&m.permissions;
 if(!plain(perm)||perm.githubReview!==true||
  ["sqlExecution","migrate","changeStaging","restore","deploy","sendNotifications",
    "publish","charge","modifyOtherProjects"].some(k=>perm[k]!==false))
 add("EXECUTION_PERMISSION_FALSIFIED");
 const ev=m&&m.evidence;
 if(!plain(ev)||["realSqlExecuted","realPgTest","realRlsScenarios",
 "realBackupRestores","physicalTablesChanged","credentialsRead"].some(k=>ev[k]!==0))
 add("REAL_EVIDENCE_FALSIFIED");
 const dec=m&&m.decision;
 if(!plain(dec)||dec.securitySignoff!==false||dec.recoverySignoff!==false||
 dec.readyForSqlExecution!==false||dec.readyForBackend!==false||
 dec.readyForProduction!==false||dec.noGo!==true)
 add("SIGNOFF_FORGED");
 if(!plain(old)||old.version!==40||old.decision!=="REVIEW_ONLY_NOT_APPROVED"||
  old.authorization?.executeSQL!==false||old.authorization?.applyMigration!==false||
  old.outcomes?.sqlStatementsExecuted!==0||old.outcomes?.stagingSchemaInstalled!==false)
 add("V40_APPROVAL_GATE_CHANGED");
 if(!plain(b)||b.version!==39||b.counts?.publicTables!==0||
  b.counts?.migrations!==0||b.approvalBoundary?.executeSQLApproved!==false)
 add("V39_SNAPSHOT_CHANGED");
 const core=stripped(input.core),proposal=stripped(input.proposal),rls=stripped(input.rls);
 if(!core.includes("create table public.mg_sites")||
  !core.includes("create table public.mg_pages")||
  !/status\s+in\s*\(\s*'draft','review','suspended'\s*\)/.test(core))
 add("PUBLISHED_STATUS_BLOCK_NOT_OBSERVED");
 if(!core.includes("create table mg_private.mg_audit_events")||
  !/organization_id uuid\s*,/.test(core)||
  /create\s+table\s+mg_private\.mg_audit_events\s*\([\s\S]*?foreign\s+key\s*\(\s*organization_id/i.test(core))
 add("AUDIT_TENANT_FK_REVIEW_ASSUMPTION_CHANGED");
 if(!proposal.includes("create table mg_private.mg_proposal_outbox")||
  !proposal.includes("create table mg_private.mg_operation_idempotency")||
  !/primary\s+key\s*\(\s*organization_id\s*,\s*actor_user_id\s*,\s*operation_key\s*\)/.test(proposal))
 add("OUTBOX_IDEMPOTENCY_BASELINE_CHANGED");
 if(!rls.includes("grant select,insert,update,delete on table")||
  !rls.includes("to service_role;")||
  !rls.includes("to authenticated;")||
  /alter\s+default\s+privileges/i.test(rls)||
  /create\s+function|security\s+definer/i.test(rls))
 add("DEFAULT_GRANTS_OR_SERVICE_ROLE_RISK_CHANGED");
 if(typeof input.hardening!=="string"||
 !input.hardening.split(/\r?\n/).every(line=>!line.trim()||line.trim().startsWith("--"))||
 !input.hardening.includes("pg_default_acl")||
 !input.hardening.includes("alter default privileges for role postgres")||
 !input.hardening.includes("NO ES MIGRACION"))
 add("HARDENING_DESIGN_INVALID");
 if(typeof input.recovery!=="string"||
 !input.recovery.includes("NO EJECUTADO")||
 !input.recovery.includes("RPO/RTO")||
 !input.recovery.includes("BEGIN")&&!input.recovery.includes("COMMIT")||
 !input.recovery.includes("R6")||
 !input.recovery.includes("Free"))
 add("RECOVERY_RUNBOOK_MISSING");
 return report(issues,{openFindings:12,p0BeforeAnySql:5,
  preparedDrafts:3,partialCommitRiskDocumented:true,
  securityFindingsVerifiedOnlyAgainstSource:true});
}
function summary(r){
 return [
 "MG WEB STUDIO CLOUD V41 — REVIEW / RECOVERY / NO SQL",
 "Coherencia documental: "+(r.valid?"APTA PARA REVISIÓN":"INCONSISTENTE"),
 "Hallazgos abiertos: "+(r.openFindings??"no comprobados")+
  ", P0: "+(r.p0BeforeAnySql??"no comprobados"),
 "SQL ejecutado: 0, restauraciones: 0, aprobación: NO GO",
 "Problemas: "+r.issues.join(", ")
 ].join("\n");
}
if(require.main===module){
 let r;try{r=assess(readFiles());}catch(e){r=report(["REVIEW_SOURCE_UNREADABLE"]);}
 console.log(summary(r));process.exitCode=r.valid?2:1;
}
module.exports={FILES,readFiles,assess,summary};
