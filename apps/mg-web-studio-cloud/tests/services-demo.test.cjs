"use strict";
// Ejecución opcional desde la raíz del repo:
// node apps/mg-web-studio-cloud/tests/services-demo.test.cjs
// No requiere paquetes npm, conexión ni backend.
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../shared/mg-web-studio-services.js"),"utf8");
const runtime={window:{}};
vm.runInNewContext(source,runtime,{filename:"mg-web-studio-services.js",timeout:2000});
const api=runtime.window.MGWebStudioServices;
let passed=0;
function test(label,callback){callback();passed++;process.stdout.write("✓ "+label+"\n");}
const data={
 organizations:[
  {id:"c1",name:"Café Horizonte (ejemplo)",plan:"Crece"},
  {id:"c2",name:"Papelería Nube (ejemplo)",plan:"Start"}
 ],
 sites:[
  {id:"s1",clientId:"c1",name:"Café Horizonte"},
  {id:"s2",clientId:"c2",name:"Papelería Nube"}
 ],
 members:[
  {id:"m1",clientId:"c1",role:"CLIENT_EDITOR",scope:"selected",siteIds:["s1"],status:"Activo (demo)"},
  {id:"m2",clientId:"c2",role:"CLIENT_OWNER",scope:"all",siteIds:[],status:"Activo (demo)"},
  {id:"m3",clientId:"c2",role:"CLIENT_VIEWER",scope:"selected",siteIds:["s2"],status:"Revocado"}
 ]
};
const svc=api.createMemoryService(()=>data);
test("módulo disponible",()=>assert.equal(api.version,"1.0.0"));
test("modo memoria",()=>assert.equal(svc.mode,"memory-demo"));
test("lista organizaciones",()=>assert.equal(svc.listOrganizations().length,2));
test("organización de ejemplo",()=>assert.equal(svc.getOrganization("c1").data.plan,"Crece"));
test("organización inválida",()=>assert.equal(svc.getOrganization("../x").ok,false));
test("organización inexistente",()=>assert.equal(svc.getOrganization("c9").ok,false));
test("sitios por organización",()=>assert.equal(svc.listSites("c1").data.length,1));
test("sitio propio",()=>assert.equal(svc.getSite("c1","s1").ok,true));
test("sitio ajeno",()=>assert.equal(svc.getSite("c1","s2").ok,false));
test("fixture disponible",()=>assert.equal(svc.getFixtureSite("s1").data.clientId,"c1"));
test("fixture inexistente",()=>assert.equal(svc.getFixtureSite("s3").ok,false));
test("editor lectura",()=>assert.equal(svc.can("m1","s1","read"),true));
test("editor edición",()=>assert.equal(svc.can("m1","s1","edit"),true));
test("editor publicación denegada",()=>assert.equal(svc.can("m1","s1","publish"),false));
test("editor no consulta otro tenant",()=>assert.equal(svc.can("m1","s2","read"),false));
test("revocado no consulta",()=>assert.equal(svc.can("m3","s2","read"),false));
test("propietario del otro tenant puede publicar",()=>assert.equal(svc.can("m2","s2","publish"),true));
test("propietario no accede otro tenant",()=>assert.equal(svc.can("m2","s1","read"),false));
test("acción inexistente denegada",()=>assert.equal(svc.can("m2","s2","drop_tables"),false));
const nav={clientId:"c1",siteId:"s1",role:"CLIENT_EDITOR",plan:"Crece",memberId:"m1"};
test("crear enlace contextual",()=>assert.equal(svc.createNavigation(nav).ok,true));
test("impedir escalar rol por enlace demo",()=>assert.equal(svc.createNavigation({...nav,role:"CLIENT_OWNER"}).ok,false));
test("impedir cambiar sitio por enlace demo",()=>assert.equal(svc.createNavigation({...nav,siteId:"s2"}).ok,false));
test("impedir alterar plan en generación demo",()=>assert.equal(svc.createNavigation({...nav,plan:"Pro"}).ok,false));
test("leer enlace generado",()=>assert.equal(svc.readNavigation(svc.createNavigation(nav).data.query).data.role,"CLIENT_EDITOR"));
test("rechazar cruce org-sitio",()=>assert.equal(svc.readNavigation("?mgdemo=c1.s2.CLIENT_OWNER").ok,false));
test("rechazar rol desconocido",()=>assert.equal(svc.readNavigation("?mgdemo=c1.s1.SUPERADMIN").ok,false));
test("rechazar plan desconocido",()=>assert.equal(svc.readNavigation("?mgdemo=c1.s1.CLIENT_OWNER&mgplan=Premium").ok,false));
test("rechazar escape inválido",()=>assert.equal(svc.readNavigation("?mgdemo=%ZZ").ok,false));
test("copia aislada",()=>{const x=svc.getOrganization("c1").data;x.name="Otro";assert.equal(svc.getOrganization("c1").data.name,"Café Horizonte (ejemplo)");});
test("actualización de estado observada",()=>{data.members[0].status="Revocado";assert.equal(svc.can("m1","s1","read"),false);});
test("actualización de plan observada",()=>{data.organizations[0].plan="Pro";assert.equal(svc.getOrganization("c1").data.plan,"Pro");});
process.stdout.write("\n"+passed+" pruebas correctas del adaptador en memoria.\n");
