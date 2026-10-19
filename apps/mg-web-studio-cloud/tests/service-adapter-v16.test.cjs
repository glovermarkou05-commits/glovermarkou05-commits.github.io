"use strict";
/* node apps/mg-web-studio-cloud/tests/service-adapter-v16.test.cjs
 * Sin servidores, red, tokens, Supabase ni cuentas reales.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=f=>fs.readFileSync(path.join(root,f),"utf8");
const win={};for(const f of ["shared/mg-ai-web-assistant-demo.js","shared/mg-proposal-exchange-demo.js",
 "shared/mg-transactional-api-v14-demo.js","shared/mg-service-adapter-v16-demo.js"])
 new Function("window",read(f))(win);
const members=[
 {userId:"owner1",clientId:"c1",role:"CLIENT_OWNER",status:"Activo (demo)",scope:"all",siteIds:[]},
 {userId:"editor1",clientId:"c1",role:"CLIENT_EDITOR",status:"Activo (demo)",scope:"selected",siteIds:["s1"]},
 {userId:"editor3",clientId:"c1",role:"CLIENT_EDITOR",status:"Activo (demo)",scope:"selected",siteIds:["s3"]},
 {userId:"viewer1",clientId:"c1",role:"CLIENT_VIEWER",status:"Activo (demo)",scope:"selected",siteIds:["s1"]},
 {userId:"owner2",clientId:"c2",role:"CLIENT_OWNER",status:"Activo (demo)",scope:"all",siteIds:[]}
];
const directory={organizations:[{id:"c1",status:"active",plan:"Crece"},{id:"c2",status:"active",plan:"Start"}],
 sites:[{id:"s1",clientId:"c1"},{id:"s3",clientId:"c1"},{id:"s2",clientId:"c2"}],
 members,staff:[{userId:"super1",role:"SUPERADMIN",active:true}]};
const sessions={
 super:{verified:true,userId:"super1",kind:"staff",aal:"aal2"},
 weak:{verified:true,userId:"super1",kind:"staff",aal:"aal1"},
 owner:{verified:true,userId:"owner1",kind:"client"},
 editor:{verified:true,userId:"editor1",kind:"client"},
 editor3:{verified:true,userId:"editor3",kind:"client"},
 viewer:{verified:true,userId:"viewer1",kind:"client"},
 other:{verified:true,userId:"owner2",kind:"client"}};
const api=win.MGWebTransactionalAPI.createTransactionalMock({
 directory:()=>directory,resolveSession:req=>sessions[req.fixture]||null,
 exchange:win.MGWebProposalExchange,
 initialDrafts:[{clientId:"c1",siteId:"s1",pages:[{slug:"",name:"Inicio",title:"Ejemplo"}]},
  {clientId:"c1",siteId:"s3",pages:[{slug:"",name:"Inicio",title:"Otro"}]},
  {clientId:"c2",siteId:"s2",pages:[{slug:"",name:"Inicio",title:"Tienda"}]}]
});
const adapter=win.MGWebStudioServiceAdapter.createDemoAdapter({api,maxTraceRecords:7});
const base="/api/v1/organizations/c1/sites/s1";
let total=0;const check=(n,yes)=>{assert.ok(yes,n);total++;console.log("✓ "+n);};
const call=(fixture,method,path,body,operationId,query)=>adapter.request({
 fixture,method,path,body:body||{},operationId,query});
function expectThrow(fn){try{fn();return false;}catch(e){return true;}}
async function main(){
 check("adapter V16 local",adapter.version==="16.0-demo"&&adapter.mode==="demo");
 check("solo laboratorio aceptado",adapter.getTelemetry().mode==="demo");
 check("modo remoto deshabilitado",expectThrow(()=>win.MGWebStudioServiceAdapter.createRemoteAdapter({url:"https://example.invalid"})));
 check("opción remote rechazada",expectThrow(()=>win.MGWebStudioServiceAdapter.createDemoAdapter({api,mode:"remote"})));
 check("API real/externa rechazada",expectThrow(()=>win.MGWebStudioServiceAdapter.createDemoAdapter({api:{mode:"remote",request:()=>{}}})));
 check("no acepta URL externa",expectThrow(()=>win.MGWebStudioServiceAdapter.createDemoAdapter({api,baseUrl:"https://x.invalid"})));
 check("no acepta token",expectThrow(()=>win.MGWebStudioServiceAdapter.createDemoAdapter({api,token:"demo-secret"})));
 check("no acepta headers",expectThrow(()=>win.MGWebStudioServiceAdapter.createDemoAdapter({api,headers:{Authorization:"Bearer demo"}})));
 check("no acepta fetch",expectThrow(()=>win.MGWebStudioServiceAdapter.createDemoAdapter({api,fetch:()=>{}})));
 check("máximo de trazas validado",expectThrow(()=>win.MGWebStudioServiceAdapter.createDemoAdapter({api,maxTraceRecords:1000})));
 check("trazas vacías al inicio",adapter.getTelemetry().metrics.total===0);
 check("ruta válida de lectura",(await call("owner","GET",base+"/draft")).status===200);
 check("sin consulta de red",(await call("owner","GET","https://example.invalid")).status===400);
 check("URL con query incrustada rechazada",(await call("owner","GET",base+"/draft?limit=1")).status===400);
 check("sin rutas fuera del contrato",(await call("owner","GET","/api/v1/private/users")).status===400);
 check("método desconocido rechazado",(await call("owner","DELETE",base+"/draft")).status===400);
 check("marca no-cache",(await call("owner","GET",base+"/draft")).headers["Cache-Control"]==="no-store");
 check("método normalizado",(await call("owner","get",base+"/draft")).status===200);
 check("no roles inyectados",(await adapter.request({fixture:"owner",method:"GET",path:base+"/draft",role:"SUPERADMIN"})).status===400);
 check("no identidad inyectada",(await adapter.request({fixture:"owner",method:"GET",path:base+"/draft",userId:"super1"})).status===400);
 check("rechaza credenciales inyectadas",(await adapter.request({fixture:"owner",method:"GET",path:base+"/draft",accessToken:"secreto"})).status===400);
 check("rechaza query desconocido",(await call("owner","GET",base+"/events",null,null,{tenant:"c2"})).status===400);
 check("requiere operación id",(await call("super","POST",base+"/proposals",{})).status===400);
 check("cuerpo primitivo rechazado",(await adapter.request({fixture:"super",method:"POST",path:base+"/proposals",
  body:"texto",operationId:"valid-op-1000"})).status===400);
 check("sin sesión obtiene 401",(await call("nobody","GET",base+"/draft")).status===401);
 check("otro negocio obtiene 403",(await call("other","GET",base+"/draft")).status===403);
 check("otro sitio mismo negocio obtiene 403",(await call("editor3","GET",base+"/draft")).status===403);
 check("viewer sí lee",(await call("viewer","GET",base+"/draft")).status===200);
 const proposal=win.MGAIWebAssistant.createProposal({brand:"Café Horizonte",type:"restaurante",
  style:"natural",goal:"contacto",plan:"Crece",offering:"cafetería artesanal y postres",
  audience:"familias y estudiantes"}).proposal;
 check("MFA requerido", (await call("weak","POST",base+"/proposals",{proposal},"api-create-weak-001")).status===403);
 const created=await call("super","POST",base+"/proposals",{proposal},"api-create-super-001");
 check("crea propuesta",created.status===201);
 const pid=created.body.proposal.id;
 check("consulta lista",(await call("owner","GET",base+"/proposals")).body.items.length===1);
 check("consulta detalle",(await call("owner","GET",base+"/proposals/"+pid)).body.proposal.id===pid);
 check("replay sigue idempotente",(await call("super","POST",base+"/proposals",{proposal},"api-create-super-001")).headers["Idempotency-Replayed"]==="true");
 check("no duplica propuesta",api.inspectForTests().proposals.length===1);
 check("outbox restringido",(await call("owner","GET","/api/v1/admin/outbox")).status===403);
 check("outbox super",(await call("super","GET","/api/v1/admin/outbox")).status===200);
 check("envío de propuesta",(await call("super","POST",base+"/proposals/"+pid+"/submit",
  {expectedRevision:1},"api-submit-super-001")).status===200);
 check("eventos lectura paginada",(await call("owner","GET",base+"/events",{},null,{after:0})).body.items.length===1);
 check("notificaciones propias",(await call("owner","GET","/api/v1/me/notifications")).body.unread===1);
 const note=(await call("owner","GET","/api/v1/me/notifications")).body.items[0].id;
 check("marca lectura propia",(await call("owner","POST","/api/v1/me/notifications/"+note+"/read",{},
  "api-read-owner-0001")).status===200);
 check("viewer no aprueba",(await call("viewer","POST",base+"/proposals/"+pid+"/review",
  {expectedRevision:1,decision:"approved",note:""},"api-approve-viewer-001")).status===403);
 check("propietario aprueba",(await call("owner","POST",base+"/proposals/"+pid+"/review",
  {expectedRevision:1,decision:"approved",note:""},"api-approve-owner-001")).status===200);
 check("editor aplica borrador",(await call("editor","POST",base+"/proposals/"+pid+"/apply",
  {expectedRevision:1,expectedDraftVersion:1},"api-apply-editor-001")).status===200);
 check("sin publicar",(await call("owner","GET",base+"/draft")).body.draft.publishedCount===0);
 check("se puede leer trazas",adapter.getTelemetry().events.length===7);
 check("trazas circulares con límite 7",adapter.getTelemetry().events.length<=7);
 const trace=JSON.stringify(adapter.getTelemetry());
 check("trazas sin nombres reales de usuario",!trace.includes("owner1")&&!trace.includes("super1"));
 check("trazas sin empresa/sitio",!trace.includes("c1")&&!trace.includes("s1"));
 check("trazas sin datos de propuesta",!trace.includes("Café Horizonte")&&!trace.includes("cafetería"));
 check("trazas sin clave operación",!trace.includes("api-create-super"));
 check("métricas incluyen idempotencia",adapter.getTelemetry().metrics.replayed>=1);
 check("métricas registran denegados",adapter.getTelemetry().metrics.denied>=3);
 const countBefore=adapter.getTelemetry().metrics.total;
 const copy=adapter.getTelemetry();copy.metrics.total=999;copy.events[0].code="HACK";
 check("telemetría devuelta por copia",adapter.getTelemetry().metrics.total===countBefore);
 adapter.clearTelemetry();check("borrar métricas no modifica datos",adapter.getTelemetry().metrics.total===0&&api.inspectForTests().proposals.length===1);
 const throwApi={mode:"transactional-memory-mock",request:()=>{throw new Error("password-demo-secret");}};
 const fault=win.MGWebStudioServiceAdapter.createDemoAdapter({api:throwApi});
 const thrown=await fault.request({fixture:"owner",method:"GET",path:base+"/draft"});
 check("error de transporte normalizado",thrown.status===503&&thrown.body.error.code==="DEMO_UNAVAILABLE");
 check("error no filtra mensaje privado",!JSON.stringify(thrown).includes("password-demo-secret"));
 check("traza de transporte sin secretos",fault.getTelemetry().metrics.transportFaults===1);
 const malformedApi={mode:"transactional-memory-mock",request:()=>({status:200,body:"not object"})};
 const bad=win.MGWebStudioServiceAdapter.createDemoAdapter({api:malformedApi});
 check("respuesta incompatible es 502",(await bad.request({fixture:"owner",method:"GET",path:base+"/draft"})).status===502);
 check("sin fetch externo en adaptador",!read("shared/mg-service-adapter-v16-demo.js").includes("fetch("));
 console.log("\n"+total+" pruebas del adaptador V16 correctas.");
 return total;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
