"use strict";
/* V24 tests: Node local, no SQL, no server or network.
 * node apps/mg-web-studio-cloud/tests/audit-trail-v24.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=name=>fs.readFileSync(path.join(__dirname,"..",name),"utf8");
const sandbox={};
for(const name of ["shared/mg-tenant-security-v23.js","shared/mg-audit-trail-v24.js"]){
 new Function("window",read(name))(sandbox);
}
const policy=sandbox.MGTenantSecurityV23,audit=sandbox.MGAuditTrailV24;
let n=0;const t=(label,value)=>{assert.ok(value,label);n++};
const clone=x=>JSON.parse(JSON.stringify(x));
const directory={
 organizations:[{id:"orgA",status:"active"},{id:"orgB",status:"active"}],
 sites:[{id:"a1",organizationId:"orgA",status:"draft"},{id:"a2",organizationId:"orgA",status:"draft"},{id:"b1",organizationId:"orgB",status:"draft"}],
 memberships:[
  {id:"mOwnerA",userId:"ownerA",organizationId:"orgA",role:"CLIENT_OWNER",status:"active"},
  {id:"mAdminA",userId:"adminA",organizationId:"orgA",role:"CLIENT_ADMIN",status:"active"},
  {id:"mEditorA",userId:"editorA",organizationId:"orgA",role:"CLIENT_EDITOR",status:"active"},
  {id:"mViewerA",userId:"viewerA",organizationId:"orgA",role:"CLIENT_VIEWER",status:"active"},
  {id:"mOwnerB",userId:"ownerB",organizationId:"orgB",role:"CLIENT_OWNER",status:"active"},
  {id:"mRevoked",userId:"revokedA",organizationId:"orgA",role:"CLIENT_OWNER",status:"revoked"}],
 scopes:[{membershipId:"mEditorA",organizationId:"orgA",siteId:"a1",status:"active"},
  {membershipId:"mViewerA",organizationId:"orgA",siteId:"a1",status:"active"}],
 sessions:["ownerA","adminA","editorA","viewerA","ownerB","revokedA","staff","staffLow"].map(user=>({
  id:"sess_"+user,userId:user,status:"active",expiresAt:1000,aal:user==="staff"?"aal2":"aal1"
 })),
 staff:[{userId:"staff",role:"SUPERADMIN",status:"active"},{userId:"staffLow",role:"SUPERADMIN",status:"active"}]
};
const session=user=>({verified:true,userId:user,sessionId:"sess_"+user});
const intent=(action,organizationId="orgA",siteId="a1",targetId=null)=>({action,organizationId,siteId,targetId});
let events=[],time=100;
function write(who,action,org="orgA",site="a1",target=null,extra={}){
 const next=audit.record(events,policy,directory,session(who),{...intent(action,org,site,target),...extra},time++,"evt"+(events.length+1));
 if(next.ok)events=next.events;
 return next;
}
t("V24 review version",audit.version==="24.0-review");
t("demo-only mode",audit.mode==="memory-demo-only");
t("empty ledger validates",audit.validate([]).ok);
t("empty ledger is not crypto-safe",audit.validate([]).cryptographicallySecure===false);
t("no GO",audit.validate([]).go===false);
t("reject non-list ledger",audit.validate({}).code==="INVALID_LEDGER");
const first=write("ownerA","access_read");
t("record read",first.ok);
t("read authorized",first.event.outcome==="allowed");
t("actor bound to mock policy",first.event.actorId==="ownerA");
t("first sequence",first.event.sequence===1);
t("first link genesis",first.event.previousChecksum==="00000000");
t("first digest length",first.event.checksum.length===8);
t("not cryptographic",first.cryptographicallySecure===false);
const approve=write("ownerA","proposal_approved","orgA","a1","proposal1",{password:"do-not-log",token:"secret",payload:{customerEmail:"test@example.org"}});
t("proposal approved simulated",approve.ok&&approve.simulatedDecision);
t("no credential in log",!JSON.stringify(events).includes("do-not-log"));
t("no token in log",!JSON.stringify(events).includes("secret"));
t("no arbitrary payload in log",!JSON.stringify(events).includes("test@example.org"));
const editorApprove=write("editorA","proposal_approved","orgA","a1","proposal1");
t("editor approval denied but recorded",editorApprove.ok&&editorApprove.event.outcome==="denied");
t("denied actor anonymized",editorApprove.event.actorId===null);
t("denial reason preserved",editorApprove.event.reason==="ROLE_DENIED");
t("editor may apply",write("editorA","proposal_applied","orgA","a1","proposal1").simulatedDecision);
t("admin may revoke membership",write("adminA","membership_revoked","orgA","a1","member1").simulatedDecision);
t("editor cannot revoke scopes",!write("editorA","scope_revoked","orgA","a1","scope1").simulatedDecision);
t("cross-tenant owner denied",!write("ownerB","access_read","orgA","a1").simulatedDecision);
t("owner B own tenant allowed",write("ownerB","access_read","orgB","b1").simulatedDecision);
t("staff MFA mock permits admin",write("staff","admin_access",null,null).simulatedDecision);
t("staff low MFA denied",!write("staffLow","admin_access",null,null).simulatedDecision);
t("viewer read allowed",write("viewerA","access_read").simulatedDecision);
t("owner can reject proposal",write("ownerA","proposal_rejected","orgA","a1","proposal2").simulatedDecision);
t("owner can revoke scope",write("ownerA","scope_revoked","orgA","a1","scope1").simulatedDecision);
t("history has all simulated attempts",events.length===13);
t("linked ledger validates",audit.validate(events).ok);
t("checksum matches final record",audit.validate(events).checksum===events.at(-1).checksum);
t("read-only fixtures",directory.memberships.find(x=>x.id==="mEditorA").status==="active");
const snapshot=clone(events),size=events.length;
const replay=audit.record(events,policy,directory,session("ownerA"),intent("access_read"),time++,events[0].eventId);
t("duplicate event rejected",!replay.ok&&replay.code==="DUPLICATE_EVENT");
t("no mutation on duplicate",JSON.stringify(events)===JSON.stringify(snapshot));
const broken=clone(events);broken[1].action="proposal_rejected";
t("detect modified action",audit.validate(broken).code==="LEDGER_CORRUPTED");
t("reject appending to modified log",audit.record(broken,policy,directory,session("ownerA"),intent("access_read"),time++,"evt99").code==="LEDGER_CORRUPTED");
const altered=clone(events);altered[2].reason="SIMULATED_ALLOW";
t("detect forged outcome reason",audit.validate(altered).code==="LEDGER_CORRUPTED");
const deleted=clone(events);deleted.splice(2,1);
t("detect deletion",audit.validate(deleted).code==="LEDGER_CORRUPTED");
const reordered=clone(events);[reordered[0],reordered[1]]=[reordered[1],reordered[0]];
t("detect reorder",audit.validate(reordered).code==="LEDGER_CORRUPTED");
const injected=clone(events);injected[0].password="plain-secret";
t("reject extra fields in record",audit.validate(injected).code==="LEDGER_CORRUPTED");
const duplicated=clone(events);duplicated[2].eventId=duplicated[1].eventId;
t("detect duplicate id",audit.validate(duplicated).code==="LEDGER_CORRUPTED");
const tOld=audit.record(events,policy,directory,session("ownerA"),intent("access_read"),0,"evt_old");
t("retrograde time rejected",tOld.code==="INVALID_TIME");
t("time rejection doesn't mutate",events.length===size);
t("unknown action rejected",audit.record(events,policy,directory,session("ownerA"),intent("goLive"),time++,"evt_other").code==="INVALID_EVENT");
t("site must be present",audit.record(events,policy,directory,session("ownerA"),intent("access_read","orgA",null),time++,"evt_bad").code==="INVALID_SCOPE");
t("requires target for privilege changes",audit.record(events,policy,directory,session("ownerA"),intent("membership_revoked"),time++,"evt_no_target").code==="INVALID_SCOPE");
t("null policy rejected",audit.record(events,null,directory,session("ownerA"),intent("access_read"),time++,"evt_no_policy").code==="POLICY_REQUIRED");
t("engine claims real auth rejected",audit.record(events,{authorize(){return {allowed:true,authorizationIsReal:true,go:true,code:"SIMULATED_ALLOW"}}},directory,session("ownerA"),intent("access_read"),time++,"evt_fake").code==="POLICY_INVALID");
t("engine failure rejected",audit.record(events,{authorize(){throw Error("mock")}},directory,session("ownerA"),intent("access_read"),time++,"evt_throw").code==="POLICY_ERROR");
t("owner A can query own site",audit.querySite(events,policy,directory,session("ownerA"),"orgA","a1",500).ok);
const ownerItems=audit.querySite(events,policy,directory,session("ownerA"),"orgA","a1",500).items;
t("queries latest first",ownerItems[0].sequence>ownerItems.at(-1).sequence);
t("own site excludes B",ownerItems.every(x=>x.organizationId==="orgA"&&x.siteId==="a1"));
t("query includes denied events",ownerItems.some(x=>x.outcome==="denied"));
t("owner A cannot query B site",audit.querySite(events,policy,directory,session("ownerA"),"orgB","b1",500).code==="AUDIT_ACCESS_DENIED");
t("editor cannot view audit",audit.querySite(events,policy,directory,session("editorA"),"orgA","a1",500).code==="AUDIT_ACCESS_DENIED");
t("viewer cannot view audit",audit.querySite(events,policy,directory,session("viewerA"),"orgA","a1",500).code==="AUDIT_ACCESS_DENIED");
t("admin may view audit",audit.querySite(events,policy,directory,session("adminA"),"orgA","a1",500).ok);
t("staff cannot use site audit without membership",audit.querySite(events,policy,directory,session("staff"),"orgA","a1",500).code==="AUDIT_ACCESS_DENIED");
t("admin staff can query admin events",audit.queryAdmin(events,policy,directory,session("staff"),500).ok);
t("admin query only contains admin events",audit.queryAdmin(events,policy,directory,session("staff"),500).items.every(x=>x.action==="admin_access"));
t("staff without MFA blocked from admin query",audit.queryAdmin(events,policy,directory,session("staffLow"),500).code==="AUDIT_ACCESS_DENIED");
t("owner cannot query admin audit",audit.queryAdmin(events,policy,directory,session("ownerA"),500).code==="AUDIT_ACCESS_DENIED");
const revoked=policy.mutateFixture(directory,"revokeMembership","mOwnerA");
t("revoked owner loses audit access immediately in fixture",audit.querySite(events,policy,revoked,session("ownerA"),"orgA","a1",500).code==="AUDIT_ACCESS_DENIED");
const expired=audit.querySite(events,policy,directory,session("ownerA"),"orgA","a1",1000);
t("expired session loses audit access",expired.code==="AUDIT_ACCESS_DENIED");
const afterRevocation=audit.record(events,policy,revoked,session("ownerA"),intent("access_read"),time++,"evt_denied_after_revoke");
t("rejected attempt after revocation recorded",afterRevocation.ok&&afterRevocation.event.outcome==="denied");
t("immutable results are copies",afterRevocation.events.length===events.length+1&&events.length===size);
t("empty no SQL",!read("shared/mg-audit-trail-v24.js").includes("supabase."));
t("no network calls",!read("shared/mg-audit-trail-v24.js").includes("fetch("));
console.log(n+" / "+n+" V24 in-memory audit checks passed; not cryptographic and NO GO.");
