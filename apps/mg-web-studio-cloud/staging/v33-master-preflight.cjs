"use strict";
/* V33 Master Readiness Preflight — READ ONLY, fail closed, always NO GO.
 * node apps/mg-web-studio-cloud/staging/v33-master-preflight.cjs
 * Exit 2 = valid review inventory but release NOT AUTHORIZED (expected).
 * Exit 1 = invalid/inconsistent review inventory.
 * No SQL, provisioning, fetch, background processes, file writes or alerts.
 */
const fs=require("node:fs"),path=require("node:path");
const BASE=path.join(__dirname,"..");
const FILES={
 roadmap:"staging/v33-master-roadmap.review.json",
 v18:"staging/v18-manifest.review.json",
 v28:"staging/v28-backend-rls-matrix.review.json",
 v29:"staging/v29-backend-contract.review.json",
 v30:"staging/v30-outbox-delivery.review.json",
 v31:"staging/v31-observability.review.json",
 v32:"staging/v32-combined-faults.review.json"
};
const REQUIRED_IDS=["G01","C01","C02","C03","S01","S02","D01","D02","D03","R01","Q01","P01","X01"];
const REQUIRED_BLOCKERS=["HOME_SLUG_CONFLICT","STATUS_CONTRACT_MISMATCH","SECURITY_DEFINER_REVIEW",
 "CAS_SQL_TRANSACTION_UNPROVEN","POSTGRES_REQUIRED","AUTH_MFA_REAL_UNTESTED","AUDIT_INTEGRITY_UNPROVEN"];
const ALLOWED_MODES=["github-only-no-execution","explicit-user-approval","requires-staging-approval",
 "separate-production-approval","optional-separate-approval"];
