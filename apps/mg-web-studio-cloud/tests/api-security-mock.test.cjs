"use strict";
/* Tests API V8: node apps/mg-web-studio-cloud/tests/api-security-mock.test.cjs
   No inicia servidor, no requiere paquetes npm ni conexiones externas. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const files=["mg-persistence-simulator.js","mg-api-security-mock.js"];
const win={};
for(const file of files)vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../shared",file),"utf8"),{window:win},{timeout:2000,filename:file});
async function main(){
 let count=0;const test=(name,condition)=>{assert.equal(Boolean(condition),true,name);count++;process.stdout.write("✓ "+name+"\n");};
 const records={organizations:[{id:"c1",name:"Café Horizonte"},{id:"c2",name:"Papelería Nube"}],
 sites:[{id:"s1",clientId:"c1",name:"Café Horizonte"},{id:"s2",clientId:"c2",name:"Papelería Nube"},{id:"s3",clientId:"c1",name:"Café corporativo"}],
 members:[
 {id:"m1",userId:"u1",clientId:"c1",role:"CLIENT_OWNER",status:"Activo (demo)",scope:"all",siteIds:[]},
 {id:"m2",userId:"u2",clientId:"c1",role:"CLIENT_EDITOR",status:"Activo (demo)",scope:"selected",siteIds:["s1"]},
 {id:"m3",userId:"u3",clientId:"c2",role:"CLIENT_VIEWER",status:"Activo (demo)",scope:"selected",siteIds:["s2"]},
 {id:"m4",userId:"u4",clientId:"c2",role:"CLIENT_OWNER",status:"Activo (demo)",scope:"all",siteIds:[]},
 {id:"m5",userId:"u5",clientId:"c1",role:"CLIENT_VIEWER",status:"Revocado",scope:"selected",siteIds:["s1"]},
 {id:"m6",userId:"u6",clientId:"c1",role:"CLIENT_ADMIN",status:"Activo (demo)",scope:"all",siteIds:[]}
 ]};
 const sessions={
 owner:{userId:"u1",verified:true,aal:"aal1"},
 editor:{userId:"u2",verified:true,aal:"aal1"},
 viewer:{userId:"u3",verified:true,aal:"aal1"},
 other:{userId:"u4",verified:true,aal:"aal1"},
 revoked:{userId:"u5",verified:true,aal:"aal1"},
 admin:{userId:"u6",verified:true,aal:"aal1"},
 super:{userId:"u7",verified:true,aal:"aal2"},
 superNoMfa:{userId:"u7",verified:true,aal:"aal1"},
 unauth:{userId:"u0",verified:false,aal:"aal1"}
 };
 const draft=(title)=>({pages:[{id:"home",title}],shared:{brand:"Prueba"}});
 const repo=win.MGWebStudioPersistence.createRepository({directory:()=>records,initialDocuments:[
  {clientId:"c1",siteId:"s1",draft:draft("Inicio café")},
  {clientId:"c1",siteId:"s3",draft:draft("Inicio empresa")},
  {clientId:"c2",siteId:"s2",draft:draft("Inicio papelería")}
 ]});
 const api=win.MGWebStudioAPIMock.createMockAPI({
  directory:()=>records,repository:repo,getTrustedSession:req=>sessions[req.mockIdentity]||null,
  getStaffAccess:user=>user.userId==="u7"?{role:"SUPERADMIN"}:null
 });
 const base="/api/organizations/c1/sites/s1";
 const ask=(who,method,path,body,operationId,query)=>api.request({
  mockIdentity:who,method,path,body:body||{},operationId,query:query||{}});
 test("mock no HTTP server",api.mode==="mock-only");
 test("without session 401",(await ask("nobody","GET",base+"/draft")).status===401);
 test("unverified identity 401",(await ask("unauth","GET",base+"/draft")).status===401);
 test("staff without MFA 403",(await ask("superNoMfa","GET","/api/admin/organizations")).status===403);
 test("unprivileged user not SUPERADMIN",(await ask("owner","GET","/api/admin/organizations")).status===403);
 test("verified SUPERADMIN with MFA",(await ask("super","GET","/api/admin/organizations")).body.items.length===2);
 test("owner lists own organization",(await ask("owner","GET","/api/me/organizations")).body.items.length===1);
 test("owner not shown c2 org",(await ask("owner","GET","/api/me/organizations")).body.items[0].id==="c1");
 test("no tenant for staff with no membership",(await ask("super","GET","/api/me/organizations")).body.items.length===0);
 test("editor only assigned site",(await ask("editor","GET","/api/organizations/c1/sites")).body.items.length===1);
 test("owner sees two own sites",(await ask("owner","GET","/api/organizations/c1/sites")).body.items.length===2);
 test("viewer only own site",(await ask("viewer","GET","/api/organizations/c2/sites")).body.items.length===1);
 test("viewer cannot list c1 sites",(await ask("viewer","GET","/api/organizations/c1/sites")).status===403);
 test("editor cannot see second own tenant site",(await ask("editor","GET","/api/organizations/c1/sites/s3/draft")).status===403);
 test("owner cannot read c2 site",(await ask("owner","GET","/api/organizations/c2/sites/s2/draft")).status===403);
 test("forged org/site pair not found",(await ask("owner","GET","/api/organizations/c1/sites/s2/draft")).status===404);
 test("revoked member denied",(await ask("revoked","GET",base+"/draft")).status===403);
 test("owner reads site",(await ask("owner","GET",base+"/draft")).body.version===1);
 test("editor reads site",(await ask("editor","GET",base+"/draft")).body.ok===true);
 test("viewer reads own site",(await ask("viewer","GET","/api/organizations/c2/sites/s2/draft")).body.ok===true);
 test("viewer edit capabilities false", (await ask("viewer","GET","/api/organizations/c2/sites/s2/capabilities")).body.capabilities.edit===false);
 test("editor publish capabilities false",(await ask("editor","GET",base+"/capabilities")).body.capabilities.publish===false);
 test("owner billing capabilities true",(await ask("owner","GET",base+"/capabilities")).body.capabilities.billing===true);
 test("admin billing capabilities false",(await ask("admin","GET",base+"/capabilities")).body.capabilities.billing===false);
 const update=await ask("editor","PUT",base+"/draft",
  {expectedVersion:1,draft:draft("Nuevo inicio de Café"),role:"CLIENT_OWNER",userId:"u7"},"update-api-001");
 test("editor can save draft",update.status===200&&update.body.version===2);
 test("forged role in payload did not publish",(await ask("editor","POST",base+"/releases",{expectedVersion:2,role:"CLIENT_OWNER"},"forge-role-001")).status===403);
 test("same update operation replay",(await ask("editor","PUT",base+"/draft",
  {expectedVersion:1,draft:draft("Nuevo inicio de Café")},"update-api-001")).body.replayed===true);
 test("stale version conflict",(await ask("owner","PUT",base+"/draft",{expectedVersion:1,draft:draft("Antiguo")},"stale-api-002")).status===409);
 test("viewer write forbidden",(await ask("viewer","PUT","/api/organizations/c2/sites/s2/draft",
  {expectedVersion:1,draft:draft("Intento no permitido")},"viewer-api-001")).status===403);
 const publish=await ask("owner","POST",base+"/releases",{expectedVersion:2},"publish-api-001");
 test("owner publish",publish.status===200&&publish.body.releaseNumber===1);
 test("publish retry idempotent",(await ask("owner","POST",base+"/releases",{expectedVersion:2},"publish-api-001")).body.replayed===true);
 test("release listed once",(await ask("owner","GET",base+"/releases")).body.items.length===1);
 test("editor can read release",(await ask("editor","GET",base+"/releases")).status===200);
 test("owner can retrieve incremental events",(await ask("owner","GET",base+"/changes",null,null,{afterVersion:1})).body.items.length===2);
 test("bad event cursor",(await ask("owner","GET",base+"/changes",null,null,{afterVersion:-1})).status===400);
 test("unsupported method 405",(await ask("owner","DELETE",base+"/draft")).status===405);
 test("unsupported path 404",(await ask("owner","GET","/api/organizations/c1/secret")).status===404);
 test("site details authorized",(await ask("owner","GET",base)).body.site.id==="s1");
 test("no cache on confidential data",(await ask("owner","GET",base)).headers["Cache-Control"]==="no-store");
 records.members.find(m=>m.id==="m2").status="Revocado";
 test("revocation blocks next editor read",(await ask("editor","GET",base+"/draft")).status===403);
 test("revocation blocks next editor edit",(await ask("editor","PUT",base+"/draft",{expectedVersion:3,draft:draft("Cambio")},"after-revoke-001")).status===403);
 test("owner still reads",(await ask("owner","GET",base+"/draft")).body.version===3);
 test("server session callback ignores forged body identity",(await ask("nobody","PUT",base+"/draft",
  {userId:"u1",role:"CLIENT_OWNER",expectedVersion:3,draft:draft("Forja")},"fake-identity-001")).status===401);
 process.stdout.write("\n"+count+" pruebas del contrato API V8 correctas.\n");
 return count;
}
if(require.main===module)main().catch(err=>{console.error(err);process.exitCode=1;});
module.exports={main};
