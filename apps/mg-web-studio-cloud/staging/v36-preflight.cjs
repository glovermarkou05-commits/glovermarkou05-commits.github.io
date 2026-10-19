"use strict";
/* V36 C03 COORDINATED REVIEW PREFLIGHT — READ FILES ONLY.
 * No SQL execution, network, SDKs, migration runners, deploy or filesystem writes.
 * Exit 2 means static review coherent but NO GO; exit 1 means invalid/missing.
 */
const fs=require("node:fs"),path=require("node:path");
const base=path.join(__dirname,"..");
const FILES=Object.freeze({
 manifest:"staging/v36-coordinated-changes.review.json",
 originalCore:"db/schema_core.review.sql",
 originalV13:"db/v13-propuestas-scopes.review.sql",
 rlsHazard:"db/v13-endurecimiento-rls-legado.review.sql",
 reviewV20:"db/v20-contratos-propuestos.review.sql",
 reviewV34:"db/v34-home-publication.review.sql",
 reviewV35:"db/v35-estados-propuestas.review.sql",
 reviewV36:"db/v36-paq-coordinado.review.sql",
 planV33:"staging/v33-master-roadmap.review.json",
 gateV18:"staging/v18-manifest.review.json"
});
const APPROVAL_FLAGS=Object.freeze(["mayRunSQL","mayProvision","mayDeploy","mayPublish",
 "mayScheduleCron","maySendEmail","mayUsePaidAI","mayCharge","mayModifyMain","mayModifyOtherProjects"]);
const FIELDS=["id","organization_id","site_id","revision","created_at","updated_at","applied_draft_revision"];
const EXPECTED=["P00","P01","P02","P03","P04","P05","P06","P07"];
const CANONICAL=["draft","submitted","needs_changes","rejected","approved","applied"];
const EVENTS=["submitted","approved","changes","rejected","applied"];
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const uniq=x=>new Set(x).size===x.length;
const deny=(parts={})=>({version:36,mode:"static-review-no-execution",decision:"NO_GO",
 valid:false,issues:[],stagingReady:false,productionReady:false,
 actualDatabaseTests:0,actualSqlStatements:0,actualBackups:0,
 mayRunSQL:false,mayProvision:false,mayDeploy:false,mayPublish:false,
 maySendEmail:false,mayCharge:false,mayUsePaidAI:false,...parts});