const FALSE_FLAGS=["mayProvision","mayRunSQL","mayDeploy","mayPublish","maySendEmail",
 "mayActivateBilling","mayUsePaidAI","mayModifyMain","mayModifyOtherProjects"];
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const unique=arr=>new Set(arr).size===arr.length;
function load(reader){
 const r=typeof reader==="function"?reader:p=>fs.readFileSync(path.join(BASE,p),"utf8");
 return Object.fromEntries(Object.entries(FILES).map(([k,v])=>[k,JSON.parse(r(v))]));
}
function assess(inputs){
 const problems=[],add=(code)=>{if(!problems.includes(code))problems.push(code);};
 if(!obj(inputs)||Object.keys(FILES).some(k=>!obj(inputs[k]))){
  add("REVIEW_FILES_MISSING");
  return {version:33,valid:false,decision:"NO_GO",problems,mayRunSQL:false,
   mayDeploy:false,stagingReady:false,productionReady:false};
 }
 const {roadmap:r,v18,v28,v29,v30,v31,v32}=inputs;
 if(r.format!=="mg-web-studio/master-readiness-v33-review"||r.version!==33||
  r.project!=="MG WEB STUDIO CLOUD"||r.sourceBranch!=="feature/mg-digital-v5-web-services"||
  r.productionAuthorized!==false||r.stagingAuthorized!==false)
  add("ROADMAP_IDENTITY_OR_APPROVAL");
 if(!obj(r.execution)||r.execution.reviewOnly!==true||
  FALSE_FLAGS.some(k=>r.execution[k]!==false)||
  Object.keys(r.execution||{}).some(k=>k!=="reviewOnly"&&!FALSE_FLAGS.includes(k)))
  add("ROADMAP_EXECUTION_UNSAFE");
 const s=r.summary;
 if(!obj(s)||s.decision!=="NO_GO"||s.stage!=="NO_GO"||s.production!=="NO_GO"||
  s.nextTask!=="C01"||!obj(s.inventory)||s.inventory.v17CatalogCount!==32||
  s.inventory.v18Pending!==16||s.inventory.v19BlockingIncompatibilities!==2||
  s.inventory.v28Unexecuted!==30||s.inventory.v30Unexecuted!==18||
  s.inventory.v31Unexecuted!==20||s.inventory.v32Unexecuted!==24||
  s.inventory.disjointIssueCountClaimed!==false)
  add("SUMMARY_CHANGED");
 if(!Array.isArray(r.openBlockers)||!REQUIRED_BLOCKERS.every(k=>r.openBlockers.includes(k))||
  !unique(r.openBlockers))add("UNRESOLVED_BLOCKERS_CHANGED");
 const tasks=Array.isArray(r.tasks)?r.tasks:[];
 const ids=tasks.map(x=>x&&x.id);
 if(tasks.length!==REQUIRED_IDS.length||!unique(ids)||
  !REQUIRED_IDS.every(id=>ids.includes(id)))
  add("TASK_SET_CHANGED");
 const map=new Map(tasks.filter(obj).map(t=>[t.id,t]));
 for(const task of tasks){
  if(!obj(task)||typeof task.id!=="string"||
   !["P0","P1","P2"].includes(task.priority)||!ALLOWED_MODES.includes(task.mode)||
   typeof task.title!=="string"||task.title.length<12||
   typeof task.exit!=="string"||task.exit.length<30||
   !Array.isArray(task.deps)||!unique(task.deps)||
   task.deps.some(k=>k===task.id||!map.has(k))||
   !Array.isArray(task.source)||task.source.length===0||
   task.source.some(p=>typeof p!=="string"||!p.includes(".")||p.includes(".."))||
   !Array.isArray(task.gate)||typeof task.owner!=="string"||
   !["READY_FOR_GITHUB_WORK","BLOCKED_NEEDS_APPROVAL",
     "BLOCKED_DEPENDENCY","NOT_AUTHORIZED_OPTIONAL"].includes(task.status))
   add("INVALID_TASK");
  if(obj(task)){
   if(task.mode==="github-only-no-execution"&&!["READY_FOR_GITHUB_WORK","BLOCKED_DEPENDENCY"].includes(task.status))
    add("GITHUB_TASK_INCONSISTENT");
   if(task.mode!=="github-only-no-execution"&&task.status!=="BLOCKED_NEEDS_APPROVAL"&&
    task.status!=="NOT_AUTHORIZED_OPTIONAL")add("APPROVAL_BYPASS");
   if(task.id==="C01"&&task.status!=="READY_FOR_GITHUB_WORK")add("NEXT_TASK_NOT_READY");
  }
 }
 const visiting=new Set(),seen=new Set();
 const visit=id=>{
  if(visiting.has(id)){add("DEPENDENCY_CYCLE");return;}
  if(seen.has(id))return;
  visiting.add(id);
  const task=map.get(id);
  if(task&&Array.isArray(task.deps))for(const d of task.deps)if(map.has(d))visit(d);
  visiting.delete(id);seen.add(id);
 };
 for(const id of map.keys())visit(id);
 if(!Array.isArray(r.milestones)||r.milestones.length!==4||
  !unique(r.milestones.map(x=>x.id))||
  r.milestones.some(x=>!obj(x)||x.goAllowed!==false||
   !Array.isArray(x.taskIds)||x.taskIds.some(id=>!map.has(id))))
  add("MILESTONES_INCOMPLETE");
 else{
  const listed=r.milestones.flatMap(m=>m.taskIds);
  if(listed.length!==tasks.length||!unique(listed))add("MILESTONES_INCOMPLETE");
 }
 const pending=(rows,key,status)=>Array.isArray(rows)&&rows.filter(x=>x&&x[key]===status).length===rows.length;
 const requiredV18=["authorization","budget","provider_region","isolated_environment","secrets_review",
  "tenant_scope","auth_mfa","rls_pgtest","sql_compat","home_slug","rollback_review",
  "backup_restore","observability","privacy_fixtures","smoke_e2e","signoff"];
 if(v18.version!==18||v18.state!=="NOT_AUTHORIZED"||
  v18.authorization?.granted!==false||v18.execution?.mayDeploy!==false||
  v18.execution?.mayRunMigrations!==false||v18.execution?.dryRunOnly!==true||
  !Array.isArray(v18.checks)||v18.checks.length!==16||
  !pending(v18.checks,"status","pending")||v18.checks.some(x=>x.evidenceRef!==null)||
  !requiredV18.every(k=>v18.checks.some(x=>x.id===k)))
  add("V18_GATE_CHANGED");
 const checks={
  v18Pending:Array.isArray(v18.checks)?v18.checks.filter(x=>x.status==="pending").length:null,
  v28Unexecuted:Array.isArray(v28.cases)?v28.cases.filter(x=>x.evidenceStatus==="NOT_EXECUTED").length:null,
  v30Unexecuted:Array.isArray(v30.checklist)?v30.checklist.filter(x=>x.evidenceStatus==="NOT_EXECUTED").length:null,
  v31Unexecuted:Array.isArray(v31.checklist)?v31.checklist.filter(x=>x.evidenceStatus==="NOT_EXECUTED").length:null,
  v32Unexecuted:Array.isArray(v32.cases)?v32.cases.filter(x=>x.evidenceStatus==="NOT_EXECUTED").length:null
 };
 for(const [name,rows,target] of [
  ["V28",v28.cases,30],["V30",v30.checklist,18],
  ["V31",v31.checklist,20],["V32",v32.cases,24]
 ]){
  if(!Array.isArray(rows)||rows.length!==target||!pending(rows,"evidenceStatus","NOT_EXECUTED")||
   rows.some(x=>x.evidenceRef!==null))add(name+"_EVIDENCE_CHANGED");
 }
 if(v28.version!==28||v28.authorizationGranted!==false||
  v28.execution?.mayRunSQL!==false||v28.execution?.mayDeploy!==false||
  v30.version!==30||v30.state!=="NOT_AUTHORIZED"||v30.execution?.maySendEmail!==false||
  v31.version!==31||v31.authorizationGranted!==false||v31.execution?.mayScheduleCron!==false||
  v32.version!==32||v32.authorizationGranted!==false||v32.execution?.mayDeploy!==false)
  add("SOURCE_APPROVAL_CHANGED");
 if(v29.version!==29||v29.authorization?.granted!==false||
  v29.execution?.mayRunSQL!==false||v29.execution?.mayDeploy!==false||
  v29.integration?.sqlExecuted!==false||v29.integration?.backendImplemented!==false||
  v29.acceptance?.production!=="NO_GO")
  add("V29_BACKEND_CONTRACT_CHANGED");
 if(!Array.isArray(r.evidenceManifestPaths)||r.evidenceManifestPaths.length!==5||
  !["v18","v28","v30","v31","v32"].every(k=>
   r.evidenceManifestPaths.includes(FILES[k])))add("SOURCE_LINKS_CHANGED");
 return {
  version:33,mode:"review-only-static",
  valid:problems.length===0,decision:"NO_GO",problems,checks,
  tasksTotal:tasks.length,githubReady:tasks.filter(t=>t.status==="READY_FOR_GITHUB_WORK").length,
  approvalBlocked:tasks.filter(t=>t.mode!=="github-only-no-execution").length,
  firstGithubTask:"C01",overlappingScenarioCount:92,
  liveBackendTestsVerified:0,actualAuthorization:false,mayRunSQL:false,
  mayProvision:false,mayDeploy:false,mayPublish:false,mayCharge:false,
  mayCallPaidAI:false,stagingReady:false,productionReady:false};
}
function render(result){
 return [
  "MG WEB STUDIO CLOUD — V33 PLAN MAESTRO | NO GO",
  "Inventario estático: "+(result.valid?"coherente":"inconsistente"),
  "V18 precondiciones pendientes: "+(result.checks?.v18Pending??"desconocidas"),
  "Escenarios pendientes V28/V30/V31/V32: "+
   (result.checks?["v28Unexecuted","v30Unexecuted","v31Unexecuted","v32Unexecuted"].map(k=>result.checks[k]).join(" + "):"desconocidos")+
   " (listas parcialmente superpuestas)",
  "Tareas priorizadas: "+(result.tasksTotal??"desconocidas"),
  "Siguiente sin gasto: "+(result.firstGithubTask||"revisar inventario"),
  "Problemas de validación: "+result.problems.join(", "),
  "NO GO | sin SQL, gasto, staging ni publicación."
 ].join("\n");
}
if(require.main===module){
 let assessed;
 try{assessed=assess(load());}
 catch(e){assessed={valid:false,decision:"NO_GO",problems:["REVIEW_READ_ERROR"]};}
 console.log(render(assessed));
 process.exitCode=assessed.valid?2:1;
}
module.exports={FILES,load,assess,render};
