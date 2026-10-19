"use strict";
/* V28 static fixtures, idempotency edge cases, future RLS test matrix.
 * node apps/mg-web-studio-cloud/tests/edge-cases-v28.test.cjs
 * No HTTP, SQL, actual auth or deployment.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const load=x=>fs.readFileSync(path.join(__dirname,"..",x),"utf8");
const win={};
for(const name of ["mg-contracts-v20.js","mg-tenant-security-v23.js","mg-audit-trail-v24.js",
 "mg-proposal-flow-v27.js","mg-fixture-boundaries-v28.js"])
 new Function("window",load("shared/"+name))(win);
const C=win.MGWebContractsV20,S=win.MGTenantSecurityV23,A=win.MGAuditTrailV24,
 V=win.MGProposalFlowV27,B=win.MGFixtureBoundariesV28;
const deep=x=>JSON.parse(JSON.stringify(x));
const directory=()=>({
 organizations:[{id:"orgA",status:"active"},{id:"orgB",status:"active"}],
 sites:[{id:"siteA",organizationId:"orgA",status:"draft"},
  {id:"siteB",organizationId:"orgB",status:"draft"}],
 memberships:[{id:"mA",userId:"ownerA",organizationId:"orgA",role:"CLIENT_OWNER",status:"active"},
  {id:"mB",userId:"ownerB",organizationId:"orgB",role:"CLIENT_OWNER",status:"active"},
  {id:"mE",userId:"editorA",organizationId:"orgA",role:"CLIENT_EDITOR",status:"active"}],
 scopes:[{membershipId:"mE",organizationId:"orgA",siteId:"siteA",status:"active"}],
 sessions:["staffOne","staffTwo","ownerA","ownerB","editorA"].map(x=>({
  id:"sess_"+x,userId:x,aal:"aal2",status:"active",expiresAt:50000})),
 staff:[{userId:"staffOne",role:"SUPERADMIN",status:"active"},
   {userId:"staffTwo",role:"SUPERADMIN",status:"active"}]
});
const initial=()=>({
 sites:[{id:"siteA",organizationId:"orgA",draftVersion:1,pages:[{slug:"",title:"Inicio"},{slug:"contacto",title:"Contacto"}]},
  {id:"siteB",organizationId:"orgB",draftVersion:1,pages:[{slug:"home",title:"Inicio B"}]}],
 proposals:[{id:"pr1",organizationId:"orgA",siteId:"siteA",revision:1,status:"submitted_for_review"}],
 ledger:[]
});
let count=0;const check=(label,val)=>{assert.ok(val,label);count++};
const data=directory(),state=initial(),before=JSON.stringify({data,state});
const base=B.inspectFixture(data,state,C,A);
check("V28 recognized",B.version==="28.0-review");
check("V28 baseline valid",base.valid===true);
check("V28 no GO",base.go===false&&!base.productionReady&&!base.stagingReady);
check("V28 simulation only",base.simulationOnly);
check("Counts correct",base.counts.sites===2&&base.counts.proposals===1);
check("Source fixtures not changed",JSON.stringify({data,state})===before);
const matrix=JSON.parse(load("staging/v28-backend-rls-matrix.review.json")),review=B.inspectMatrix(matrix);
check("Matrix valid structurally",review.valid);
check("30 cases",review.count===30);
check("No backend evidence",review.evidenceVerified===0&&review.sqlTestsRun===0);
check("Matrix cannot run SQL",!review.mayRunSQL&&!review.mayProvision);
check("Matrix cannot deploy or publish",!review.mayDeploy&&!review.mayPublish);
check("Matrix cannot pay",!review.mayCharge&&!review.mayCallPaidAI);
check("Matrix NO GO",review.go===false&&!review.productionReady&&!review.stagingReady);
check("All future scenarios pending",matrix.cases.every(x=>x.evidenceStatus==="NOT_EXECUTED"&&x.evidenceRef===null));
check("Previous V13 scope test included in future suite",matrix.cases.some(x=>x.id==="M15"&&x.category==="rls"));
check("No SQL syntax in matrix",!JSON.stringify(matrix).includes("CREATE TABLE"));
check("Matrix does not modify input",review.valid&&JSON.stringify(matrix)===JSON.stringify(JSON.parse(load("staging/v28-backend-rls-matrix.review.json"))));
function corruptFixture(name,change,expected){
 const d=directory(),s=initial();change(d,s);
 const r=B.inspectFixture(d,s,C,A);
 check(name+" detected",!r.valid&&r.issues.some(z=>z.code===expected));
 check(name+" remains NO GO",r.go===false);
}
const mutations=[
 ["duplicate organization",(d)=>d.organizations.push(deep(d.organizations[0])),"DUPLICATE_ORGANIZATION"],
 ["duplicate directory site",(d)=>d.sites.push(deep(d.sites[0])),"DUPLICATE_DIRECTORY_SITE"],
 ["duplicate membership",(d)=>d.memberships.push({...deep(d.memberships[0]),id:"second_mA"}),"DUPLICATE_MEMBERSHIP"],
 ["duplicate session",(d)=>d.sessions.push(deep(d.sessions[0])),"DUPLICATE_SESSION"],
 ["duplicate staff",(d)=>d.staff.push(deep(d.staff[0])),"DUPLICATE_STAFF"],
 ["duplicate snapshot site",(_d,s)=>s.sites.push(deep(s.sites[0])),"DUPLICATE_SNAPSHOT_SITE"],
 ["duplicate proposal",(_d,s)=>s.proposals.push(deep(s.proposals[0])),"DUPLICATE_PROPOSAL"],
 ["duplicate scope",(d)=>d.scopes.push(deep(d.scopes[0])),"DUPLICATE_SCOPE"],
 ["orphan site",(d)=>d.sites[0].organizationId="missing","ORPHAN_DIRECTORY_SITE"],
 ["orphan membership",(d)=>d.memberships[0].organizationId="missing","INVALID_MEMBERSHIP"],
 ["cross-org scope",(d)=>d.scopes[0].organizationId="orgB","CROSS_TENANT_SCOPE"],
 ["cross-org proposal",(_d,s)=>s.proposals[0].organizationId="orgB","CROSS_TENANT_PROPOSAL"],
 ["unknown proposal status",(_d,s)=>s.proposals[0].status="deleted","UNKNOWN_PROPOSAL_STATUS"],
 ["invalid revision",(_d,s)=>s.proposals[0].revision=0,"CROSS_TENANT_PROPOSAL"],
 ["missing home",(_d,s)=>s.sites[0].pages=[{slug:"contacto"}],"INVALID_SITE_HOME"],
 ["duplicate home",(_d,s)=>s.sites[0].pages.push({slug:"home"}),"INVALID_SITE_HOME"],
 ["orphan snapshot site",(_d,s)=>s.sites[0].organizationId="orgB","INVALID_SNAPSHOT_SITE"],
 ["invalid draft version",(_d,s)=>s.sites[0].draftVersion=0,"INVALID_SNAPSHOT_SITE"],
 ["corrupt audit",(_d,s)=>s.ledger=[{code:"x"}],"AUDIT_FIXTURE_INVALID"]
];
for(const [label,change,expected] of mutations)corruptFixture(label,change,expected);
const invalidInputs=B.inspectFixture({},state,C,A);
check("Missing directory fails closed",!invalidInputs.valid);
check("Missing directory issues",invalidInputs.issues.some(x=>x.code==="MISSING_DIRECTORY_LIST"));
check("Missing dependencies fail closed",!B.inspectFixture(null,null,null,null).valid);
function corruptMatrix(name,change,code){
 const x=deep(matrix);change(x);
 const r=B.inspectMatrix(x);
 check(name+" caught",!r.valid&&r.issues.includes(code));
 check(name+" cannot provision",r.mayProvision===false&&r.go===false);
}
const matrixMutations=[
 ["wrong branch",x=>{x.sourceBranch="main"},"MATRIX_SCOPE_INVALID"],
 ["activated approval",x=>{x.authorizationGranted=true},"MATRIX_AUTHORIZATION_FORBIDDEN"],
 ["infrastructure target",x=>{x.environment="prod"},"MATRIX_AUTHORIZATION_FORBIDDEN"],
 ["run SQL",x=>{x.execution.mayRunSQL=true},"MATRIX_EXECUTION_FORBIDDEN"],
 ["provision",x=>{x.execution.mayProvision=true},"MATRIX_EXECUTION_FORBIDDEN"],
 ["deploy",x=>{x.execution.mayDeploy=true},"MATRIX_EXECUTION_FORBIDDEN"],
 ["publish",x=>{x.execution.mayPublish=true},"MATRIX_EXECUTION_FORBIDDEN"],
 ["charge",x=>{x.execution.mayCharge=true},"MATRIX_EXECUTION_FORBIDDEN"],
 ["paid AI",x=>{x.execution.mayUsePaidAI=true},"MATRIX_EXECUTION_FORBIDDEN"],
 ["missing case",x=>{x.cases.pop()},"MATRIX_CASES_INVALID"],
 ["altered ID",x=>{x.cases[0].id="M11"},"MATRIX_CASE_NOT_PENDING_M01"],
 ["marked pass",x=>{x.cases[14].evidenceStatus="PASSED"},"MATRIX_CASE_NOT_PENDING_M15"],
 ["fabricated evidence",x=>{x.cases[3].evidenceRef="test-report"},"MATRIX_CASE_NOT_PENDING_M04"],
 ["extra test secret",x=>{x.cases[0].token="fake"},"MATRIX_CASE_NOT_PENDING_M01"],
 ["unknown category",x=>{x.cases[0].category="production"},"MATRIX_CASE_NOT_PENDING_M01"]
];
for(const [name,fn,code] of matrixMutations)corruptMatrix(name,fn,code);
check("null matrix fails",!B.inspectMatrix(null).valid);
check("all 30 matrix scenarios remain NO GO",B.inspectMatrix(matrix).go===false);
let mutableDir=directory();
const w=V.createWorkflow({directory:()=>mutableDir,contracts:C,security:S,audit:A,initial:initial()});
const request=(who,proposalId,org,site,eventId,operationId,sessionId)=>({
 action:"create",organizationId:org,siteId:site,proposalId,
 expectedRevision:0,expectedDraftVersion:1,
 trustedSession:{userId:who,sessionId:sessionId||"sess_"+who,verified:true},
 eventId,operationId,now:500
});
const key="shared-operation-9001";
const a=w.execute(request("staffOne","createA","orgA","siteA","eventA1",key));
check("Staff one create",a.ok&&a.state==="draft");
const b=w.execute({...request("staffTwo","createA2","orgA","siteA","eventA2",key),now:501});
check("Different staff same key allowed",b.ok&&b.state==="draft");
const c=w.execute({...request("staffOne","createB","orgB","siteB","eventB1",key),now:502});
check("Same staff other tenant same key allowed",c.ok&&c.state==="draft");
const latest=w.snapshot();
check("Three proposals committed",latest.proposals.length===4);
check("Three ledger entries",latest.ledger.length===3);
check("V24 audit valid after shared keys",A.validate(latest.ledger).ok);
mutableDir.sessions.push({id:"sess_staffOne_new",userId:"staffOne",aal:"aal2",status:"active",expiresAt:50000});
const rotate=w.execute({...request("staffOne","createA","orgA","siteA","eventA1",key,"sess_staffOne_new"),now:503});
check("Session rotation replay accepted",rotate.ok&&rotate.replayed);
check("Session rotation no extra audit",w.snapshot().ledger.length===3);
const conflict=w.execute({...request("staffOne","wrongA","orgA","siteA","differentId",key),now:504});
check("Same tenant actor reused key different payload denied",!conflict.ok&&conflict.code==="IDEMPOTENCY_CONFLICT");
check("Conflict recorded without mutating proposals",w.snapshot().proposals.length===4);
const noChange=w.snapshot();
mutableDir=S.mutateFixture(mutableDir,"revokeSession","sess_staffOne_new");
const revoked=w.execute({...request("staffOne","createA","orgA","siteA","event_revoked1",key,"sess_staffOne_new"),now:505});
check("Revoked newer session denied",!revoked.ok&&revoked.code==="ACCESS_DENIED");
check("Rejected replay did not change proposals",w.snapshot().proposals.length===noChange.proposals.length);
check("Reject attempt logged",w.snapshot().ledger.at(-1).outcome==="denied");
check("No network in guard",!load("shared/mg-fixture-boundaries-v28.js").includes("fetch("));
check("No database client in guard",!load("shared/mg-fixture-boundaries-v28.js").includes("supabase."));
console.log(count+" / "+count+" V28 static and in-memory edge-case checks passed. NO GO remains.");
