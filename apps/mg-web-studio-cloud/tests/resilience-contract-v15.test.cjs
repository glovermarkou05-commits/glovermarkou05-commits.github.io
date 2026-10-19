"use strict";
/* node apps/mg-web-studio-cloud/tests/resilience-contract-v15.test.cjs
 * Solo tests de memoria, snapshots ficticios. NO backend, backups ni autenticación real.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=f=>fs.readFileSync(path.join(root,f),"utf8");
const win={};for(const p of ["shared/mg-ai-web-assistant-demo.js","shared/mg-proposal-exchange-demo.js",
 "shared/mg-transactional-api-v14-demo.js","shared/mg-v15-recovery-demo.js"])
 new Function("window",read(p))(win);
const directory={
 organizations:[{id:"c1",name:"Café Horizonte",plan:"Crece",status:"active"},
  {id:"c2",name:"Papelería Nube",plan:"Start",status:"active"}],
 sites:[{id:"s1",clientId:"c1"},{id:"s3",clientId:"c1"},{id:"s2",clientId:"c2"}],
 members:[
  {userId:"owner1",clientId:"c1",role:"CLIENT_OWNER",status:"Activo (demo)",scope:"all",siteIds:[]},
  {userId:"editor1",clientId:"c1",role:"CLIENT_EDITOR",status:"Activo (demo)",scope:"selected",siteIds:["s1"]},
  {userId:"editor3",clientId:"c1",role:"CLIENT_EDITOR",status:"Activo (demo)",scope:"selected",siteIds:["s3"]},
  {userId:"viewer1",clientId:"c1",role:"CLIENT_VIEWER",status:"Activo (demo)",scope:"selected",siteIds:["s1"]},
  {userId:"owner2",clientId:"c2",role:"CLIENT_OWNER",status:"Activo (demo)",scope:"all",siteIds:[]}
 ],staff:[{userId:"super1",role:"SUPERADMIN",active:true}]
};
const sessions={
 super:{verified:true,kind:"staff",userId:"super1",aal:"aal2"},
 lowmfa:{verified:true,kind:"staff",userId:"super1",aal:"aal1"},
 owner:{verified:true,kind:"client",userId:"owner1"},
 editor:{verified:true,kind:"client",userId:"editor1"},
 editor3:{verified:true,kind:"client",userId:"editor3"},
 viewer:{verified:true,kind:"client",userId:"viewer1"},
 other:{verified:true,kind:"client",userId:"owner2"}
};
const make=extra=>win.MGWebTransactionalAPI.createTransactionalMock({
 directory:()=>directory,resolveSession:r=>sessions[r.fixture]||null,
 exchange:win.MGWebProposalExchange,initialDrafts:[
 {clientId:"c1",siteId:"s1",pages:[{slug:"",name:"Inicio",title:"Café de ejemplo"}]},
 {clientId:"c1",siteId:"s3",pages:[{slug:"",name:"Inicio",title:"Otro sitio"}]},
 {clientId:"c2",siteId:"s2",pages:[{slug:"",name:"Inicio",title:"Papelería de ejemplo"}]}],...extra
});
const template=(name,plan="Crece")=>win.MGAIWebAssistant.createProposal({
 type:plan==="Start"?"tienda":"restaurante",style:"natural",goal:"contacto",plan,
 brand:name,offering:"productos ficticios y servicios para visitantes",
 audience:"familias, estudiantes y profesionales"
}).proposal;
const base="/api/v1/organizations/c1/sites/s1",events=base+"/events";
const req=(api,who,method,path,body,opId,query)=>api.request({
 fixture:who,method,path,body:body||{},operationId:opId,query:query||{}});
let passed=0;const check=(label,ok)=>{assert.ok(ok,label);passed++;console.log("✓ "+label);};
async function main(){
 const recover=win.MGWebV15Recovery;
 const failure=new Set(["fail-create-0001","fail-send-00001","fail-apply-0001"]);
 const api=make({beforeCommitForTests:arg=>{
  if(failure.has(arg.operationId)){failure.delete(arg.operationId);return true;}
  return false;
 }});
 check("modo V15 aislado",recover.mode==="offline-test-only");
 check("checksum local disponible",/^[0-9a-f]{8}$/.test(recover.fingerprint({foo:"bar"})));
 check("checksum estable al reordenar keys",recover.fingerprint({a:1,b:2})===recover.fingerprint({b:2,a:1}));
 check("snapshot inicial válido",recover.validateSnapshot(api.inspectForTests(),directory).ok);
 const initial=recover.makeCheckpoint(api.inspectForTests(),directory);
 check("checkpoint inicial creado",initial.ok);
 check("checkpoint usa etiqueta test",initial.checkpoint.format==="mg-web-studio/v15-memory-checkpoint");
 check("checkpoint inicial inspeccionable",recover.inspectCheckpoint(initial.checkpoint,directory).ok);
 check("datos protegidos por copia",(()=>{const obj=initial.checkpoint.state;obj.drafts[0].pages[0].title="Texto cambiado en checkpoint";return api.inspectForTests().drafts[0].pages[0].title==="Café de ejemplo"})());
 const proposal=template("Café Horizonte");
 const createPath=base+"/proposals";
 const createFirst=await req(api,"super","POST",createPath,{proposal},"fail-create-0001");
 check("falla simulada antes de confirmar",createFirst.status===503);
 check("fallo no crea propuesta",api.inspectForTests().proposals.length===0);
 check("fallo no deja idempotencia",api.inspectForTests().operations.length===0);
 check("fallo no incrementa contador",api.inspectForTests().counter.proposal===0);
 const createRetry=await req(api,"super","POST",createPath,{proposal},"fail-create-0001");
 check("reintento de fallo crea UNA propuesta",createRetry.status===201);
 check("primer id tras rollback",createRetry.body.proposal.id==="p1");
 check("tercer intento reconocido",(await req(api,"super","POST",createPath,{proposal},"fail-create-0001")).headers["Idempotency-Replayed"]==="true");
 check("sin propuestas duplicadas",api.inspectForTests().proposals.length===1);
 const pid=createRetry.body.proposal.id,proposalPath=createPath+"/"+pid;
 const failedSend=await req(api,"super","POST",proposalPath+"/submit",{expectedRevision:1},"fail-send-00001");
 check("enviar falla antes de commit",failedSend.status===503);
 check("estado permanece draft",(await req(api,"owner","GET",proposalPath)).body.proposal.status==="draft");
 check("sin avisos ni eventos del envío fallido",api.inspectForTests().outbox.length===0&&api.inspectForTests().notifications.length===0);
 const sent=await req(api,"super","POST",proposalPath+"/submit",{expectedRevision:1},"fail-send-00001");
 check("envío recuperado",sent.status===200&&sent.body.proposal.status==="submitted");
 const readEvents=await req(api,"owner","GET",events);
 check("cursor consulta eventos",readEvents.status===200&&readEvents.body.items.length===1);
 check("sin payload privado en eventos",!JSON.stringify(readEvents.body.items).includes("oferta")&&
  !JSON.stringify(readEvents.body.items).includes("proposal_json"));
 check("cursor avanza",readEvents.body.nextCursor===readEvents.body.items[0].sequence);
 check("cursor vacío al repetir",(await req(api,"owner","GET",events,null,null,{after:readEvents.body.nextCursor})).body.items.length===0);
 check("cursor negativo inválido",(await req(api,"owner","GET",events,null,null,{after:-1})).status===400);
 check("cursor decimal inválido",(await req(api,"owner","GET",events,null,null,{after:"2.4"})).status===400);
 check("no POST en eventos",(await req(api,"owner","POST",events,{},"post-events-0001")).status===405);
 check("otro negocio no ve eventos",(await req(api,"other","GET",events)).status===403);
 check("otro sitio mismo negocio no ve eventos",(await req(api,"editor3","GET",events)).status===403);
 check("viewer sitio propio puede leer metadatos",(await req(api,"viewer","GET",events)).body.items.length===1);
 check("staff sin MFA no lee eventos",(await req(api,"lowmfa","GET",events)).status===403);
 const checkpointA=recover.makeCheckpoint(api.inspectForTests(),directory);
 check("checkpoint con notificaciones",checkpointA.ok&&checkpointA.summary.notifications>=2);
 check("checkpoint con outbox",checkpointA.summary.outbox===1);
 const clone=JSON.parse(JSON.stringify(checkpointA.checkpoint));
 check("checksum sobre snapshot intacto",recover.inspectCheckpoint(clone,directory).ok);
 const temp=JSON.parse(JSON.stringify(checkpointA.checkpoint));temp.state.proposals[0].status="approved";
 check("tamper de status detectado",!recover.inspectCheckpoint(temp,directory).ok);
 const destroyed=JSON.parse(JSON.stringify(checkpointA.checkpoint));destroyed.state.counter.event=0;
 check("contador corrupto detectado",!recover.inspectCheckpoint(destroyed,directory).ok);
 function checkMutation(name,mutation){
  const altered=JSON.parse(JSON.stringify(checkpointA.checkpoint.state));
  mutation(altered);
  check(name,!recover.validateSnapshot(altered,directory).ok);
 }
 checkMutation("rechaza propuesta apuntando a otra empresa",s=>{s.proposals[0].clientId="c2";});
 checkMutation("rechaza sitio inexistente",s=>{s.proposals[0].siteId="wrong";});
 checkMutation("rechaza revisión faltante",s=>{s.revisions=[];});
 checkMutation("rechaza revisión con contenido distinto",s=>{s.revisions[0].proposal.businessName="Modificada";});
 checkMutation("rechaza revisión duplicada",s=>{s.revisions.push(JSON.parse(JSON.stringify(s.revisions[0])));});
 checkMutation("rechaza notificación duplicada",s=>{s.notifications.push(JSON.parse(JSON.stringify(s.notifications[0])));});
 checkMutation("rechaza evento sin propuesta",s=>{s.outbox[0].proposalId="p99";});
 checkMutation("rechaza outbox duplicado",s=>{s.outbox.push(JSON.parse(JSON.stringify(s.outbox[0])));});
 checkMutation("rechaza operación inválida",s=>{s.operations[0].response.status=500;});
 checkMutation("rechaza operaciones duplicadas",s=>{s.operations.push(JSON.parse(JSON.stringify(s.operations[0])));});
 checkMutation("rechaza borrador sin Home",s=>{s.drafts[0].pages=[{slug:"contacto",title:"Contacto"}];});
 checkMutation("rechaza página duplicada",s=>{s.drafts[0].pages.push({slug:"",title:"Página duplicada"});});
 checkMutation("rechaza contador de notificaciones viejo",s=>{s.counter.notification=0;});
 checkMutation("rechaza notificación read inválida",s=>{s.notifications[0].read="yes";});
 check("snapshot sin directorio denegado",!recover.validateSnapshot(checkpointA.checkpoint.state,{}).ok);
 check("snapshot sin arrays denegado",!recover.validateSnapshot({},directory).ok);
 check("checkpoint de demo no es persistencia real",typeof checkpointA.checkpoint.note==="string"&&checkpointA.checkpoint.note.includes("No es backup real"));
 const applyFaultKeys=new Set(["fail-apply-0001"]);
 const restored=make({initialSnapshotForTests:checkpointA.checkpoint.state,
  validateSnapshotForTests:recover.validateSnapshot,
  beforeCommitForTests:op=>{
   if(applyFaultKeys.has(op.operationId)){applyFaultKeys.delete(op.operationId);return true;}
   return false;
  }});
 check("motor restaurado lista propuesta",(await req(restored,"owner","GET",createPath)).body.items.length===1);
 check("motor restaurado conserva estado enviado",(await req(restored,"owner","GET",proposalPath)).body.proposal.status==="submitted");
 check("motor restaurado conserva avisos",(await req(restored,"owner","GET","/api/v1/me/notifications")).body.unread===1);
 check("motor restaurado conserva cursor",(await req(restored,"owner","GET",events)).body.nextCursor===readEvents.body.nextCursor);
 const replay=await req(restored,"super","POST",proposalPath+"/submit",{expectedRevision:1},"fail-send-00001");
 check("retry tras restore devuelve idempotencia",replay.headers["Idempotency-Replayed"]==="true");
 check("retry tras restore no duplica outbox",restored.inspectForTests().outbox.length===1);
 check("restore no cambia origen",api.inspectForTests().outbox.length===1);
 const goodRestore=restored.inspectForTests();
 goodRestore.revisions[0].proposal.businessName="Violación";
 check("integridad de snapshot capturado",!recover.validateSnapshot(goodRestore,directory).ok);
 let threw=false;
 try{make({initialSnapshotForTests:goodRestore,validateSnapshotForTests:recover.validateSnapshot});}
 catch(e){threw=true;}
 check("rehidratación inválida se rechaza",threw);
 threw=false;
 try{make({initialSnapshotForTests:checkpointA.checkpoint.state});}catch(e){threw=true;}
 check("restore sin validador se rechaza",threw);
 const approve=await req(restored,"owner","POST",proposalPath+"/review",
  {decision:"approved",expectedRevision:1,note:""},"approve-v15-0001");
 check("aprobación tras restore",approve.status===200&&approve.body.proposal.status==="approved");
 const pBefore=restored.inspectForTests();
 const failedApply=await req(restored,"editor","POST",proposalPath+"/apply",
  {expectedRevision:1,expectedDraftVersion:1},"fail-apply-0001");
 check("simula fallo aplicando borrador",failedApply.status===503);
 check("aplicación fallida mantiene versión",restored.inspectForTests().drafts.find(x=>x.clientId==="c1"&&x.siteId==="s1").version===1);
 check("aplicación fallida mantiene estado approved",restored.inspectForTests().proposals[0].status==="approved");
 check("aplicación fallida no crea outbox",restored.inspectForTests().outbox.length===pBefore.outbox.length);
 check("aplicación fallida no registra idempotencia",restored.inspectForTests().operations.length===pBefore.operations.length);
 const recoveredApply=await req(restored,"editor","POST",proposalPath+"/apply",
  {expectedRevision:1,expectedDraftVersion:1},"fail-apply-0001");
 check("aplicar tras reintento",recoveredApply.status===200&&recoveredApply.body.draft.version===2);
 check("outbox aprobado y aplicado",restored.inspectForTests().outbox.length===3);
 const cursor2=await req(restored,"owner","GET",events,null,null,{after:readEvents.body.nextCursor});
 check("sincronización por cursor recupera eventos",cursor2.body.items.length===2);
 check("orden de eventos por secuencia",cursor2.body.items[0].sequence<cursor2.body.items[1].sequence);
 check("evento aplicado no publica web",(await req(restored,"owner","GET",base+"/draft")).body.draft.publishedCount===0);
 check("revisions y avisos verificables tras aplicación",recover.validateSnapshot(restored.inspectForTests(),directory).ok);
 const afterCheckpoint=recover.makeCheckpoint(restored.inspectForTests(),directory);
 check("checkpoint posterior a aplicar",afterCheckpoint.ok);
 const isolated=make({initialSnapshotForTests:afterCheckpoint.checkpoint.state,
  validateSnapshotForTests:recover.validateSnapshot});
 check("restauración con borrador versión 2",(await req(isolated,"owner","GET",base+"/draft")).body.draft.version===2);
 check("restauración mantiene applied",(await req(isolated,"owner","GET",proposalPath)).body.proposal.status==="applied");
 check("restore no duplica publicaciones",(await req(isolated,"owner","GET",base+"/draft")).body.draft.publishedCount===0);
 const oldReplay=await req(isolated,"editor","POST",proposalPath+"/apply",
  {expectedRevision:1,expectedDraftVersion:1},"fail-apply-0001");
 check("idempotencia de aplicar sobrevive a restore",oldReplay.headers["Idempotency-Replayed"]==="true");
 check("no duplica páginas",(await req(isolated,"owner","GET",base+"/draft")).body.draft.pages.length===3);
 check("plan B permanece intacto",(await req(isolated,"other","GET","/api/v1/organizations/c2/sites/s2/draft")).body.draft.version===1);
 directory.members.find(m=>m.userId==="editor1").status="Revocado";
 check("editor revocado no lee eventos",(await req(isolated,"editor","GET",events)).status===403);
 check("editor revocado no reutiliza operación",(await req(isolated,"editor","POST",proposalPath+"/apply",
  {expectedRevision:1,expectedDraftVersion:1},"fail-apply-0001")).status===403);
 check("owner sí mantiene lectura",(await req(isolated,"owner","GET",events)).status===200);
 check("sin conexiones de red",!read("shared/mg-v15-recovery-demo.js").includes("fetch("));
 console.log("\n"+passed+" comprobaciones V15 de recuperación y sincronización simuladas correctas.");
 return passed;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
