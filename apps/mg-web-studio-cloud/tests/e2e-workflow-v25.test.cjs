"use strict";
/* V25 full in-memory integration. No server, SQL, browser or network.
 * node apps/mg-web-studio-cloud/tests/e2e-workflow-v25.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const window={};
for(const f of ["shared/mg-contracts-v20.js","shared/mg-tenant-security-v23.js","shared/mg-audit-trail-v24.js","shared/mg-e2e-workflow-v25.js"])
 new Function("window",read(f))(window);
const C=window.MGWebContractsV20,S=window.MGTenantSecurityV23,A=window.MGAuditTrailV24,W=window.MGWorkflowV25;
const copy=x=>JSON.parse(JSON.stringify(x));
let count=0;const t=(label,yes)=>{assert.ok(yes,label);count++;};
let clock=100,seq=0;
const directory=()=>({
 organizations:[{id:"orgA",status:"active"},{id:"orgB",status:"active"}],
 sites:[{id:"siteA",organizationId:"orgA",status:"draft"},{id:"siteB",organizationId:"orgB",status:"draft"}],
 memberships:[{id:"mOwnerA",userId:"ownerA",organizationId:"orgA",role:"CLIENT_OWNER",status:"active"},
  {id:"mAdminA",userId:"adminA",organizationId:"orgA",role:"CLIENT_ADMIN",status:"active"},
  {id:"mEditorA",userId:"editorA",organizationId:"orgA",role:"CLIENT_EDITOR",status:"active"},
  {id:"mViewerA",userId:"viewerA",organizationId:"orgA",role:"CLIENT_VIEWER",status:"active"},
  {id:"mOwnerB",userId:"ownerB",organizationId:"orgB",role:"CLIENT_OWNER",status:"active"}],
 scopes:[{membershipId:"mEditorA",organizationId:"orgA",siteId:"siteA",status:"active"},
   {membershipId:"mViewerA",organizationId:"orgA",siteId:"siteA",status:"active"}],
 sessions:["ownerA","adminA","editorA","viewerA","ownerB","staff"].map(userId=>
  ({id:"session_"+userId,userId,status:"active",expiresAt:9999,aal:userId==="staff"?"aal2":"aal1"})),
 staff:[{userId:"staff",status:"active",role:"SUPERADMIN"}]
});
const initial=()=>({
 sites:[{id:"siteA",organizationId:"orgA",draftVersion:1,pages:[{slug:"",title:"Inicio"},{slug:"contacto",title:"Contacto"}]},
  {id:"siteB",organizationId:"orgB",draftVersion:3,pages:[{slug:"home",title:"Inicio B"}]}],
 proposals:[{id:"p1",organizationId:"orgA",siteId:"siteA",status:"submitted_for_review",revision:1},
  {id:"p2",organizationId:"orgA",siteId:"siteA",status:"submitted",revision:2},
  {id:"p3",organizationId:"orgA",siteId:"siteA",status:"approved",revision:1},
  {id:"pB",organizationId:"orgB",siteId:"siteB",status:"submitted",revision:1}],
 ledger:[]
});
const session=who=>({userId:who,sessionId:"session_"+who,verified:true});
let currentDirectory=directory();
const create=(fixture=initial())=>W.createWorkflow({directory:()=>currentDirectory,contracts:C,security:S,audit:A,initial:fixture});
const gen=(who,action,id,extra={})=>({
 trustedSession:session(who),action,organizationId:"orgA",siteId:"siteA",proposalId:id,
 expectedRevision:id==="p2"?2:1,expectedDraftVersion:1,
 operationId:"operation_"+(++seq).toString().padStart(4,"0"),
 eventId:"evt_"+seq,now:clock++,...extra
});
const checkUnchanged=(wf,req,code,label)=>{
 const before=JSON.stringify(wf.snapshot()),r=wf.execute(req);
 t(label+" rejected",!r.ok&&r.committed===false&&r.code===code);
 t(label+" atomic",JSON.stringify(wf.snapshot())===before);
 return r;
};
t("version",W.version==="25.0-review");
let input=initial(),wf=create(input);
t("mode",wf.mode==="memory-integration-only");
t("initial fixture copied",wf.snapshot().proposals.length===4);
const approve=gen("ownerA","approve","p1");
let res=wf.execute(approve);
t("approve success",res.ok&&res.state==="approved");
t("approve revision unchanged",res.revision===1);
t("first audit event committed",wf.snapshot().ledger.length===1);
t("audit permitted",wf.snapshot().ledger[0].outcome==="allowed");
t("approval doesn't publish",wf.snapshot().sites[0].draftVersion===1);
t("source input unchanged",input.proposals[0].status==="submitted_for_review"&&input.ledger.length===0);
t("canonical status saved",wf.snapshot().proposals[0].status==="approved");
t("complete ledger valid",A.validate(wf.snapshot().ledger).ok);
const redo=wf.execute({...approve,now:clock++});
t("same operation replay",redo.ok&&redo.replayed===true);
t("replay doesn't duplicate audit",wf.snapshot().ledger.length===1);
checkUnchanged(wf,{...approve,note:"changed",now:clock++},"IDEMPOTENCY_CONFLICT","changed replay payload");
checkUnchanged(wf,gen("ownerA","approve","p1"),"INVALID_TRANSITION","double approve");
const apply=gen("editorA","apply","p1");
res=wf.execute(apply);
t("editor apply approved content",res.ok&&res.state==="applied");
t("apply increments draft only once",res.draftVersion===2);
t("apply keeps proposal revision",res.revision===1);
t("Home converted to canonical",wf.snapshot().sites[0].pages[0].slug==="home");
t("Home route is /",C.pathToPage("/").slug==="home");
t("apply adds valid audit",wf.snapshot().ledger.length===2&&A.validate(wf.snapshot().ledger).ok);
t("no publication",wf.snapshot().sites[0].publishedCount===undefined);
checkUnchanged(wf,gen("editorA","apply","p1",{expectedDraftVersion:2}),"INVALID_TRANSITION","double apply");
const rejected=wf.execute(gen("ownerA","reject","p2",{note:"Faltan cambios en la portada"}));
t("reject success",rejected.ok&&rejected.state==="rejected");
t("reject audited",wf.snapshot().ledger[2].action==="proposal_rejected");
checkUnchanged(wf,gen("ownerA","approve","p2"),"INVALID_TRANSITION","approve rejected state");
checkUnchanged(wf,gen("ownerA","reject","p3",{note:"Texto suficientemente largo"}),"INVALID_TRANSITION","reject approved");
checkUnchanged(wf,gen("ownerA","apply","p3",{expectedDraftVersion:1}),"STALE_DRAFT","stale draft");
checkUnchanged(wf,gen("ownerA","apply","p3",{expectedDraftVersion:2,eventId:"evt_"+approve.eventId}),"AUDIT_FAILED","invalid duplicate audit id");
checkUnchanged(wf,gen("viewerA","apply","p3",{expectedDraftVersion:2}),"ACCESS_DENIED","viewer apply");
checkUnchanged(wf,gen("editorA","reject","p3",{note:"Texto suficientemente largo"}),"ACCESS_DENIED","editor reject");
checkUnchanged(wf,gen("ownerB","approve","p3"),"ACCESS_DENIED","cross tenant owner");
checkUnchanged(wf,gen("ownerA","approve","pB",{organizationId:"orgB",siteId:"siteB"}),"ACCESS_DENIED","cross tenant direct");
checkUnchanged(wf,gen("ownerA","approve","pB"),"PROPOSAL_NOT_FOUND","foreign proposal ID");
checkUnchanged(wf,gen("staff","approve","p3"),"ACCESS_DENIED","staff cannot inherit tenant access");
checkUnchanged(wf,gen("ownerA","approve","missing"),"PROPOSAL_NOT_FOUND","missing proposal");
checkUnchanged(wf,gen("ownerA","delete","p3"),"INVALID_REQUEST","unknown action");
checkUnchanged(wf,gen("ownerA","apply","p3",{eventId:"invalid.event"}),"INVALID_REQUEST","invalid event ID");
checkUnchanged(wf,gen("ownerA","apply","p3",{operationId:"bad"}),"INVALID_REQUEST","invalid operation ID");
checkUnchanged(wf,gen("ownerA","apply","p3",{now:-3}),"INVALID_REQUEST","invalid clock");
checkUnchanged(wf,gen("ownerA","apply","p3",{trustedSession:{...session("ownerA"),verified:false}}),"ACCESS_DENIED","unverified session");
checkUnchanged(wf,gen("ownerA","apply","p3",{trustedSession:{...session("ownerB"),sessionId:"session_ownerA"}}),"ACCESS_DENIED","session forged");
const revoked=S.mutateFixture(currentDirectory,"revokeMembership","mOwnerA");
currentDirectory=revoked;
checkUnchanged(wf,gen("ownerA","apply","p3",{expectedDraftVersion:2}),"ACCESS_DENIED","revoked membership");
checkUnchanged(wf,{...approve,now:clock++},"ACCESS_DENIED","replay after revocation");
currentDirectory=directory();
const revokedScope=S.mutateFixture(currentDirectory,"removeScope","mEditorA","siteA");
currentDirectory=revokedScope;
checkUnchanged(wf,gen("editorA","apply","p3",{expectedDraftVersion:2}),"ACCESS_DENIED","revoked site scope");
currentDirectory=directory();
const revokedSession=S.mutateFixture(currentDirectory,"revokeSession","session_ownerA");
currentDirectory=revokedSession;
checkUnchanged(wf,gen("ownerA","apply","p3",{expectedDraftVersion:2}),"ACCESS_DENIED","revoked session");
currentDirectory=directory();
const leaked=gen("editorA","apply","p3",{expectedDraftVersion:2,role:"CLIENT_OWNER",
 actor:{role:"CLIENT_OWNER",active:true},scope:{level:"all"},userId:"ownerA"});
t("browser role spoof ignored",wf.execute(leaked).ok);
t("third integration commit valid",A.validate(wf.snapshot().ledger).count===4);
t("audit reads limited by role",A.querySite(wf.snapshot().ledger,S,currentDirectory,session("editorA"),"orgA","siteA",clock).code==="AUDIT_ACCESS_DENIED");
t("owner gets only own audit",A.querySite(wf.snapshot().ledger,S,currentDirectory,session("ownerA"),"orgA","siteA",clock).items.length===4);
t("B owner cannot see A audit",A.querySite(wf.snapshot().ledger,S,currentDirectory,session("ownerB"),"orgA","siteA",clock).code==="AUDIT_ACCESS_DENIED");
t("no SQL claims",read("shared/mg-e2e-workflow-v25.js").includes("NOT a DB transaction"));
t("no network",!read("shared/mg-e2e-workflow-v25.js").includes("fetch("));
t("no supabase",!read("shared/mg-e2e-workflow-v25.js").includes("supabase."));
// Further failure modes in isolated workflows
for(const [name,pages,expected] of [
 ["missing Home",[{slug:"contacto"}],"MISSING_HOME"],
 ["duplicate Home",[{slug:""},{slug:"home"}],"DUPLICATE_SLUG"],
 ["invalid Home",[{slug:"HOME"}],"INVALID_SLUG"]]){
 const data=initial();data.sites[0].pages=pages;const separate=create(data);
 checkUnchanged(separate,gen("ownerA","apply","p3"),expected,name);
}
const badLog=initial();badLog.ledger=[{foo:1}];
let malformedLog=false;try{create(badLog)}catch(e){malformedLog=true}
t("corrupted initial audit rejected",malformedLog);
const duplicate=initial();duplicate.proposals.push(copy(duplicate.proposals[0]));
let duplicateFailure=false;try{create(duplicate)}catch(e){duplicateFailure=true}
t("duplicate proposal fixture rejected",duplicateFailure);
const siteDup=initial();siteDup.sites.push(copy(siteDup.sites[0]));
let siteDupFailure=false;try{create(siteDup)}catch(e){siteDupFailure=true}
t("duplicate site fixture rejected",siteDupFailure);
const auditBroken={...A,record(){return {ok:false,code:"SIMULATED_IO_FAILURE"}}};
const isolated=W.createWorkflow({directory:()=>currentDirectory,contracts:C,security:S,audit:auditBroken,initial:initial()});
checkUnchanged(isolated,gen("ownerA","approve","p1"),"AUDIT_FAILED","audit failure rollback");
const mismatched={...A,record(){return {ok:true,simulatedDecision:false,events:[]}}};
const isolated2=W.createWorkflow({directory:()=>currentDirectory,contracts:C,security:S,audit:mismatched,initial:initial()});
checkUnchanged(isolated2,gen("ownerA","approve","p1"),"AUDIT_FAILED","fake audit outcome rollback");
console.log(count+" / "+count+" V25 simulated integration checks passed; NO GO, no SQL/HTTP/real authentication.");
