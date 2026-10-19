"use strict";
/* node apps/mg-web-studio-cloud/tests/integracion-paneles-v16.test.cjs
 * Dos clientes de API simulados y un motor común EN UN MISMO PROCESO.
 * No demuestra sincronización entre dispositivos ni autenticación real.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const w={};
for(const file of ["shared/mg-ai-web-assistant-demo.js","shared/mg-proposal-exchange-demo.js",
 "shared/mg-transactional-api-v14-demo.js","shared/mg-v15-recovery-demo.js",
 "shared/mg-service-adapter-v16-demo.js"])new Function("window",read(file))(w);
const db={
 organizations:[{id:"c1",status:"active",plan:"Crece"},{id:"c2",status:"active",plan:"Start"}],
 sites:[{id:"s1",clientId:"c1"},{id:"s3",clientId:"c1"},{id:"s2",clientId:"c2"}],
 members:[
  {userId:"owner1",clientId:"c1",status:"Activo (demo)",role:"CLIENT_OWNER",scope:"all",siteIds:[]},
  {userId:"editor1",clientId:"c1",status:"Activo (demo)",role:"CLIENT_EDITOR",scope:"selected",siteIds:["s1"]},
  {userId:"editor3",clientId:"c1",status:"Activo (demo)",role:"CLIENT_EDITOR",scope:"selected",siteIds:["s3"]},
  {userId:"viewer1",clientId:"c1",status:"Activo (demo)",role:"CLIENT_VIEWER",scope:"selected",siteIds:["s1"]},
  {userId:"owner2",clientId:"c2",status:"Activo (demo)",role:"CLIENT_OWNER",scope:"all",siteIds:[]}
 ],staff:[{userId:"super1",role:"SUPERADMIN",active:true}]
};
const sessions={
 staff:{userId:"super1",kind:"staff",aal:"aal2",verified:true},
 staffWeak:{userId:"super1",kind:"staff",aal:"aal1",verified:true},
 owner:{userId:"owner1",kind:"client",verified:true},
 editor:{userId:"editor1",kind:"client",verified:true},
 editor3:{userId:"editor3",kind:"client",verified:true},
 viewer:{userId:"viewer1",kind:"client",verified:true},
 other:{userId:"owner2",kind:"client",verified:true}};
const init=[
 {clientId:"c1",siteId:"s1",pages:[{name:"Inicio",slug:"",title:"Inicio café"}]},
 {clientId:"c1",siteId:"s3",pages:[{name:"Inicio",slug:"",title:"Inicio empresa"}]},
 {clientId:"c2",siteId:"s2",pages:[{name:"Inicio",slug:"",title:"Inicio papelería"}]}
];
const createEngine=extra=>w.MGWebTransactionalAPI.createTransactionalMock({
 directory:()=>db,resolveSession:req=>sessions[req.fixture]||null,
 exchange:w.MGWebProposalExchange,initialDrafts:init,...extra});
const base="/api/v1/organizations/c1/sites/s1",events=base+"/events";
let count=0;function ok(name,predicate){assert.ok(predicate,name);count++;console.log("✓ "+name);}
const makeInput=()=>w.MGAIWebAssistant.createProposal({brand:"Café Horizonte",type:"restaurante",
 style:"natural",goal:"contacto",plan:"Crece",audience:"familias y estudiantes",
 offering:"café de especialidad y meriendas artesanales"}).proposal;
async function main(){
 const shared=createEngine();
 const staff=w.MGWebStudioServiceAdapter.createDemoAdapter({api:shared,maxTraceRecords:25});
 const client=w.MGWebStudioServiceAdapter.createDemoAdapter({api:shared,maxTraceRecords:25});
 const send=(port,fixture,method,path,body,operationId,query)=>port.request({fixture,method,path,body:body||{},operationId,query});
 ok("dos adaptadores al mismo motor local",staff!==client&&staff.mode==="demo"&&client.mode==="demo");
 ok("los dos apuntan al mismo contrato",staff.version===client.version);
 ok("modo remoto bloqueado",(()=>{try{w.MGWebStudioServiceAdapter.createRemoteAdapter({});return false}catch{return true}})());
 ok("no acepta URL de backend",( ()=>{try{w.MGWebStudioServiceAdapter.createDemoAdapter({api:shared,baseUrl:"https://no.invalid"});return false}catch{return true}})());
 const generated=makeInput(),p=base+"/proposals";
 const request={proposal:generated};
 const first=await send(staff,"staff","POST",p,request,"agency-create-0001");
 ok("staff crea propuesta",first.status===201);
 const id=first.body.proposal.id,pid=p+"/"+id;
 ok("cliente ve la propuesta del mismo motor",(await send(client,"owner","GET",p)).body.items.length===1);
 ok("editor de otro sitio no ve propuestas",(await send(client,"editor3","GET",p)).status===403);
 ok("cliente otra empresa no ve propuestas",(await send(client,"other","GET",p)).status===403);
 ok("viewer del sitio sí lee",(await send(client,"viewer","GET",pid)).status===200);
 ok("solicitud con identidad falsificada falla",(await client.request({
  fixture:"owner",method:"GET",path:pid,userId:"super1",role:"SUPERADMIN"})).status===400);
 ok("MFA bajo no permite envío",(await send(staff,"staffWeak","POST",pid+"/submit",
  {expectedRevision:1},"mfa-low-0001")).status===403);
 const sent=await send(staff,"staff","POST",pid+"/submit",{expectedRevision:1},"agency-send-0001");
 ok("agencia envía a cliente",sent.status===200&&sent.body.proposal.status==="submitted");
 const notif=await send(client,"owner","GET","/api/v1/me/notifications");
 ok("cliente recibe un aviso",notif.body.unread===1);
 const n=notif.body.items[0];
 ok("editor no puede marcar aviso del dueño",(await send(client,"editor","POST",
  "/api/v1/me/notifications/"+n.id+"/read",{},"wrong-reader-001")).status===403);
 ok("cliente abre su aviso",(await send(client,"owner","POST",
  "/api/v1/me/notifications/"+n.id+"/read",{},"owner-read-0001")).status===200);
 ok("aviso de cliente marcado leido",(await send(client,"owner","GET",
  "/api/v1/me/notifications")).body.unread===0);
 ok("viewer no aprueba",(await send(client,"viewer","POST",pid+"/review",
  {expectedRevision:1,decision:"approved",note:""},"viewer-approves1")).status===403);
 const decision=await send(client,"owner","POST",pid+"/review",
  {expectedRevision:1,decision:"approved",note:""},"client-approve-001");
 ok("cliente aprueba propuesta",decision.status===200&&decision.body.proposal.status==="approved");
 ok("staff ve la decisión",(await send(staff,"staff","GET",pid)).body.proposal.status==="approved");
 const events1=await send(client,"owner","GET",events,{},null,{after:0});
 ok("cliente recibe metadatos de dos eventos",events1.body.items.length===2);
 ok("evento no contiene contenido comercial",!JSON.stringify(events1.body.items).includes("café"));
 const current=await send(client,"editor","GET",base+"/draft");
 ok("editor lee versión de borrador",current.body.draft.version===1);
 const apply=await send(client,"editor","POST",pid+"/apply",
  {expectedRevision:1,expectedDraftVersion:1},"client-apply-0001");
 ok("editor aplica únicamente al borrador",apply.status===200&&apply.body.draft.version===2);
 ok("no publica el sitio",apply.body.draft.publishedCount===0);
 const replay=await send(client,"editor","POST",pid+"/apply",
  {expectedRevision:1,expectedDraftVersion:1},"client-apply-0001");
 ok("idempotencia no duplica aplicación",replay.headers["Idempotency-Replayed"]==="true");
 ok("no duplica páginas",(await send(staff,"staff","GET",base+"/draft")).body.draft.pages.length===3);
 const changeCursor=await send(client,"owner","GET",events,{},null,{after:events1.body.nextCursor});
 ok("cursor lee solo nuevos eventos",changeCursor.body.items.length===1&&changeCursor.body.items[0].type==="applied");
 const staffTele=staff.getTelemetry(),clientTele=client.getTelemetry();
 ok("telemetría separada por adaptador",staffTele.metrics.total!==clientTele.metrics.total);
 ok("telemetría contiene permisos denegados",clientTele.metrics.denied>=3);
 ok("telemetría registra reintento",clientTele.metrics.replayed===1);
 ok("telemetría limitada a metadatos",!JSON.stringify(clientTele).includes("café")&&!JSON.stringify(clientTele).includes("offering"));
 ok("sin credenciales en telemetría",!JSON.stringify(clientTele).includes("authorization"));
 ok("auditoria de operaciones en memoria",shared.inspectForTests().operations.length===5);
 const checkpoint=w.MGWebV15Recovery.makeCheckpoint(shared.inspectForTests(),db);
 ok("checkpoint V15 compatible con V16",checkpoint.ok);
 const restoredEngine=createEngine({
  initialSnapshotForTests:checkpoint.checkpoint.state,
  validateSnapshotForTests:w.MGWebV15Recovery.validateSnapshot});
 const newClient=w.MGWebStudioServiceAdapter.createDemoAdapter({api:restoredEngine});
 ok("recupera propuesta en adaptador nuevo",(await send(newClient,"owner","GET",pid)).body.proposal.status==="applied");
 ok("recupera cursor de eventos",(await send(newClient,"owner","GET",events,{},null,{after:events1.body.nextCursor})).body.items.length===1);
 ok("recupera estado de notificaciones",(await send(newClient,"owner","GET",
  "/api/v1/me/notifications")).body.unread>=1);
 ok("no se habilita escrituras Data API",!read("shared/mg-service-adapter-v16-demo.js").includes("fetch("));
 db.members.find(m=>m.userId==="editor1").status="Revocado";
 ok("revocación deniega nuevos GET",(await send(newClient,"editor","GET",pid)).status===403);
 ok("revocación impide replay tras restore",(await send(newClient,"editor","POST",pid+"/apply",
  {expectedRevision:1,expectedDraftVersion:1},"client-apply-0001")).status===403);
 ok("superadmin aún accede al historial",(await send(newClient,"staff","GET",pid)).status===200);
 const pages=["laboratorio-api-v14.html","laboratorio-recuperacion-v15.html"];
 for(const page of pages)ok("laboratorio "+page+" usa adaptador",read(page).includes("MGWebStudioServiceAdapter.createDemoAdapter"));
 ok("SUPERADMIN mantiene enlace V15",read("prototipo.html").includes("laboratorio-recuperacion-v15.html"));
 ok("portal conserva enlace V15",read("portal-cliente.html").includes("laboratorio-recuperacion-v15.html"));
 console.log("\n"+count+" pruebas de integración de paneles V16 correctas (misma instancia de memoria).");
 return count;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
