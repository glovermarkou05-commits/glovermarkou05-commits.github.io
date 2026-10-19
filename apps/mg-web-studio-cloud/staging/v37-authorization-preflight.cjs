"use strict";
/* MG WEB STUDIO CLOUD V37: isolated-staging approval REQUEST preflight.
 * READ FILES ONLY: always NO GO. No SQL, credentials, provisioning, HTTP, timers.
 * Exit 2 = consistent pending request, still NOT AUTHORIZED.
 * Exit 1 = inconsistent review evidence, still NOT AUTHORIZED.
 */
const fs=require("node:fs"),path=require("node:path");
const BASE=path.join(__dirname,"..");
const FILES=Object.freeze({
 request:"staging/v37-authorization-packet.review.json",
 v18:"staging/v18-manifest.review.json",
 v33:"staging/v33-master-roadmap.review.json",
 v36:"staging/v36-coordinated-changes.review.json",
 rlsHazard:"db/v13-endurecimiento-rls-legado.review.sql"
});
const CHECKS=Object.freeze([
 ["authorization","governance","approval-prerequisite"],
 ["budget","governance","approval-prerequisite"],
 ["provider_region","governance","approval-prerequisite"],
 ["isolated_environment","isolation","approval-prerequisite"],
 ["secrets_review","security","post-approval-validation"],
 ["tenant_scope","security","post-approval-validation"],
 ["auth_mfa","security","post-approval-validation"],
 ["rls_pgtest","security","post-approval-validation"],
 ["sql_compat","database","post-approval-validation"],
 ["home_slug","database","post-approval-validation"],
 ["rollback_review","recovery","post-approval-validation"],
 ["backup_restore","recovery","post-approval-validation"],
 ["observability","operations","post-approval-validation"],
 ["privacy_fixtures","operations","approval-prerequisite"],
 ["smoke_e2e","qa","post-approval-validation"],
 ["signoff","governance","post-approval-validation"]
]);
const QUESTIONS=Object.freeze(["approver","provider","region","monthlyBudgetUsd","costAlertsAndStop",
 "dataPolicy","isolationAndAccess","allowedActions","incidentOwner"]);
const ACTION_KEYS=Object.freeze(["reviewExistingGitHub","createEnvironment","accessDatabase","runSQL",
 "deployBackend","activatePayments","sendNotifications","scheduleJobs","publish","callPaidAI",
 "modifyMain","modifyOtherProjects"]);
const DATA_KEYS=Object.freeze(["syntheticOnly","noProductionData","noClientUploads","noSecretsInGitHub","separateTenantAndAccess"]);
const SOURCES=Object.freeze([FILES.v18,FILES.v33,FILES.v36,FILES.rlsHazard]);
const RISKS=Object.freeze(["SQL_ACTIVE_IN_REVIEW_FILE","MISSING_PUBLISHED_HOME_INVARIANT",
 "SQL_STATUS_API_DRIFT","RLS_MFA_NOT_TESTED","NO_DURABLE_ACID_OR_OUTBOX",
 "BACKUP_RESTORE_NOT_TESTED","COST_AND_PROVIDER_UNAPPROVED"]);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const unique=xs=>Array.isArray(xs)&&new Set(xs).size===xs.length;
