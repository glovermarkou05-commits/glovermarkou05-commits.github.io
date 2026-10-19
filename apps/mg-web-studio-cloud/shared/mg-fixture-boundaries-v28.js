/* MG WEB STUDIO CLOUD V28 — purely static fixture and future test-matrix check.
 * NO database, HTTP, authentication, SQL, cost, deployment or real audit.
 * Passing validates a demo's internal consistency, NEVER readiness.
 */
(function(root){"use strict";
const VERSION="28.0-review",BRANCH="feature/mg-digital-v5-web-services";
const obj=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const id=x=>typeof x==="string"&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(x);
const safeInt=x=>Number.isSafeInteger(x)&&x>=1;
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const ISSUE=(code,context)=>({code,context});
function inspectFixture(directory,snapshot,contracts,audit){
 const issues=[],bad=(code,context)=>issues.push(ISSUE(code,context||null));
 if(!obj(directory)||!obj(snapshot)||!contracts||
  typeof contracts.canonicalPages!=="function"||typeof contracts.normalizedState!=="function"||
  !audit||typeof audit.validate!=="function"){
  bad("MISSING_FIXTURE_DEPENDENCY");
  return {version:VERSION,valid:false,issues,simulationOnly:true,go:false};
 }
 const wanted=["organizations","sites","memberships","scopes","sessions","staff"];
 for(const k of wanted)if(!Array.isArray(directory[k]))bad("MISSING_DIRECTORY_LIST",k);
 for(const k of ["sites","proposals","ledger"])if(!Array.isArray(snapshot[k]))bad("MISSING_SNAPSHOT_LIST",k);
 if(issues.length)return {version:VERSION,valid:false,issues,simulationOnly:true,go:false};
 const duplicates=(rows,key,code)=>{
  const seen=new Set();
  for(const row of rows){
   const keyValue=key(row);
   if(keyValue===null||keyValue===undefined||keyValue.includes("undefined"))bad("INVALID_REFERENCE",code);
   else if(seen.has(keyValue))bad(code,keyValue);
   seen.add(keyValue);
  }
 };
 duplicates(directory.organizations,x=>id(x&&x.id)?x.id:null,"DUPLICATE_ORGANIZATION");
 duplicates(directory.sites,x=>id(x&&x.id)?x.id:null,"DUPLICATE_DIRECTORY_SITE");
 duplicates(directory.memberships,x=>id(x&&x.userId)&&id(x&&x.organizationId)?
  x.userId+"|"+x.organizationId:null,"DUPLICATE_MEMBERSHIP");
 duplicates(directory.sessions,x=>id(x&&x.id)?x.id:null,"DUPLICATE_SESSION");
 duplicates(directory.staff,x=>id(x&&x.userId)?x.userId:null,"DUPLICATE_STAFF");
 duplicates(snapshot.sites,x=>id(x&&x.id)?x.id:null,"DUPLICATE_SNAPSHOT_SITE");
 duplicates(snapshot.proposals,x=>id(x&&x.id)?x.id:null,"DUPLICATE_PROPOSAL");
 duplicates(directory.scopes,x=>id(x&&x.membershipId)&&id(x&&x.siteId)?
  x.membershipId+"|"+x.siteId:null,"DUPLICATE_SCOPE");
 const organizationIds=new Set(directory.organizations.map(x=>x&&x.id));
 const directorySites=new Map();
 for(const site of directory.sites){
  if(!obj(site)||!id(site.id)||!id(site.organizationId)||
   !organizationIds.has(site.organizationId))bad("ORPHAN_DIRECTORY_SITE",site&&site.id);
  if(site&&id(site.id))directorySites.set(site.id,site.organizationId);
 }
 const memberships=new Map();
 for(const m of directory.memberships){
  if(!obj(m)||!id(m.id)||!id(m.userId)||!id(m.organizationId)||
   !organizationIds.has(m.organizationId))bad("INVALID_MEMBERSHIP",m&&m.id);
  else memberships.set(m.id,m);
 }
 for(const scope of directory.scopes){
  const member=memberships.get(scope&&scope.membershipId);
  const siteOrg=directorySites.get(scope&&scope.siteId);
  if(!member||!siteOrg||member.organizationId!==siteOrg||scope.organizationId!==siteOrg)
   bad("CROSS_TENANT_SCOPE",scope&&scope.siteId);
 }
 const sites=new Map();
 for(const site of snapshot.sites){
  if(!obj(site)||!id(site.id)||!id(site.organizationId)||
   directorySites.get(site.id)!==site.organizationId||!safeInt(site.draftVersion))
   bad("INVALID_SNAPSHOT_SITE",site&&site.id);
  else{
   sites.set(site.id,site.organizationId);
   let normalized;
   try{normalized=contracts.canonicalPages(site.pages);}catch(e){normalized={ok:false,code:"INVALID_PAGES"};}
   if(!normalized||!normalized.ok)bad("INVALID_SITE_HOME",site.id);
  }
 }
 for(const p of snapshot.proposals){
  if(!obj(p)||!id(p.id)||!safeInt(p.revision)||!id(p.siteId)||
   !id(p.organizationId)||sites.get(p.siteId)!==p.organizationId)
    bad("CROSS_TENANT_PROPOSAL",p&&p.id);
  else{
   let status;
   try{status=contracts.normalizedState(p.status)}catch(e){status={ok:false};}
   if(!status||!status.ok)bad("UNKNOWN_PROPOSAL_STATUS",p.id);
  }
 }
 let auditCheck;
 try{auditCheck=audit.validate(snapshot.ledger);}catch(e){auditCheck={ok:false};}
 if(!auditCheck||auditCheck.ok!==true)bad("AUDIT_FIXTURE_INVALID");
 return {
  version:VERSION,mode:"static-fixture-review",valid:issues.length===0,
  issues,counts:{organizations:directory.organizations.length,sites:directory.sites.length,
   proposals:snapshot.proposals.length,ledger:snapshot.ledger.length},
  simulationOnly:true,actualAuthorization:false,stagingReady:false,productionReady:false,go:false
 };
}
function inspectMatrix(matrix){
 const issues=[],bad=code=>issues.push(code);
 if(!obj(matrix)||matrix.format!=="mg-web-studio/v28-backend-rls-review"||
  matrix.version!==28||matrix.project!=="MG WEB STUDIO CLOUD"||
  matrix.sourceBranch!==BRANCH)bad("MATRIX_SCOPE_INVALID");
 if(!obj(matrix)||matrix.environment!=="none"||matrix.authorizationGranted!==false)
  bad("MATRIX_AUTHORIZATION_FORBIDDEN");
 const flags=matrix&&matrix.execution;
 if(!obj(flags)||flags.reviewOnly!==true||
  Object.keys(flags).some(k=>k!=="reviewOnly"&&flags[k]!==false)||
  !["mayRunSQL","mayProvision","mayDeploy","mayPublish","mayUsePaidAI","mayCharge"]
   .every(k=>flags[k]===false))bad("MATRIX_EXECUTION_FORBIDDEN");
 const cases=matrix&&matrix.cases;
 if(!Array.isArray(cases)||cases.length!==30)bad("MATRIX_CASES_INVALID");
 else for(let i=0;i<30;i++){
  const row=cases[i],num="M"+String(i+1).padStart(2,"0");
  if(!obj(row)||row.id!==num||typeof row.category!=="string"||
   !["workflow","authorization","rls","transaction","security","recovery","operations","compatibility","quality"].includes(row.category)||
   typeof row.objective!=="string"||row.objective.length<12||row.objective.length>180||
   row.evidenceStatus!=="NOT_EXECUTED"||row.evidenceRef!==null||
   typeof row.requiresRealEnvironment!=="boolean"||
   Object.keys(row).some(k=>!["id","category","objective","evidenceStatus","evidenceRef","requiresRealEnvironment"].includes(k)))
   bad("MATRIX_CASE_NOT_PENDING_"+num);
 }
 return {version:VERSION,valid:issues.length===0,issues,count:Array.isArray(cases)?cases.length:0,
  evidenceVerified:0,sqlTestsRun:0,mayProvision:false,mayRunSQL:false,mayDeploy:false,
  mayPublish:false,mayCallPaidAI:false,mayCharge:false,stagingReady:false,
  productionReady:false,simulationOnly:true,go:false};
}
root.MGFixtureBoundariesV28=Object.freeze({version:VERSION,inspectFixture,inspectMatrix});
})(typeof window!=="undefined"?window:globalThis);
