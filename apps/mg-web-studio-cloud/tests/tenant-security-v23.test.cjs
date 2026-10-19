"use strict";
/* V23 only simulates decisions in memory; no production security is verified.
 * node apps/mg-web-studio-cloud/tests/tenant-security-v23.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(base,name),"utf8");
const sandbox={};new Function("window",read("shared/mg-tenant-security-v23.js"))(sandbox);
const m=sandbox.MGTenantSecurityV23,old=JSON.parse(read("db/v13-casos-autorizacion.review.json"));
const clone=x=>JSON.parse(JSON.stringify(x));
const fixture=()=>{
 const memberships=old.members.map(x=>({id:"m_"+x.id,userId:x.id,organizationId:x.organization,role:x.role,status:x.status}));
 return {
  organizations:old.organizations.map(x=>({id:x.id,status:x.status})),
  sites:old.sites.map(x=>({id:x.id,organizationId:x.organization,status:"draft"})),
  memberships,
  scopes:old.members.flatMap(x=>x.siteIds.map(siteId=>({membershipId:"m_"+x.id,organizationId:x.organization,siteId,status:"active"}))),
  sessions:[...old.members.map(x=>({id:"sess_"+x.id,userId:x.id,status:"active",expiresAt:1000,aal:"aal1"})),
    {id:"sess_unknown",userId:"unknown",status:"active",expiresAt:1000,aal:"aal1"},
    {id:"sess_staff",userId:"staff",status:"active",expiresAt:1000,aal:"aal2"},
    {id:"sess_staffLow",userId:"staffLow",status:"active",expiresAt:1000,aal:"aal1"}],
  staff:[{userId:"staff",role:"SUPERADMIN",status:"active"},{userId:"staffLow",role:"SUPERADMIN",status:"active"}]
 };
};
const session=user=>({verified:true,userId:user,sessionId:"sess_"+user});
const req=(org,site,action,extra={})=>({organizationId:org,siteId:site,action,...extra});
const check=(name,predicate)=>{assert.ok(predicate,name);count++};
let count=0;
const d=fixture(),now=100;
check("V23 demo only",m.mode==="demo-only");
check("No real production security",m.authorize(d,session("ownerA"),req("a","a1","read"),now).authorizationIsReal===false);
check("No GO in decisions",m.authorize(d,session("ownerA"),req("a","a1","read"),now).go===false);
for(const [user,site,action,expected] of old.cases){
 const target=d.sites.find(x=>x.id===site);
 const org=target?target.organizationId:"a";
 const result=m.authorize(d,session(user),req(org,site,action),now);
 check("V13 matrix "+user+" "+site+" "+action,result.allowed===expected);
}
const allowed=(who,org,site,action,data=d,time=now,context=session(who))=>
 m.authorize(data,context,req(org,site,action),time).allowed;
check("Owner can't read B",!allowed("ownerA","b","b1","read"));
check("Wrong org-site pair rejected",!allowed("ownerA","a","b1","read"));
check("Viewer cannot apply proposal",!allowed("viewerA1","a","a1","proposalApply"));
check("Editor can request changes",allowed("editorA1","a","a1","proposalChanges"));
check("Editor can apply to draft",allowed("editorA1","a","a1","proposalApply"));
check("Editor cannot approve",!allowed("editorA1","a","a1","proposalApprove"));
check("Editor cannot reject",!allowed("editorA1","a","a1","proposalReject"));
check("Owner can approve",allowed("ownerA","a","a1","proposalApprove"));
check("Client cannot acquire staff role",!m.authorize(d,session("ownerA"),{action:"adminRead"},now).allowed);
check("Staff AAL2 allowed in simulated staff action",m.authorize(d,session("staff"),{action:"adminRead"},now).allowed);
check("Staff without MFA denied",!m.authorize(d,session("staffLow"),{action:"adminRead"},now).allowed);
check("Staff has no implicit tenant membership",!allowed("staff","a","a1","read"));
check("Client cannot forge publish permission",!m.authorize(d,session("editorA1"),req("a","a1","publish",{role:"CLIENT_OWNER",userId:"ownerA",siteIds:["a1","a2"]}),now).allowed);
check("No trusted session",!m.authorize(d,null,req("a","a1","read"),now).allowed);
check("Unverified session",!m.authorize(d,{...session("ownerA"),verified:false},req("a","a1","read"),now).allowed);
check("Forged session ownership",!m.authorize(d,{verified:true,userId:"ownerB",sessionId:"sess_ownerA"},req("a","a1","read"),now).allowed);
check("Expired session",!allowed("ownerA","a","a1","read",d,1000));
check("Not expired yet",allowed("ownerA","a","a1","read",d,999));
check("Unknown action denied",!allowed("ownerA","a","a1","delete"));
check("Malformed context denied",!m.authorize({},session("ownerA"),req("a","a1","read"),now).allowed);
check("Invalid clock denied",!m.authorize(d,session("ownerA"),req("a","a1","read"),NaN).allowed);
const memRevoked=m.mutateFixture(d,"revokeMembership","m_editorA1");
check("Membership revocation fixture created",!!memRevoked);
check("Revoked member denied without logout",!allowed("editorA1","a","a1","read",memRevoked));
check("Source membership remains active",allowed("editorA1","a","a1","read"));
const sesRevoked=m.mutateFixture(d,"revokeSession","sess_ownerA");
check("Session revocation denies immediately in fixture",!allowed("ownerA","a","a1","read",sesRevoked));
const scopeRemoved=m.mutateFixture(d,"removeScope","m_editorA1","a1");
check("Site scope removed",!allowed("editorA1","a","a1","read",scopeRemoved));
check("Other editor unaffected",allowed("editorA2","a","a2","read",scopeRemoved));
check("Tenant listing filters editor",JSON.stringify(m.visibleSites(d,session("editorA1"),"a",now))==='["a1"]');
check("Tenant listing filters owner",JSON.stringify(m.visibleSites(d,session("ownerA"),"a",now))==='["a1","a2"]');
check("Tenant listing excludes foreign org",m.visibleSites(d,session("ownerA"),"b",now).length===0);
const event={recipientUserId:"editorA1",organizationId:"a",siteId:"a1"};
check("Realtime event routed to recipient",m.mayDeliver(d,session("editorA1"),event,now).allowed);
check("Realtime event wrong recipient denied",!m.mayDeliver(d,session("editorA2"),event,now).allowed);
check("Realtime after member revocation denied",!m.mayDeliver(memRevoked,session("editorA1"),event,now).allowed);
check("Realtime after scope removal denied",!m.mayDeliver(scopeRemoved,session("editorA1"),event,now).allowed);
const duplicated=clone(d);duplicated.memberships.push(clone(duplicated.memberships[0]));
check("Ambiguous duplicate membership fails closed",!allowed("ownerA","a","a1","read",duplicated));
const duplicateScope=clone(d);duplicateScope.scopes.push(clone(duplicateScope.scopes[0]));
check("Ambiguous duplicate scope fails closed",!allowed("editorA1","a","a1","read",duplicateScope));
const crossScope=clone(d);crossScope.scopes[0].organizationId="b";
check("Scope from wrong org not accepted",!allowed("editorA1","a","a1","read",crossScope));
const suspended=clone(d);suspended.sites.find(x=>x.id==="a1").status="suspended";
check("Suspended site rejected",!allowed("ownerA","a","a1","read",suspended));
check("Suspended organization rejected",!allowed("ownerSuspended","suspended","s1","read"));
const dual=clone(d);
dual.memberships.push({id:"m_dualB",userId:"ownerA",organizationId:"b",role:"CLIENT_VIEWER",status:"active"});
dual.scopes.push({membershipId:"m_dualB",organizationId:"b",siteId:"b1",status:"active"});
check("Same user can read separately granted B",allowed("ownerA","b","b1","read",dual));
check("B view role does not inherit A owner publish",!allowed("ownerA","b","b1","publish",dual));
check("A owner permissions remain in A",allowed("ownerA","a","a1","publish",dual));
check("Invalid fixture mutation is inert",m.mutateFixture(d,"grantAll","m_ownerA")===null);
check("Unsupported scope removal is inert",m.mutateFixture(d,"removeScope","m_ownerA","b1")===null);
check("No mutation of source",d.memberships.some(x=>x.id==="m_editorA1"&&x.status==="active")&&d.scopes.some(x=>x.membershipId==="m_editorA1"&&x.status==="active"));
check("No outbound fetch",!read("shared/mg-tenant-security-v23.js").includes("fetch("));
check("No direct database client",!read("shared/mg-tenant-security-v23.js").includes("supabase."));
console.log(count+" / "+count+" V23 simulated permission checks passed. No PostgreSQL or real authentication.");