function readFiles(reader){
 const fn=typeof reader==="function"?reader:p=>fs.readFileSync(path.join(BASE,p),"utf8");
 const files={};for(const [name,p] of Object.entries(FILES)){
  const data=fn(p);files[name]=name==="rlsHazard"?data:JSON.parse(data);
 }return files;
}
const result=(issues,extra={})=>({
 version:37,mode:"static-request-review",decision:"NOT_AUTHORIZED",
 status:"NO_GO",valid:issues.length===0,issues,
 preApprovalPending:5,postApprovalChecksPending:11,
 openQuestions:9,realTestsVerified:0,realResourcesCreated:0,
 mayProvision:false,mayConnectDatabase:false,mayExecuteSQL:false,mayDeploy:false,
 mayPublish:false,mayBill:false,maySendNotifications:false,mayCallPaidAI:false,
 stagingReady:false,productionReady:false,...extra
});
function assess(files){
 const issues=[],add=s=>{if(!issues.includes(s))issues.push(s);};
 if(!plain(files)||Object.keys(FILES).some(k=>!(k in files))){
  add("REQUIRED_FILES_MISSING");return result(issues);
 }
 const p=files.request,old=files.v18,master=files.v33,v36=files.v36;
 if(!plain(p)||p.format!=="mg-web-studio/v37-isolated-staging-authorization-review"||
  p.version!==37||p.project!=="MG WEB STUDIO CLOUD"||
  p.branch!=="feature/mg-digital-v5-web-services"||
  p.sourceTask!=="G01"||p.currentDecision!=="NOT_AUTHORIZED"||
  p.notAnAuthorization!==true)add("PACKAGE_IDENTITY_CHANGED");
 if(!plain(p&&p.authorization)||p.authorization.granted!==false||
  p.authorization.reference!==null||p.authorization.approver!==null||
  p.authorization.approvedOn!==null)add("FORGED_APPROVAL");
 const target=p&&p.target;
 if(!plain(target)||!["provider","account","projectRef","region","monthlyBudgetUsd","plan"].every(k=>target[k]===null)||
  Object.keys(target||{}).length!==6)add("PROVIDER_OR_BUDGET_UNVERIFIED");
 const data=p&&p.dataRestrictions;
 if(!plain(data)||Object.keys(data).length!==DATA_KEYS.length||
  !DATA_KEYS.every(k=>data[k]===true))add("DATA_BOUNDARY_UNSAFE");
 const scope=p&&p.boundedScope;
 if(!plain(scope)||Object.keys(scope).length!==ACTION_KEYS.length||
  scope.reviewExistingGitHub!==true||
  !ACTION_KEYS.filter(x=>x!=="reviewExistingGitHub").every(k=>scope[k]===false))
 add("UNAUTHORIZED_OPERATIONS");
 const requiredQuestions=p&&p.decisionQuestions;
 if(!Array.isArray(requiredQuestions)||requiredQuestions.length!==QUESTIONS.length||
  !unique(requiredQuestions.map(q=>q&&q.key))||
  !QUESTIONS.every(key=>requiredQuestions.some(q=>plain(q)&&q.key===key&&q.value===null&&
   q.required===true&&typeof q.prompt==="string"&&q.prompt.length>35)))
 add("AUTHORIZATION_QUESTIONS_UNANSWERED_OR_TAMPERED");
 const scenarios=p&&p.evidenceClassification;
 if(!Array.isArray(scenarios)||scenarios.length!==16||!unique(scenarios.map(x=>x&&x.id))||
  !CHECKS.every(([id,category,stage])=>scenarios.some(x=>plain(x)&&x.id===id&&
   x.category===category&&x.stage===stage&&x.status==="PENDING"&&x.evidence===null)))
 add("CLASSIFICATION_CHANGED");
 if(!Array.isArray(p&&p.reviewerChecklist)||p.reviewerChecklist.length!==6||
  !p.reviewerChecklist.every((x,i)=>plain(x)&&x.id==="A"+String(i+1).padStart(2,"0")&&
   x.status==="OPEN"&&typeof x.text==="string"&&x.text.length>20))
 add("REVIEW_CHECKLIST_CHANGED");
 if(!Array.isArray(p&&p.sourceRefs)||p.sourceRefs.length!==4||
  !SOURCES.every(x=>p.sourceRefs.includes(x))||!unique(p.sourceRefs))
 add("EVIDENCE_SOURCES_CHANGED");
 if(!Array.isArray(p&&p.knownRisks)||p.knownRisks.length!==7||
  !unique(p.knownRisks.map(x=>x.code))||
  !RISKS.every(code=>p.knownRisks.some(x=>x.code===code&&x.severity==="high"&&
   typeof x.mitigation==="string"&&x.mitigation.length>35)))
 add("RISKS_REMOVED");
 const next=p&&p.nextAllowedActions;
 if(!Array.isArray(next)||next.length!==4||
  !next.every(x=>typeof x==="string"&&x.length>35))add("SAFE_NEXT_ACTIONS_CHANGED");
 const c=p&&p.criteria;
 if(!plain(c)||c.requestQuestionsOpen!==9||c.preApprovalRequirements!==5||
  c.postApprovalValidationRequirements!==11||c.stage!=="NO_GO"||
  c.production!=="NO_GO"||c.realSQLTests!==0||
  c.realBrowserTests!==0||c.realRecoveryTests!==0)
 add("READINESS_FALSIFIED");
 const run=p&&p.realExecution;
 if(!plain(run)||Object.keys(run).length!==5||
  !["resourcesCreated","queriesExecuted","deployments","noticesSent","charges"].every(k=>run[k]===0))
 add("EXECUTION_FALSIFIED");
 if(!plain(old)||old.version!==18||old.state!=="NOT_AUTHORIZED"||
  old.authorization?.granted!==false||old.execution?.mayProvision!==false||
  old.execution?.mayRunMigrations!==false||old.execution?.mayDeploy!==false||
  !Array.isArray(old.checks)||old.checks.length!==16||
  !CHECKS.every(([id,category])=>old.checks.some(x=>x.id===id&&
    x.category===category&&x.status==="pending"&&x.evidenceRef===null)))
 add("V18_PRECONDITIONS_CHANGED");
 if(!plain(master)||master.sourceBranch!=="feature/mg-digital-v5-web-services"||
  master.stagingAuthorized!==false||master.productionAuthorized!==false||
  master.summary?.decision!=="NO_GO"||
  !Array.isArray(master.tasks)||!master.tasks.some(x=>x.id==="G01"&&
   x.mode==="explicit-user-approval"&&x.status==="BLOCKED_NEEDS_APPROVAL")||
  !master.tasks.some(x=>x.id==="P01"&&x.mode==="separate-production-approval"))
 add("MASTER_APPROVAL_BOUNDARY_CHANGED");
 if(!plain(v36)||v36.taskId!=="C03"||v36.authorization?.stagingApproved!==false||
  v36.authorization?.productionApproved!==false||
  v36.execution?.mayRunSQL!==false||v36.execution?.mayDeploy!==false||
  !Array.isArray(v36.phases)||v36.phases.length!==8||
  v36.phases.some(x=>x.status!=="BLOCKED_NOT_AUTHORIZED")||
  v36.evidence?.sqlStatementsExecuted!==0||
  v36.acceptance?.production!=="NO_GO")
 add("V36_MIGRATION_BOUNDARY_CHANGED");
 if(typeof files.rlsHazard!=="string"||
  !/\bbegin\s*;/i.test(files.rlsHazard)||
  !/revoke\s+insert\s*,\s*update\s*,\s*delete/i.test(files.rlsHazard)||
  !/NO EJECUTAR/i.test(files.rlsHazard))
 add("ACTIVE_SQL_HAZARD_NOT_RECOGNIZED");
 return result(issues,{
  classifiedV18Checks:16,
  risksToReview:7,
  firstRequiredDecision:"APPROVE_ONLY_A_BOUNDED_STAGING_REQUEST_EXTERNALLY",
  authorizationCanBeInferredFromJson:false
 });
}
function render(res){
 return [
 "MG WEB STUDIO CLOUD · V37 | SOLICITUD DE STAGING, NO AUTORIZADO",
 res.valid?"Paquete documental: coherente":"Paquete documental: inconsistencias",
 "Preguntas abiertas: "+res.openQuestions,
 "Antes de autorización: "+res.preApprovalPending+" requisitos | Pruebas posteriores: "+res.postApprovalChecksPending,
 "Riesgos conocidos: "+(res.risksToReview??"revisar"),
 "Ningún servicio contratado, SQL ejecutado, despliegue ni publicación.",
 "Problemas: "+res.issues.join(", "),
 "Resultado: NO GO, aprobación humana pendiente."
 ].join("\n");
}
if(require.main===module){
 let r;try{r=assess(readFiles());}catch(e){r=result(["INPUT_UNREADABLE"]);}
 console.log(render(r));process.exitCode=r.valid?2:1;
}
module.exports={FILES,CHECKS,readFiles,assess,render};