function readFiles(reader){
 const read=typeof reader==="function"?reader:p=>fs.readFileSync(path.join(base,p),"utf8");
 const data={};
 for(const [key,p] of Object.entries(FILES)){
  const raw=read(p);
  data[key]=key==="manifest"||key==="planV33"||key==="gateV18"?JSON.parse(raw):raw;
 }
 return data;
}
function assess(data){
 const problems=[],add=x=>{if(!problems.includes(x))problems.push(x);};
 if(!plain(data)||Object.keys(FILES).some(k=>!(k in data))){add("MISSING_SOURCE");return deny({issues:problems});}
 const m=data.manifest;
 if(!plain(m)||m.format!=="mg-web-studio/coordinated-migrations-v36-review"||
 m.version!==36||m.project!=="MG WEB STUDIO CLOUD"||
 m.branch!=="feature/mg-digital-v5-web-services"||m.taskId!=="C03"||
 m.intendedMode!=="review-only-not-executable"||
 JSON.stringify(m.previous)!==JSON.stringify(["C01","C02"]))
 add("IDENTITY_OR_DEPENDENCIES_CHANGED");
 const auth=m&&m.authorization;
 if(!plain(auth)||auth.stagingApproved!==false||auth.productionApproved!==false||
 auth.costApproved!==false||auth.provider!==null||auth.region!==null||auth.reference!==null)
 add("AUTHORIZATION_FORGED");
 const flags=m&&m.execution;
 if(!plain(flags)||flags.reviewOnly!==true||APPROVAL_FLAGS.some(k=>flags[k]!==false)||
  Object.keys(flags||{}).some(k=>k!=="reviewOnly"&&!APPROVAL_FLAGS.includes(k)))
 add("EXECUTION_ALLOWED");
 if(!Array.isArray(m&&m.sourceDocs)||m.sourceDocs.length!==7||
   !uniq(m.sourceDocs.map(x=>x&&x.path))||
   !m.sourceDocs.every(x=>plain(x)&&x.execute===false)||
   !Object.values(FILES).filter(x=>x.startsWith("db/")).every(p=>m.sourceDocs.some(x=>x.path===p))||
   !m.sourceDocs.some(x=>x.path===FILES.rlsHazard&&x.kind==="contains-active-sql-hazard")||
   !m.sourceDocs.every(x=>x.path!==FILES.rlsHazard||x.execute===false))
 add("SQL_SOURCE_QUARANTINE_FAILED");
 for(const k of ["reviewV20","reviewV34","reviewV35","reviewV36"]){
  const raw=data[k];
  if(typeof raw!=="string"||!raw.split(/\r?\n/).every(line=>!line.trim()||line.trim().startsWith("--")))
   add("ACTIVE_SQL_IN_COMMENT_ONLY_PACKAGE");
 }
 // Active historical SQL must stay quarantined; do not interpret or execute it.
 if(typeof data.rlsHazard!=="string"||
   !/^\s*(?:begin\s*;|revoke\s+)/im.test(data.rlsHazard)||
   !/revoke\s+insert\s*,\s*update\s*,\s*delete/i.test(data.rlsHazard)||
   !/NO EJECUTAR/i.test(data.rlsHazard))
 add("RLS_HISTORICAL_HAZARD_NOT_RECOGNIZED");
 const core=typeof data.originalCore==="string"?data.originalCore:"";
 const sql=typeof data.originalV13==="string"?data.originalV13:"";
 if(!/create\s+table\s+public\.mg_pages\b/i.test(core)||
   !/unique\s*\(\s*site_id\s*,\s*slug\s*\)/i.test(core)||
   !/grant\s+select\s*,\s*insert\s+on\s+public\.mg_pages\s+to\s+authenticated/i.test(core)||
   !/update\s*\(slug\s*,\s*title\s*,\s*draft_blocks\)/i.test(core)||
   !/status\s+in\s*\([^)]*'published'/i.test(core))
 add("HOME_BASELINE_UNVERIFIED");
 if(!/create\s+table\s+public\.mg_site_proposals/i.test(sql)||
   !/submitted_for_review/i.test(sql)||!/applied_to_draft/i.test(sql)||
   !/create\s+table\s+public\.mg_proposal_reviews/i.test(sql)||
   !/create\s+table\s+public\.mg_proposal_notifications/i.test(sql)||
   !/create\s+table\s+mg_private\.mg_proposal_outbox/i.test(sql)||
   !/event_type\s+text/i.test(sql))
 add("V13_STATUS_BASELINE_UNVERIFIED");
 const compat=m&&m.compatibility;
 if(!plain(compat)||compat.homeInternalSlug!=="home"||
   compat.homePublicRoute!=="/"||compat.disallowDuplicateHome!==true||
   compat.requirePublishedHomeInFutureDatabase!==true||
   compat.homeGuaranteeImplemented!==false||
   JSON.stringify(compat.mappings)!==JSON.stringify([
    {from:"submitted_for_review",to:"submitted",table:"public.mg_site_proposals",column:"status"},
    {from:"applied_to_draft",to:"applied",table:"public.mg_site_proposals",column:"status"}])||
   JSON.stringify(compat.preserveReviewDecisions)!==JSON.stringify(["approved","changes","rejected"])||
   JSON.stringify(compat.preserveEventTypes)!==JSON.stringify(EVENTS)||
   JSON.stringify(compat.newEventTypesNeedSeparateReview)!==JSON.stringify(["proposal_created","proposal_revised"])||
   JSON.stringify(compat.preserveFields)!==JSON.stringify(FIELDS)||
   compat.rollbackStrategy!=="coordinated-backup-restore-and-version-aware-reverse-mapping-after-write-freeze"||
   compat.transactBusinessStateAuditOutbox!==true||
   compat.transactionImplemented!==false||
   compat.sqlStateConflictOpen!==true||compat.homeExistenceConflictOpen!==true)
 add("COMPATIBILITY_OR_ROLLBACK_UNSAFE");
 const phases=Array.isArray(m&&m.phases)?m.phases:[];
 if(phases.length!==8||!uniq(phases.map(x=>x&&x.id))||
   JSON.stringify(phases.map(x=>x&&x.id))!==JSON.stringify(EXPECTED)||
   phases.some(x=>!plain(x)||!Array.isArray(x.depends)||
    x.depends.some(dep=>!EXPECTED.includes(dep)||EXPECTED.indexOf(dep)>=EXPECTED.indexOf(x.id))||
    x.requiresRealEnvironment!==true||
    x.status!=="BLOCKED_NOT_AUTHORIZED"||
    typeof x.action!=="string"||x.action.length<60||
    typeof x.exit!=="string"||x.exit.length<45||
    typeof x.owner!=="string"||x.owner.length<3))
 add("PHASES_OR_GATES_CHANGED");
 const proof=m&&m.evidence;
 if(!plain(proof)||[
 "realDatabaseTests","realAuthTests","sqlStatementsExecuted","backupTested",
 "restoredSuccessfully","outboxDeliveryTested","checksExecuted"
 ].some(k=>proof[k]!==0&&proof[k]!==false)||
   proof.realDatabaseTests!==0||proof.realAuthTests!==0||proof.sqlStatementsExecuted!==0||
   proof.homeMigrationApplied!==false||proof.statusMigrationApplied!==false||
   proof.backupTested!==false||proof.restoredSuccessfully!==false||
   proof.outboxDeliveryTested!==false||proof.checksExecuted!==0)
 add("REAL_EVIDENCE_FABRICATED");
 const release=m&&m.acceptance;
 if(!plain(release)||release.readiness!=="NO_GO"||
  release.staging!=="NO_GO"||release.production!=="NO_GO"||
  release.reviewedBy!==null||release.signoffRef!==null)
 add("RELEASE_GATE_CHANGED");
 const master=data.planV33,g18=data.gateV18;
 if(!plain(master)||master.sourceBranch!=="feature/mg-digital-v5-web-services"||
  master.stagingAuthorized!==false||master.productionAuthorized!==false||
  master.summary?.decision!=="NO_GO"||
  !Array.isArray(master.tasks)||
  !master.tasks.some(t=>t.id==="C03"&&t.status==="BLOCKED_DEPENDENCY"&&
   JSON.stringify(t.deps)===JSON.stringify(["C01","C02"])))
 add("MASTER_ROADMAP_GATE_CHANGED");
 if(!plain(g18)||g18.state!=="NOT_AUTHORIZED"||
  g18.authorization?.granted!==false||!Array.isArray(g18.checks)||
  g18.checks.length!==16||g18.checks.some(x=>x.status!=="pending")||
  g18.execution?.mayRunMigrations!==false||g18.execution?.mayDeploy!==false)
 add("STAGING_GATE_CHANGED");
 const clauses=data.reviewV36||"";
 for(const q of ["ROLLBACK","SECURITY DEFINER","published","submitted_for_review","applied_to_draft","changes","CHECK","backup","NO EJECUTAR"]){
  if(typeof clauses!=="string"||!clauses.toLowerCase().includes(q.toLowerCase()))
   add("DOCUMENTATION_INCOMPLETE");
 }
 return deny({valid:problems.length===0,issues:problems,sourceDocuments:7,
  phases:8,realGatesPending:16,approvalsPending:2,
  reviewedCommentOnlyFiles:4,historicalActiveSqlQuarantined:true,
  nextPermittedStep:"REVIEW_PLAN_ONLY"});
}
function output(result){
 return [
 "MG WEB STUDIO CLOUD V36 — C03 PAQUETE COORDINADO",
 "Validación documental: "+(result.valid?"consistente":"inconsistente"),
 "Fases futuras: "+(result.phases??"desconocidas")+" | SQL potencialmente activo histórico: CUARENTENA",
 "Staging: NO AUTORIZADO | SQL ejecutado: 0 | Producción: NO GO",
 "Problemas: "+result.issues.join(", "),
 "Siguiente acción autorizada: revisión en GitHub, sin aplicar cambios."
 ].join("\n");
}
if(require.main===module){
 let report;
 try{report=assess(readFiles());}catch(e){report=deny({issues:["READ_FAILURE"]});}
 console.log(output(report));
 process.exitCode=report.valid?2:1;
}
module.exports={FILES,readFiles,assess,output};
