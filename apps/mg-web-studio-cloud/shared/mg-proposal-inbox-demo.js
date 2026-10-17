/* MG WEB STUDIO CLOUD — BANDEJA V12 DEMO EN MEMORIA
 * NO es backend, no autentica, no conecta dos ventanas HTML ni envia mensajes.
 * Todos los actores y membresias son simulados. Nunca usar para datos reales.
 */
(function(root){
"use strict";
const STATUSES=["Borrador","En revisión","Cambios solicitados","Rechazada","Aprobada","Aplicada al borrador"];
const ROLE_RULES={
 CLIENT_OWNER:{read:true,review:true,changes:true,apply:true},
 CLIENT_ADMIN:{read:true,review:true,changes:true,apply:true},
 CLIENT_EDITOR:{read:true,review:false,changes:true,apply:true},
 CLIENT_VIEWER:{read:true,review:false,changes:false,apply:false}
};
const PLAN_LIMITS={Start:1,Crece:3,Pro:5};
const deep=v=>JSON.parse(JSON.stringify(v));
const validId=x=>typeof x==="string"&&/^[a-z][a-z0-9_-]{0,63}$/.test(x);
const validRev=x=>Number.isSafeInteger(x)&&x>=1&&x<1000000;
const safeNote=(txt,min)=>typeof txt==="string"&&txt.trim().length>=min&&txt.length<=500&&!/[<>]|[\u0000-\u001f]/.test(txt);
const fail=(message,code="INVALID")=>({ok:false,error:message,code});
const yes=data=>({ok:true,data:deep(data)});
function createDemoInbox(config){
 if(!config||typeof config.directory!=="function"||!config.exchange||typeof config.exchange.createPackage!=="function")
  throw new TypeError("Faltan directorio ficticio y validador V10.");
 const proposals=[],drafts=new Map(),notices=[],counters={proposal:0,notice:0,event:0};
 function directory(){
  const d=config.directory();
  if(!d||!Array.isArray(d.organizations)||!Array.isArray(d.sites)||!Array.isArray(d.members)||!Array.isArray(d.staff))
   throw new TypeError("Directorio de prueba inválido.");
  return d;
 }
 function orgById(id){return directory().organizations.find(o=>o.id===id)||null;}
 function siteById(clientId,siteId){return directory().sites.find(s=>s.id===siteId&&s.clientId===clientId)||null;}
 function staffActor(actor){
  return actor&&validId(actor.userId)&&actor.kind==="staff"&&actor.aal==="aal2"&&
   directory().staff.some(x=>x.userId===actor.userId&&x.role==="SUPERADMIN"&&x.active===true);
 }
 function memberActor(actor,clientId,siteId){
  if(!actor||actor.kind!=="client"||!validId(actor.userId)||!validId(clientId)||!validId(siteId)||!siteById(clientId,siteId))return null;
  const m=directory().members.find(m=>m.userId===actor.userId&&m.clientId===clientId&&
    m.status==="Activo (demo)"&&ROLE_RULES[m.role]);
  if(!m)return null;
  if(m.scope==="all"&&!["CLIENT_OWNER","CLIENT_ADMIN"].includes(m.role))return null;
  if(m.scope==="selected"&&(!Array.isArray(m.siteIds)||!m.siteIds.includes(siteId)))return null;
  if(m.scope!=="all"&&m.scope!=="selected")return null;
  return m;
 }
 function mayRead(actor,p){
  if(staffActor(actor))return true;
  return !!memberActor(actor,p.clientId,p.siteId);
 }
 function mayReview(actor,p,decision){
  const m=memberActor(actor,p.clientId,p.siteId);
  return !!m&&(decision==="changes"?ROLE_RULES[m.role].changes:ROLE_RULES[m.role].review);
 }
 function notify(kind,p,recipientId,recipientType,detail){
  if(!recipientId||!validId(recipientId))return;
  notices.push({id:"n"+(++counters.notice),recipientId,recipientType,clientId:p.clientId,
   siteId:p.siteId,proposalId:p.id,revision:p.revision,kind,detail,read:false,
   sequence:++counters.event});
 }
 function notifyClient(kind,p,detail){
  const ids=new Set();
  directory().members.forEach(m=>{
   if(m.status==="Activo (demo)"&&m.clientId===p.clientId&&m.userId&&!ids.has(m.userId)&&
      memberActor({kind:"client",userId:m.userId},p.clientId,p.siteId)){
     ids.add(m.userId);notify(kind,p,m.userId,"client",detail);
   }
  });
 }
 function notifyAgency(kind,p,detail){
  directory().staff.filter(x=>x.active===true&&x.role==="SUPERADMIN").forEach(x=>notify(kind,p,x.userId,"staff",detail));
 }
 function getProposal(id){return proposals.find(p=>p.id===id)||null;}
 function allowedProposal(actor,id){const p=getProposal(id);return p&&mayRead(actor,p)?p:null;}
 function addHistory(p,event,note,actor){
  p.history.push({revision:p.revision,event,note:note||"",actorKind:actor.kind,sequence:++counters.event});
 }
 function initDraft(clientId,siteId,initial){
  if(!validId(clientId)||!validId(siteId)||!siteById(clientId,siteId))return fail("Sitio ficticio inexistente.");
  const key=clientId+"/"+siteId;
  if(drafts.has(key))return fail("Ya existe un borrador de demostración.");
  const pages=initial&&Array.isArray(initial.pages)?initial.pages:[{name:"Inicio",slug:"",title:"Inicio de ejemplo"}];
  drafts.set(key,{version:1,pages:deep(pages),publishedReleaseCount:0});
  return yes(drafts.get(key));
 }
 function getDraft(actor,clientId,siteId){
  const p={clientId,siteId};
  if(!mayRead(actor,p))return fail("Acceso no permitido al borrador ficticio.","FORBIDDEN");
  const row=drafts.get(clientId+"/"+siteId);
  return row?yes(row):fail("Borrador ficticio inexistente.","NOT_FOUND");
 }
 function createProposal(actor,params){
  if(!staffActor(actor))return fail("Solo SUPERADMIN ficticio con MFA puede crear propuestas.","FORBIDDEN");
  if(!params||!validId(params.clientId)||!validId(params.siteId))return fail("Negocio o sitio inválido.");
  const org=orgById(params.clientId);
  if(!org||!siteById(params.clientId,params.siteId)||!PLAN_LIMITS[org.plan])return fail("Sitio y plan incompatibles.");
  if(proposals.some(p=>p.clientId===params.clientId&&p.siteId===params.siteId&&["Borrador","En revisión","Aprobada"].includes(p.status)))
   return fail("Existe una propuesta abierta. Resuélvela antes de iniciar otra.");
  const pkg=config.exchange.createPackage({clientId:params.clientId,siteId:params.siteId,plan:org.plan,proposal:params.proposal});
  if(!pkg.ok)return fail(pkg.error);
  const row={id:"p"+(++counters.proposal),clientId:params.clientId,siteId:params.siteId,plan:org.plan,
   proposal:deep(pkg.packet.proposal),revision:1,status:"Borrador",history:[],appliedDraftVersion:null};
  addHistory(row,"creada","",actor);proposals.push(row);return yes(row);
 }
 function submit(actor,id,expectedRevision){
  const p=getProposal(id);
  if(!staffActor(actor))return fail("Solo SUPERADMIN ficticio puede enviar propuestas.","FORBIDDEN");
  if(!p||!validRev(expectedRevision)||p.revision!==expectedRevision)return fail("Propuesta o revisión inexistente.","CONFLICT");
  if(p.status!=="Borrador")return fail("La propuesta no está en borrador.","CONFLICT");
  p.status="En revisión";addHistory(p,"enviada","",actor);
  notifyClient("submitted",p,"Propuesta de ejemplo enviada para revisión");
  return yes(p);
 }
 function review(actor,id,params){
  const p=getProposal(id);
  if(!p||!mayRead(actor,p))return fail("Propuesta no disponible para este miembro.","FORBIDDEN");
  if(p.status!=="En revisión"||!params||!validRev(params.expectedRevision)||params.expectedRevision!==p.revision)
   return fail("La revisión ya no está pendiente o está desactualizada.","CONFLICT");
  if(!["approved","changes","rejected"].includes(params.decision))return fail("Decisión desconocida.");
  if(!mayReview(actor,p,params.decision))return fail("Este rol no puede tomar esa decisión.","FORBIDDEN");
  const note=String(params.note||"");
  if(!safeNote(note,params.decision==="approved"?0:8))return fail("Para cambios o rechazo incluye una observación ficticia de 8 a 500 caracteres.");
  const next={approved:"Aprobada",changes:"Cambios solicitados",rejected:"Rechazada"}[params.decision];
  p.status=next;
  addHistory(p,params.decision,note.trim(),actor);
  notifyAgency(params.decision,p,"El cliente de ejemplo registró una decisión");
  return yes(p);
 }
 function revise(actor,id,params){
  const p=getProposal(id);
  if(!staffActor(actor))return fail("No puedes editar revisiones de la agencia.","FORBIDDEN");
  if(!p||!params||!validRev(params.expectedRevision)||p.revision!==params.expectedRevision)
   return fail("Número de revisión obsoleto.","CONFLICT");
  if(!["Cambios solicitados","Rechazada"].includes(p.status))return fail("La propuesta no admite una nueva revisión.","CONFLICT");
  const org=orgById(p.clientId);
  if(!org||org.plan!==p.plan)return fail("Cambió el plan; crea una nueva propuesta.","CONFLICT");
  const pkg=config.exchange.createPackage({clientId:p.clientId,siteId:p.siteId,plan:p.plan,proposal:params.proposal});
  if(!pkg.ok)return fail(pkg.error);
  p.revision+=1;p.proposal=deep(pkg.packet.proposal);p.status="Borrador";
  addHistory(p,"revisada","Nueva versión ficticia de la agencia",actor);
  return yes(p);
 }
 function applyToDraft(actor,id,params){
  const p=allowedProposal(actor,id);
  if(!p)return fail("Propuesta no accesible.","FORBIDDEN");
  const member=memberActor(actor,p.clientId,p.siteId);
  if(!member||!ROLE_RULES[member.role].apply)return fail("Rol sin edición del borrador.","FORBIDDEN");
  if(p.status!=="Aprobada"||!params||params.expectedRevision!==p.revision)
   return fail("Debe aprobarse la revisión actual antes de aplicar.","CONFLICT");
  const org=orgById(p.clientId);
  const row=drafts.get(p.clientId+"/"+p.siteId);
  if(!org||org.plan!==p.plan||!row)return fail("Plan o borrador no disponible.","CONFLICT");
  if(!Number.isSafeInteger(params.expectedDraftVersion)||params.expectedDraftVersion!==row.version)
   return fail("El borrador cambió; actualiza antes de aplicar.","CONFLICT");
  if(!p.proposal.pages.length||p.proposal.pages.length>PLAN_LIMITS[p.plan]||
     row.pages.length+p.proposal.pages.length-1>PLAN_LIMITS[p.plan])return fail("No hay capacidad para todas las páginas propuestas.","CONFLICT");
  const incoming=p.proposal.pages.slice(1);
  if(incoming.some(pg=>row.pages.some(existing=>existing.slug===pg.slug)))
   return fail("Ya existe una ruta en el sitio. Revisa antes de aplicar.","CONFLICT");
  const home=row.pages.find(pg=>pg.slug==="");
  if(!home)return fail("No existe página Inicio para aplicar.","CONFLICT");
  const nextPages=row.pages.map(pg=>pg.slug===""?deep(p.proposal.pages[0]):deep(pg))
   .concat(deep(incoming));
  row.pages=nextPages;row.version+=1;
  p.status="Aplicada al borrador";p.appliedDraftVersion=row.version;
  addHistory(p,"aplicada","Borrador actualizado en esta demo",actor);
  notifyAgency("applied",p,"Aprobación aplicada al borrador de ejemplo");
  notifyClient("applied",p,"La propuesta de ejemplo se aplicó al borrador");
  return yes({proposal:p,draft:row});
 }
 function listProposals(actor,filter){
  const f=filter||{};
  if(!staffActor(actor)&&!(actor&&actor.kind==="client"))return fail("Actor no disponible.","FORBIDDEN");
  const items=proposals.filter(p=>mayRead(actor,p)&&(!f.clientId||f.clientId===p.clientId)&&
    (!f.siteId||f.siteId===p.siteId)&&(!f.status||f.status===p.status));
  return yes(items);
 }
 function getProposalFor(actor,id){
  const p=allowedProposal(actor,id);
  return p?yes(p):fail("No puede consultar esta propuesta.","FORBIDDEN");
 }
 function listNotifications(actor){
  if(!actor||!validId(actor.userId))return fail("Actor no válido.","FORBIDDEN");
  if(actor.kind==="staff"&&!staffActor(actor))return fail("MFA administrativo requerido.","FORBIDDEN");
  if(actor.kind!=="staff"&&actor.kind!=="client")return fail("Tipo de actor inválido.","FORBIDDEN");
  const items=notices.filter(n=>n.recipientId===actor.userId&&n.recipientType===actor.kind&&
   (actor.kind==="staff"||!!memberActor(actor,n.clientId,n.siteId)));
  return yes({items,unread:items.filter(x=>!x.read).length});
 }
 function markRead(actor,id){
  const n=notices.find(x=>x.id===id);
  if(!n||!actor||n.recipientId!==actor.userId||n.recipientType!==actor.kind)
   return fail("Notificación no disponible.","FORBIDDEN");
  if(actor.kind==="staff"&&!staffActor(actor))return fail("MFA administrativo requerido.","FORBIDDEN");
  if(actor.kind!=="staff"&&!memberActor(actor,n.clientId,n.siteId))return fail("No tienes acceso al sitio.","FORBIDDEN");
  n.read=true;return yes(n);
 }
 return Object.freeze({version:"12.0-demo",mode:"one-page-volatile",
  initDraft,getDraft,createProposal,submit,review,revise,applyToDraft,
  listProposals,getProposal:getProposalFor,listNotifications,markRead,
  statuses:STATUSES.slice()});
}
root.MGWebProposalInbox=Object.freeze({version:"12.0-demo",createDemoInbox});
})(typeof window!=="undefined"?window:globalThis);
