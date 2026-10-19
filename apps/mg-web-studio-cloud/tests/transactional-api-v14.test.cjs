"use strict";
/* node apps/mg-web-studio-cloud/tests/transactional-api-v14.test.cjs
 * Sin HTTP, npm, base de datos, proveedor externo ni publicación real.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=f=>fs.readFileSync(path.join(root,f),"utf8");
const window={};
for(const f of ["shared/mg-ai-web-assistant-demo.js","shared/mg-proposal-exchange-demo.js",
 "shared/mg-transactional-api-v14-demo.js"])new Function("window",read(f))(window);
const directory={
 organizations:[{id:"c1",name:"Café Horizonte",plan:"Crece",status:"active"},
  {id:"c2",name:"Papelería Nube",plan:"Start",status:"active"}],
 sites:[{id:"s1",clientId:"c1"},{id:"s3",clientId:"c1"},{id:"s2",clientId:"c2"}],
 members:[
  {userId:"owner1",clientId:"c1",status:"Activo (demo)",role:"CLIENT_OWNER",scope:"all",siteIds:[]},
  {userId:"editor1",clientId:"c1",status:"Activo (demo)",role:"CLIENT_EDITOR",scope:"selected",siteIds:["s1"]},
  {userId:"editor3",clientId:"c1",status:"Activo (demo)",role:"CLIENT_EDITOR",scope:"selected",siteIds:["s3"]},
  {userId:"viewer1",clientId:"c1",status:"Activo (demo)",role:"CLIENT_VIEWER",scope:"selected",siteIds:["s1"]},
  {userId:"owner2",clientId:"c2",status:"Activo (demo)",role:"CLIENT_OWNER",scope:"all",siteIds:[]},
  {userId:"revoked1",clientId:"c1",status:"Revocado",role:"CLIENT_OWNER",scope:"all",siteIds:[]}
 ],
 staff:[{userId:"super1",role:"SUPERADMIN",active:true},{userId:"auditor1",role:"AUDITOR",active:true}]
};
const sessions={
 super:{verified:true,userId:"super1",kind:"staff",aal:"aal2"},
 lowmfa:{verified:true,userId:"super1",kind:"staff",aal:"aal1"},
 auditor:{verified:true,userId:"auditor1",kind:"staff",aal:"aal2"},
 owner:{verified:true,userId:"owner1",kind:"client",aal:"aal1"},
 editor:{verified:true,userId:"editor1",kind:"client",aal:"aal1"},
 editor3:{verified:true,userId:"editor3",kind:"client",aal:"aal1"},
 viewer:{verified:true,userId:"viewer1",kind:"client",aal:"aal1"},
 other:{verified:true,userId:"owner2",kind:"client",aal:"aal1"},
 revoked:{verified:true,userId:"revoked1",kind:"client",aal:"aal1"},
 invalid:{verified:false,userId:"owner1",kind:"client",aal:"aal2"}
};
const api=window.MGWebTransactionalAPI.createTransactionalMock({
 directory:()=>directory,resolveSession:req=>sessions[req.fixture]||null,
 exchange:window.MGWebProposalExchange,
 initialDrafts:[
  {clientId:"c1",siteId:"s1",pages:[{name:"Inicio",slug:"",title:"Café ejemplo"}]},
  {clientId:"c1",siteId:"s3",pages:[{name:"Inicio",slug:"",title:"Corporativa"}]},
  {clientId:"c2",siteId:"s2",pages:[{name:"Inicio",slug:"",title:"Papelería"}]}
 ]});
const original=window.MGAIWebAssistant.createProposal({
 type:"restaurante",style:"natural",goal:"contacto",plan:"Crece",
 brand:"Café Horizonte",offering:"café de especialidad y meriendas artesanales",
 audience:"familias y estudiantes"
}).proposal;
const otherPlan=window.MGAIWebAssistant.createProposal({
 type:"tienda",style:"moderno",goal:"vender",plan:"Start",
 brand:"Papelería Nube",offering:"materiales escolares y cuadernos",
 audience:"estudiantes y familias"
}).proposal;
const at=(site="s1",org="c1")=>"/api/v1/organizations/"+org+"/sites/"+site;
const request=(who,method,route,body,operationId)=>api.request({
 fixture:who,method,path:route,body:body||{},operationId});
const create=at()+"/proposals",list=at()+"/proposals";
let count=0;
function check(label,cond){assert.ok(cond,label);count++;console.log("✓",label);}
async function main(){
 check("módulo en memoria y sin servidor",api.mode==="transactional-memory-mock");
 check("borrador propietario original",(await request("owner","GET",at()+"/draft")).body.draft.version===1);
 check("acceso sin sesión bloqueado",(await request("nobody","GET",list)).status===401);
 check("sesión no verificada bloqueada",(await request("invalid","GET",list)).status===401);
 check("SUPERADMIN sin MFA no crea",(await request("lowmfa","POST",create,{proposal:original},"create-lowmfa-0001")).status===403);
 check("AUDITOR no puede crear",(await request("auditor","POST",create,{proposal:original},"create-auditor-001")).status===403);
 check("CLIENT_OWNER no crea como agencia",(await request("owner","POST",create,{proposal:original},"create-owner-0001")).status===403);
 check("usuario de otra empresa no lee",(await request("other","GET",list)).status===403);
 check("EDITOR de otro sitio mismo tenant bloqueado",(await request("editor3","GET",list)).status===403);
 check("VIEWER puede leer lista autorizada",(await request("viewer","GET",list)).status===200);
 check("sin clave de operación se rechaza",(await request("super","POST",create,{proposal:original})).status===400);
 check("clave demasiado corta",(await request("super","POST",create,{proposal:original},"x")).status===400);
 check("plan erróneo rechazado",(await request("super","POST",create,{proposal:otherPlan},"bad-plan-001")).status===422);
 check("payload con rol falso NO reemplaza sesión",(await request("owner","POST",create,
  {proposal:original,role:"SUPERADMIN",userId:"super1"},"forged-role-001")).status===403);
 check("la validación fallida no crea propuesta",(await request("owner","GET",list)).body.items.length===0);
 const first=await request("super","POST",create,{proposal:original},"create-cafe-001");
 check("SUPERADMIN crea propuesta",first.status===201&&first.body.proposal.revision===1);
 const id=first.body.proposal.id,base=list+"/"+id;
 check("GET detalles restringidos",(await request("owner","GET",base)).body.proposal.id===id);
 check("sin lectura de otro sitio dentro del tenant",(await request("editor3","GET",base)).status===403);
 check("no lectura cross-tenant",(await request("other","GET",base)).status===403);
 check("lectura no cacheable",(await request("owner","GET",base)).headers["Cache-Control"]==="no-store");
 const repeat=await request("super","POST",create,{proposal:original},"create-cafe-001");
 check("create replay 201",repeat.status===201&&repeat.headers["Idempotency-Replayed"]==="true");
 check("create replay no duplica",(await request("owner","GET",list)).body.items.length===1);
 check("mismo idempotency key payload distinto rechazado",(await request("super","POST",create,
   {proposal:{...original,businessName:"Otro ficticio"}},"create-cafe-001")).status===409);
 check("otra propuesta abierta bloqueada",(await request("super","POST",create,{proposal:original},"create-cafe-002")).status===409);
 check("sin avisos antes de enviar",(await request("owner","GET","/api/v1/me/notifications")).body.unread===0);
 const sent=await request("super","POST",base+"/submit",{expectedRevision:1},"send-cafe-0001");
 check("envío confirmado",sent.status===200&&sent.body.proposal.status==="submitted");
 const statusSent=api.inspectForTests();
 check("outbox emitido en commit",statusSent.outbox.length===1&&statusSent.outbox[0].type==="submitted");
 check("aviso entregado en memoria al OWNER",(await request("owner","GET","/api/v1/me/notifications")).body.unread===1);
 check("aviso entregado a EDITOR autorizado",(await request("editor","GET","/api/v1/me/notifications")).body.unread===1);
 check("editor sitio s3 sin aviso",(await request("editor3","GET","/api/v1/me/notifications")).body.unread===0);
 check("empresa B sin aviso",(await request("other","GET","/api/v1/me/notifications")).body.unread===0);
 const sendingAgain=await request("super","POST",base+"/submit",{expectedRevision:1},"send-cafe-0001");
 check("retry envío replay",sendingAgain.headers["Idempotency-Replayed"]==="true");
 check("retry no duplica outbox",api.inspectForTests().outbox.length===1);
 check("otra clave envío duplicado se rechaza",(await request("super","POST",base+"/submit",
   {expectedRevision:1},"send-cafe-0002")).status===409);
 const firstNote=(await request("owner","GET","/api/v1/me/notifications")).body.items[0];
 check("otro destinatario no marca aviso",(await request("editor","POST",
   "/api/v1/me/notifications/"+firstNote.id+"/read",{},"read-other-001")).status===403);
 check("OWNER marca su aviso",(await request("owner","POST",
   "/api/v1/me/notifications/"+firstNote.id+"/read",{},"read-owner-001")).status===200);
 check("contador OWNER baja",(await request("owner","GET","/api/v1/me/notifications")).body.unread===0);
 check("contador EDITOR independiente",(await request("editor","GET","/api/v1/me/notifications")).body.unread===1);
 check("read replay sin efecto doble",(await request("owner","POST",
   "/api/v1/me/notifications/"+firstNote.id+"/read",{},"read-owner-001")).headers["Idempotency-Replayed"]==="true");
 check("VIEWER no aprueba",(await request("viewer","POST",base+"/review",
   {expectedRevision:1,decision:"approved",note:""},"viewer-review-001")).status===403);
 check("EDITOR no aprueba",(await request("editor","POST",base+"/review",
   {expectedRevision:1,decision:"approved",note:""},"editor-approve-01")).status===403);
 check("nota corta para cambios rechazada",(await request("editor","POST",base+"/review",
   {expectedRevision:1,decision:"changes",note:"corto"},"editor-note-0001")).status===422);
 check("fallo no crea outbox",api.inspectForTests().outbox.length===1);
 const changes=await request("editor","POST",base+"/review",
  {expectedRevision:1,decision:"changes",note:"Modificar títulos para nueva revisión."},"editor-changes-01");
 check("EDITOR solicita cambios",changes.status===200&&changes.body.proposal.status==="needs_changes");
 check("agencia recibe notificación",(await request("super","GET","/api/v1/me/notifications")).body.unread===1);
 check("agencia puede consultar outbox",(await request("super","GET","/api/v1/admin/outbox")).body.items.length===2);
 check("cliente no consulta outbox",(await request("owner","GET","/api/v1/admin/outbox")).status===403);
 check("staff sin MFA no consulta outbox",(await request("lowmfa","GET","/api/v1/admin/outbox")).status===403);
 check("respuesta vieja no aprueba",(await request("owner","POST",base+"/review",
  {expectedRevision:1,decision:"approved",note:""},"owner-stale-0001")).status===409);
 check("revisión por cliente bloqueada",(await request("owner","POST",base+"/revise",
  {expectedRevision:1,proposal:original},"revise-forge-001")).status===403);
 const revision2=await request("super","POST",base+"/revise",
  {expectedRevision:1,proposal:{...original,businessName:"Café Renovado"}},"revise-cafe-0001");
 check("agencia genera revisión 2",revision2.status===200&&revision2.body.proposal.revision===2);
 check("historial de revisiones inmutable en mock",api.inspectForTests().revisions.length===2);
 check("falta envío de revisión 2",(await request("owner","POST",base+"/review",
  {expectedRevision:2,decision:"approved",note:""},"premature-approve1")).status===409);
 check("reenvío de revisión 2",(await request("super","POST",base+"/submit",
  {expectedRevision:2},"send-cafe-0003")).status===200);
 const r1=request("owner","POST",base+"/review",
  {expectedRevision:2,decision:"approved",note:""},"owner-race-approve");
 const r2=request("editor","POST",base+"/review",
  {expectedRevision:2,decision:"changes",note:"Por favor actualizar el contenido."},"editor-race-chg1");
 const race=await Promise.all([r1,r2]);
 check("solo una decisión concurrente gana",race.filter(r=>r.status===200).length===1&&race.filter(r=>r.status===409).length===1);
 check("un solo registro revisión 2",api.inspectForTests().reviews.filter(r=>r.revision===2).length===1);
 check("winner OWNER aprobado",race[0].status===200&&race[0].body.proposal.status==="approved");
 check("falta versión borrador detectada",(await request("owner","POST",base+"/apply",
  {expectedRevision:2,expectedDraftVersion:2},"apply-stale-0001")).status===409);
 check("sin aplicar tras conflicto",(await request("owner","GET",at()+"/draft")).body.draft.version===1);
 check("EDITOR otro sitio no aplica",(await request("editor3","POST",base+"/apply",
  {expectedRevision:2,expectedDraftVersion:1},"apply-other-0001")).status===403);
 check("VIEWER no aplica",(await request("viewer","POST",base+"/apply",
  {expectedRevision:2,expectedDraftVersion:1},"apply-viewer-001")).status===403);
 const applied=await request("editor","POST",base+"/apply",
  {expectedRevision:2,expectedDraftVersion:1},"apply-cafe-0001");
 check("EDITOR propio aplica aprobado",applied.status===200&&applied.body.draft.version===2);
 check("crear páginas del sitio",applied.body.draft.pages.length===3);
 check("ninguna publicación real",applied.body.draft.publishedCount===0);
 check("apply evento outbox y notificaciones en commit",api.inspectForTests().outbox.at(-1).type==="applied");
 check("duplicado aplicar repite", (await request("editor","POST",base+"/apply",
  {expectedRevision:2,expectedDraftVersion:1},"apply-cafe-0001")).headers["Idempotency-Replayed"]==="true");
 check("sin duplicar páginas tras replay",(await request("owner","GET",at()+"/draft")).body.draft.pages.length===3);
 check("nueva clave aplicar otra vez bloqueada",(await request("owner","POST",base+"/apply",
  {expectedRevision:2,expectedDraftVersion:2},"apply-cafe-0002")).status===409);
 check("sin cambios en otro sitio",(await request("owner","GET",at("s3")+"/draft")).body.draft.version===1);
 check("sin cambios a empresa B",(await request("other","GET",at("s2","c2")+"/draft")).body.draft.version===1);
 const createB=await request("super","POST",at("s2","c2")+"/proposals",
  {proposal:otherPlan},"create-nube-001");
 check("agencia crea propuesta empresa B",createB.status===201);
 check("cliente A no consulta B",(await request("owner","GET",at("s2","c2")+"/proposals")).status===403);
 check("cliente B consulta su propuesta",(await request("other","GET",at("s2","c2")+"/proposals")).body.items.length===1);
 const wrongPair=await request("super","POST",at("s1","c2")+"/proposals",{proposal:otherPlan},"create-badpair-001");
 check("par org-site cruzado denegado",wrongPair.status===403);
 check("datos no válidos en cuerpo no autoriza",(await request("revoked","GET",list)).status===403);
 directory.members.find(m=>m.userId==="editor1").status="Revocado";
 check("sesión revocada no lee propuestas",(await request("editor","GET",list)).status===403);
 check("sesión revocada no ve avisos",(await request("editor","GET","/api/v1/me/notifications")).body.items.length===0);
 check("replay tras revocar DENEGADO",(await request("editor","POST",base+"/apply",
  {expectedRevision:2,expectedDraftVersion:1},"apply-cafe-0001")).status===403);
 check("respuesta aislada de estado interno",(()=>{const snapshot=api.inspectForTests();snapshot.proposals[0].status="hacked";return api.inspectForTests().proposals[0].status==="applied"})());
 check("no hay Fetch/network en mock",!read("shared/mg-transactional-api-v14-demo.js").includes("fetch("));
 console.log("\n"+count+" casos V14 correctos en simulación. No se ejecutó HTTP ni SQL.");
 return count;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
