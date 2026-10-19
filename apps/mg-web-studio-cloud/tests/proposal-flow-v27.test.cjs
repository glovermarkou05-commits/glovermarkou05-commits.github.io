"use strict";
/* V27 no backend, no SQL, no secrets, no API calls.
 * Run: node apps/mg-web-studio-cloud/tests/proposal-flow-v27.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const win={};
for(const file of ["shared/mg-contracts-v20.js","shared/mg-tenant-security-v23.js",
 "shared/mg-audit-trail-v24.js","shared/mg-proposal-flow-v27.js"])
 new Function("window",read(file))(win);
const C=win.MGWebContractsV20,S=win.MGTenantSecurityV23,A=win.MGAuditTrailV24,V=win.MGProposalFlowV27;
const clone=x=>JSON.parse(JSON.stringify(x));
let count=0,seq=0,clock=100;
const ok=(name,condition)=>{assert.ok(condition,name);count++};
const session=who=>({userId:who,sessionId:"sess_"+who,verified:true});
const dir=()=>({
 organizations:[{id:"orgA",status:"active"},{id:"orgB",status:"active"}],
 sites:[{id:"siteA",organizationId:"orgA",status:"draft"},
  {id:"siteA2",organizationId:"orgA",status:"draft"},
  {id:"siteB",organizationId:"orgB",status:"draft"}],
 memberships:[
  {id:"ownA",userId:"ownerA",organizationId:"orgA",role:"CLIENT_OWNER",status:"active"},
  {id:"admA",userId:"adminA",organizationId:"orgA",role:"CLIENT_ADMIN",status:"active"},
  {id:"edtA",userId:"editorA",organizationId:"orgA",role:"CLIENT_EDITOR",status:"active"},
  {id:"viewA",userId:"viewerA",organizationId:"orgA",role:"CLIENT_VIEWER",status:"active"},
  {id:"ownB",userId:"ownerB",organizationId:"orgB",role:"CLIENT_OWNER",status:"active"}],
 scopes:[{membershipId:"edtA",organizationId:"orgA",siteId:"siteA",status:"active"},
 {membershipId:"viewA",organizationId:"orgA",siteId:"siteA",status:"active"}],
 sessions:["ownerA","adminA","editorA","viewerA","ownerB","staff","staffLow"].map(x=>({
  id:"sess_"+x,userId:x,status:"active",expiresAt:20000,aal:x==="staff"?"aal2":"aal1"
 })),
 staff:[{userId:"staff",role:"SUPERADMIN",status:"active"},
  {userId:"staffLow",role:"SUPERADMIN",status:"active"}]
});
const seed=()=>({
 sites:[{id:"siteA",organizationId:"orgA",draftVersion:1,
   pages:[{slug:"",title:"Inicio"},{slug:"servicios",title:"Servicios"}]},
  {id:"siteA2",organizationId:"orgA",draftVersion:1,pages:[{slug:"home",title:"Inicio A2"}]},
  {id:"siteB",organizationId:"orgB",draftVersion:1,pages:[{slug:"home",title:"Inicio B"}]}],
 proposals:[],ledger:[]
});
let directory=dir(),flow=V.createWorkflow({directory:()=>directory,contracts:C,security:S,audit:A,initial:seed()});
const request=(who,action,pid="p1",extra={})=>({
 trustedSession:session(who),action,proposalId:pid,organizationId:"orgA",siteId:"siteA",
 expectedRevision:0,expectedDraftVersion:1,
 operationId:"operation-"+(++seq).toString().padStart(4,"0"),eventId:"ev"+seq,now:clock++,...extra
});
const data=()=>flow.snapshot();
const step=(name,input,to,rev)=>{
 const before=data(),r=flow.execute(input);
 ok(name+" success",r.ok&&r.committed&&r.state===to&&r.revision===rev&&!r.go&&!r.published);
 ok(name+" audit appended",data().ledger.length===before.ledger.length+1&&r.attemptLogged);
 ok(name+" audit valid",A.validate(data().ledger).ok);
 ok(name+" audit action",data().ledger.at(-1).outcome==="allowed");
 return r;
};
const denied=(name,input,code)=>{
 const before=data(),result=flow.execute(input),after=data();
 ok(name+" denied",!result.ok&&!result.committed&&result.code===code);
 ok(name+" business unchanged",JSON.stringify({...before,ledger:[]})===JSON.stringify({...after,ledger:[]}));
 ok(name+" denial recorded",result.attemptLogged===true&&after.ledger.length===before.ledger.length+1);
 ok(name+" denial no actor",after.ledger.at(-1).actorId===null&&after.ledger.at(-1).outcome==="denied");
 ok(name+" denial reason",after.ledger.at(-1).reason===code);
 ok(name+" audit validates",A.validate(after.ledger).ok);
 return result;
};
ok("V27 version",V.version==="27.0-review");
ok("all seven actions",JSON.stringify(V.actions)===JSON.stringify(["create","submit","changes","revise","approve","reject","apply"]));
ok("mode memory only",flow.mode==="memory-demo-only");
ok("no initial proposal",data().proposals.length===0);
const created=step("create",request("staff","create"),"draft",1);
ok("created new proposal only",data().proposals.length===1);
denied("second create",request("staff","create"),"PROPOSAL_EXISTS");
denied("owner forbidden create",request("ownerA","create","pOwner"),"ACCESS_DENIED");
denied("staff MFA missing",request("staffLow","create","pLow"),"ACCESS_DENIED");
denied("editor forbidden submit",request("editorA","submit"),"ACCESS_DENIED");
step("submit",request("staff","submit","p1",{expectedRevision:1}),"submitted",1);
denied("submit twice",request("staff","submit","p1",{expectedRevision:1}),"INVALID_TRANSITION");
denied("viewer change",request("viewerA","changes","p1",{expectedRevision:1,note:"Necesito un cambio."}),"ACCESS_DENIED");
denied("short note",request("editorA","changes","p1",{expectedRevision:1,note:"corta"}),"INVALID_NOTE");
step("changes",request("editorA","changes","p1",{expectedRevision:1,note:"Necesito corregir el sitio web."}),"needs_changes",1);
denied("client forbidden revise",request("ownerA","revise","p1",{expectedRevision:1}),"ACCESS_DENIED");
step("revise",request("staff","revise","p1",{expectedRevision:1}),"draft",2);
denied("stale revision",request("staff","submit","p1",{expectedRevision:1}),"STALE_REVISION");
step("resubmit",request("staff","submit","p1",{expectedRevision:2}),"submitted",2);
denied("editor approve",request("editorA","approve","p1",{expectedRevision:2}),"ACCESS_DENIED");
denied("wrong tenant",request("ownerB","approve","p1",{expectedRevision:2}),"ACCESS_DENIED");
denied("wrong site scope",request("editorA","changes","p1",{siteId:"siteA2",expectedRevision:2,note:"Revisión necesaria en la página."}),"ACCESS_DENIED");
denied("unknown proposal",request("ownerA","approve","pMissing",{expectedRevision:1}),"PROPOSAL_NOT_FOUND");
const approveReq=request("ownerA","approve","p1",{expectedRevision:2,
 note:"Extra not allowed data",password:"do-not-store-password",secret:"do-not-store-token"});
const approval=step("approve",approveReq,"approved",2);
ok("sensitive data excluded from ledger",!JSON.stringify(data().ledger).includes("do-not-store"));
const replayBefore=data(),again=flow.execute({...approveReq,now:clock++});
ok("idempotent approval replay",again.ok&&again.replayed);
ok("replay did not append event",data().ledger.length===replayBefore.ledger.length);
denied("idempotency conflict",request("ownerA","reject","p1",{operationId:approveReq.operationId,
 expectedRevision:2,note:"Rechazo la página web propuesta."}),"IDEMPOTENCY_CONFLICT");
denied("double approval",request("ownerA","approve","p1",{expectedRevision:2}),"INVALID_TRANSITION");
denied("outdated draft",request("editorA","apply","p1",{expectedRevision:2,expectedDraftVersion:0}),"STALE_DRAFT");
const applied=step("apply",request("editorA","apply","p1",{expectedRevision:2,expectedDraftVersion:1}),"applied",2);
ok("draft bumped once",applied.draftVersion===2);
ok("Home normalized",data().sites[0].pages[0].slug==="home");
ok("content not published",!("published" in data().sites[0]));
denied("double apply",request("editorA","apply","p1",{expectedRevision:2,expectedDraftVersion:2}),"INVALID_TRANSITION");
step("create rejection branch",request("staff","create","p2",{expectedRevision:0}),"draft",1);
step("submit rejection branch",request("staff","submit","p2",{expectedRevision:1}),"submitted",1);
denied("reject missing note",request("ownerA","reject","p2",{expectedRevision:1}),"INVALID_NOTE");
step("reject branch",request("adminA","reject","p2",{expectedRevision:1,note:"Este contenido no representa la marca."}),"rejected",1);
step("revise rejection",request("staff","revise","p2",{expectedRevision:1}),"draft",2);
ok("audit events ordered",data().ledger.every((x,i)=>x.sequence===i+1));
ok("V24 audit chain valid",A.validate(data().ledger).ok);
ok("V24 denial inspectible to owner",A.querySite(data().ledger,S,directory,session("ownerA"),"orgA","siteA",clock).items.some(x=>x.outcome==="denied"));
ok("Editor cannot view audit",A.querySite(data().ledger,S,directory,session("editorA"),"orgA","siteA",clock).code==="AUDIT_ACCESS_DENIED");
ok("B owner cannot view A audit",A.querySite(data().ledger,S,directory,session("ownerB"),"orgA","siteA",clock).code==="AUDIT_ACCESS_DENIED");
const revoke=S.mutateFixture(directory,"revokeMembership","ownA");directory=revoke;
denied("revoked owner",request("ownerA","approve","p2",{expectedRevision:2}),"ACCESS_DENIED");
const revokedReplay=flow.execute({...approveReq,now:clock++});
ok("replay after revocation denied",revokedReplay.code==="AUDIT_FAILED"||revokedReplay.code==="ACCESS_DENIED");
directory=dir();
const revokedScope=S.mutateFixture(directory,"removeScope","edtA","siteA");directory=revokedScope;
denied("revoked site scope",request("editorA","changes","p2",{expectedRevision:2,note:"Hay que realizar modificaciones."}),"ACCESS_DENIED");
directory=dir();
const revokedSession=S.mutateFixture(directory,"revokeSession","sess_staff");directory=revokedSession;
denied("revoked staff session",request("staff","submit","p2",{expectedRevision:2}),"ACCESS_DENIED");
directory=dir();
const other=seed(),f2=V.createWorkflow({directory:()=>directory,contracts:C,security:S,audit:A,initial:other});
const front=JSON.stringify(f2.snapshot());let unsafe=f2.execute(request("ownerA","create","hack",{actor:{role:"SUPERADMIN"},scope:{level:"all"}}));
ok("client role forgery denied",!unsafe.ok&&unsafe.code==="ACCESS_DENIED");
ok("forged client cannot create",f2.snapshot().proposals.length===0);
ok("input fixtures unchanged",JSON.stringify(other)===front);
const fakeStaff=request("staff","create","pForge",{organizationId:"orgA",siteId:"siteB",expectedRevision:0});
const foreign=f2.execute(fakeStaff);
ok("staff cannot target foreign site",!foreign.ok&&foreign.code==="SITE_NOT_FOUND");
ok("staff cross-site no proposal",f2.snapshot().proposals.length===0);
const errors=[
 ["invalid action",{action:"publish"}],
 ["missing id",{proposalId:null}],
 ["wrong event format",{eventId:"strange.event"}],
 ["bad operation id",{operationId:"short"}],
 ["bad time",{now:-1}],
 ["missing session",{trustedSession:null}]
];
for(const [name,changes] of errors){
 const before=f2.snapshot(),result=f2.execute({...request("staff","create","px"),...changes});
 ok(name+" rejects",result.code==="INVALID_REQUEST");
 ok(name+" doesn't change state",JSON.stringify(f2.snapshot())===JSON.stringify(before));
}
const initialInvalid=seed();initialInvalid.ledger=[{arbitrary:true}];
let badAudit=false;try{V.createWorkflow({directory:()=>directory,contracts:C,security:S,audit:A,initial:initialInvalid});}catch(e){badAudit=true}
ok("reject corrupted initial audit",badAudit);
const duplicate=seed();duplicate.sites.push(clone(duplicate.sites[0]));let badSite=false;
try{V.createWorkflow({directory:()=>directory,contracts:C,security:S,audit:A,initial:duplicate});}catch(e){badSite=true}
ok("reject duplicate site fixture",badSite);
const brokenAudit={...A,recordSimulatedDecision(){return {ok:false,code:"MOCK_FAILED"}}};
const fBroken=V.createWorkflow({directory:()=>directory,contracts:C,security:S,audit:brokenAudit,initial:seed()});
const beforeBroken=fBroken.snapshot(),bad=fBroken.execute(request("staff","create","pBroken"));
ok("audit failure blocks business commit",bad.code==="AUDIT_FAILED"&&!bad.committed);
ok("audit failure leaves snapshot unchanged",JSON.stringify(fBroken.snapshot())===JSON.stringify(beforeBroken));
const noHome=seed();noHome.sites[0].pages=[{slug:"contacto"}];
noHome.proposals.push({id:"pHome",organizationId:"orgA",siteId:"siteA",revision:1,status:"approved"});
const fHome=V.createWorkflow({directory:()=>directory,contracts:C,security:S,audit:A,initial:noHome});
const missing=fHome.execute(request("ownerA","apply","pHome",{expectedRevision:1}));
ok("missing Home rejects apply",missing.code==="MISSING_HOME"&&!missing.committed);
ok("missing Home failure audited",fHome.snapshot().ledger.at(-1).reason==="MISSING_HOME");
ok("no network calls",!read("shared/mg-proposal-flow-v27.js").includes("fetch("));
ok("no database calls",!read("shared/mg-proposal-flow-v27.js").includes("supabase."));
console.log(count+" / "+count+" V27 in-memory lifecycle checks passed. NO GO; no real authorization.");
