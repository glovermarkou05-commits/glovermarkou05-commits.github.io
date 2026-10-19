/* MG WEB STUDIO CLOUD | V14 | API TRANSACCIONAL SIMULADA
 * NO HTTP, NO AUTH REAL, NO SUPABASE, NO RED, NO PERSISTENCIA.
 * resolveSession(request) es un stub exclusivo del arnés de pruebas: producción
 * debe verificar sesión y MFA con identidad CRIPTOGRÁFICAMENTE autenticada.
 * Mutaciones se serializan en una instancia y se confirman reemplazando un
 * snapshot de memoria; esto NO garantiza transacciones ACID multiproceso.
 */
(function(root){
"use strict";
const PLANS={Start:1,Crece:3,Pro:5};
const ROLE={
 CLIENT_OWNER:["read","review","changes","apply"],
 CLIENT_ADMIN:["read","review","changes","apply"],
 CLIENT_EDITOR:["read","changes","apply"],
 CLIENT_VIEWER:["read"]
};
const ID=/^[a-z][a-z0-9_-]{0,63}$/;
const OP=/^[A-Za-z0-9][A-Za-z0-9_.:-]{7,99}$/;
const obj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const id=v=>typeof v==="string"&&ID.test(v);
const deep=v=>JSON.parse(JSON.stringify(v));
const sorted=v=>Array.isArray(v)?v.map(sorted):obj(v)?
 Object.keys(v).sort().reduce((acc,k)=>{acc[k]=sorted(v[k]);return acc;},{}):v;
const eq=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
const reply=(status,body,extras)=>({status,headers:{"Cache-Control":"no-store",...(extras||{})},body:deep(body)});
const err=(status,code,message)=>reply(status,{ok:false,error:{code,message}});
const good=(status,data)=>reply(status,{ok:true,...data});
function createTransactionalMock(config){
 if(!config||typeof config.directory!=="function"||typeof config.resolveSession!=="function"||
  !config.exchange||typeof config.exchange.createPackage!=="function"||!Array.isArray(config.initialDrafts))
  throw new TypeError("El mock requiere directorio, sesión de prueba, adaptador de propuestas y borradores ficticios.");
 let db={proposals:[],revisions:[],reviews:[],drafts:[],notifications:[],outbox:[],operations:[],
  counter:{proposal:0,notification:0,event:0}};
 for(const d of config.initialDrafts){
  if(!id(d.clientId)||!id(d.siteId)||!Array.isArray(d.pages)||!d.pages.some(p=>p.slug==="")||
   db.drafts.some(x=>x.clientId===d.clientId&&x.siteId===d.siteId))
   throw new TypeError("Borrador inicial de prueba inválido.");
  db.drafts.push({clientId:d.clientId,siteId:d.siteId,version:1,pages:deep(d.pages),publishedCount:0});
 }
 let tail=Promise.resolve();
 function directory(){
  const d=config.directory();
  if(!d||!Array.isArray(d.organizations)||!Array.isArray(d.sites)||!Array.isArray(d.members)||!Array.isArray(d.staff))
   throw new TypeError("Directorio ficticio incompleto.");
  return d;
 }
 function principal(request){
  // ACTOR SOLAMENTE desde fuente de prueba inyectada, NO req.body/headers/query.
  const s=config.resolveSession(request);
  if(!s||s.verified!==true||!id(s.userId)||!["client","staff"].includes(s.kind))return null;
  return {userId:s.userId,kind:s.kind,aal:s.aal||"aal1"};
 }
 function staff(s){
  return !!s&&s.kind==="staff"&&s.aal==="aal2"&&
   directory().staff.some(x=>x.userId===s.userId&&x.role==="SUPERADMIN"&&x.active===true);
 }
 function siteExists(clientId,siteId){
  const d=directory();
  const org=d.organizations.find(o=>o.id===clientId&&o.status!=="suspended"&&o.status!=="archived");
  return !!org&&d.sites.some(s=>s.id===siteId&&s.clientId===clientId);
 }
 function member(s,clientId,siteId,action){
  if(!s||s.kind!=="client"||!siteExists(clientId,siteId))return null;
  const m=directory().members.find(m=>m.userId===s.userId&&m.clientId===clientId&&
    m.status==="Activo (demo)"&&ROLE[m.role]&&ROLE[m.role].includes(action));
  if(!m)return null;
  if(m.scope==="all"&&["CLIENT_OWNER","CLIENT_ADMIN"].includes(m.role))return m;
  if(m.scope==="selected"&&["CLIENT_EDITOR","CLIENT_VIEWER"].includes(m.role)&&
    Array.isArray(m.siteIds)&&m.siteIds.includes(siteId))return m;
  return null;
 }
 function authorize(s,org,site,action,canStaff=false){
  if(!id(org)||!id(site)||!siteExists(org,site))return err(404,"NOT_FOUND","Sitio ficticio no disponible.");
  if(canStaff&&staff(s))return null;
  if(!member(s,org,site,action))return err(403,"FORBIDDEN","Sin permiso para este negocio y sitio.");
  return null;
 }
 function proposalFor(state,org,site,pid){
  return state.proposals.find(p=>p.id===pid&&p.clientId===org&&p.siteId===site)||null;
 }
 function notify(state,p,kind,detail,recipient,recipientKind){
  state.notifications.push({id:"n"+(++state.counter.notification),proposalId:p.id,clientId:p.clientId,
   siteId:p.siteId,revision:p.revision,kind,detail,recipientId:recipient,recipientKind,read:false,
   sequence:++state.counter.event});
 }
 function emit(state,p,type){
  state.outbox.push({id:"e"+(++state.counter.event),clientId:p.clientId,siteId:p.siteId,
   proposalId:p.id,revision:p.revision,type,dispatched:false});
  if(type==="submitted"||type==="applied"){
   const ids=new Set();
   for(const m of directory().members){
    if(m.clientId!==p.clientId||ids.has(m.userId)||!member({kind:"client",userId:m.userId},p.clientId,p.siteId,"read"))continue;
    ids.add(m.userId);notify(state,p,type,"Aviso de propuesta de demostración",m.userId,"client");
   }
  }
  if(["approved","changes","rejected","applied"].includes(type)){
   for(const st of directory().staff.filter(x=>x.role==="SUPERADMIN"&&x.active===true))
    notify(state,p,type,"Actualización de propuesta de demostración",st.userId,"staff");
  }
 }
 function receipt(state,session){
  return state.notifications.filter(n=>n.recipientId===session.userId&&n.recipientKind===session.kind&&
    (session.kind==="staff"?staff(session):!!member(session,n.clientId,n.siteId,"read")));
 }
 function validNote(note,needed){
  return typeof note==="string"&&note.trim().length>=(needed?8:0)&&note.length<=500&&
   !/[<>]|[\u0000-\u001f]/.test(note);
 }
 function serialize(run){
  const pending=tail.then(run,run);
  tail=pending.then(()=>{},()=>{});
  return pending;
 }
 function mutate(request,session,org,guard,work){
  return serialize(()=>{
   const denied=guard();
   if(denied)return denied;
   const key=request.operationId;
   if(typeof key!=="string"||!OP.test(key))return err(400,"OPERATION_KEY_REQUIRED",
    "Cada escritura requiere una clave de operación ficticia válida.");
   const normalized={method:String(request.method||"").toUpperCase(),path:request.path,body:request.body||{}};
   const old=db.operations.find(o=>o.key===key&&o.actorId===session.userId&&o.organization===org);
   if(old){
    if(!eq(old.request,normalized))return err(409,"IDEMPOTENCY_COLLISION",
      "La misma clave se utilizó para otra operación.");
    return reply(old.response.status,old.response.body,{"Idempotency-Replayed":"true"});
   }
   const staged=deep(db);
   const result=work(staged);
   if(!result||!Number.isSafeInteger(result.status))throw new TypeError("Respuesta de transacción inválida.");
   if(result.status<200||result.status>=300)return result; // ROLLBACK: no snapshot committed
   staged.operations.push({key,actorId:session.userId,organization:org,request:deep(normalized),
    response:{status:result.status,body:deep(result.body)}});
   db=staged; // COMMIT atómico dentro de una sola instancia de JS
   return result;
  });
 }
 async function request(input){
  const req=input||{},s=principal(req);
  if(!s)return err(401,"UNAUTHENTICATED","Sesión verificada de demostración requerida.");
  const method=String(req.method||"GET").toUpperCase();
  const route=String(req.path||"").split("?")[0];
  if(route==="/api/v1/me/notifications"&&method==="GET"){
   if(s.kind==="staff"&&!staff(s))return err(403,"MFA_REQUIRED","SUPERADMIN requiere MFA ficticio.");
   const items=receipt(db,s);
   return good(200,{items,unread:items.filter(x=>!x.read).length});
  }
  const readNote=/^\/api\/v1\/me\/notifications\/(n[0-9]+)\/read$/.exec(route);
  if(readNote){
   if(method!=="POST")return err(405,"METHOD_NOT_ALLOWED","Método no disponible.");
   const original=db.notifications.find(n=>n.id===readNote[1]);
   if(!original)return err(404,"NOT_FOUND","Aviso inexistente.");
   return mutate(req,s,original.clientId,()=>{
    if(s.kind==="staff"&&!staff(s))return err(403,"MFA_REQUIRED","MFA requerido.");
    if(!receipt(db,s).some(n=>n.id===original.id))
     return err(403,"FORBIDDEN","No eres destinatario de este aviso.");
    return null;
   },staged=>{
    const n=staged.notifications.find(x=>x.id===original.id);
    n.read=true;return good(200,{notification:n});
   });
  }
  if(route==="/api/v1/admin/outbox"&&method==="GET"){
   if(!staff(s))return err(403,"MFA_REQUIRED","Outbox solo SUPERADMIN ficticio.");
   return good(200,{items:db.outbox});
  }
  const pat=/^\/api\/v1\/organizations\/([a-z][a-z0-9_-]{0,63})\/sites\/([a-z][a-z0-9_-]{0,63})(?:\/(draft|proposals)(?:\/(p[0-9]+)(?:\/(submit|review|revise|apply))?)?)?$/.exec(route);
  if(!pat)return err(404,"NOT_FOUND","Ruta no disponible en V14.");
  const org=pat[1],site=pat[2],resource=pat[3]||"site",pid=pat[4],action=pat[5];
  if(resource==="site")return err(404,"NOT_FOUND","Solo rutas específicas V14.");
  if(resource==="draft"){
   if(method!=="GET")return err(405,"METHOD_NOT_ALLOWED","Borradores solo lectura en este mock.");
   const denied=authorize(s,org,site,"read",true);
   if(denied)return denied;
   const draft=db.drafts.find(d=>d.clientId===org&&d.siteId===site);
   return draft?good(200,{draft}):err(404,"NOT_FOUND","Sin borrador ficticio.");
  }
  if(resource!=="proposals")return err(404,"NOT_FOUND","Recurso desconocido.");
  if(!pid){
   if(method==="GET"){
    const denied=authorize(s,org,site,"read",true);
    if(denied)return denied;
    return good(200,{items:db.proposals.filter(p=>p.clientId===org&&p.siteId===site)});
   }
   if(method!=="POST")return err(405,"METHOD_NOT_ALLOWED","Método no permitido.");
   return mutate(req,s,org,()=>!staff(s)||!siteExists(org,site)?
    err(403,"ADMIN_MFA_REQUIRED","Solo SUPERADMIN ficticio con MFA puede crear."):null,staged=>{
    const organization=directory().organizations.find(o=>o.id===org);
    if(!organization||!PLANS[organization.plan])return err(409,"PLAN_CHANGED","Plan no configurado.");
    if(staged.proposals.some(p=>p.clientId===org&&p.siteId===site&&
     ["draft","submitted","approved"].includes(p.status)))
     return err(409,"OPEN_PROPOSAL","Ya existe propuesta abierta.");
    const result=config.exchange.createPackage({clientId:org,siteId:site,plan:organization.plan,
     proposal:(req.body||{}).proposal});
    if(!result.ok)return err(422,"PROPOSAL_INVALID",result.error);
    const p={id:"p"+(++staged.counter.proposal),clientId:org,siteId:site,plan:organization.plan,
     revision:1,status:"draft",proposal:deep(result.packet.proposal),
     appliedDraftVersion:null,history:[{revision:1,event:"created",actorId:s.userId}]};
    staged.proposals.push(p);
    staged.revisions.push({proposalId:p.id,revision:1,proposal:deep(p.proposal),author:s.userId});
    return good(201,{proposal:p});
   });
  }
  if(!action){
   if(method!=="GET")return err(405,"METHOD_NOT_ALLOWED","Método no permitido.");
   const denied=authorize(s,org,site,"read",true);
   if(denied)return denied;
   const p=proposalFor(db,org,site,pid);
   return p?good(200,{proposal:p}):err(404,"NOT_FOUND","Propuesta no disponible.");
  }
  if(method!=="POST")return err(405,"METHOD_NOT_ALLOWED","Solo POST para mutaciones.");
  return mutate(req,s,org,()=>{
   const isStaff=action==="submit"||action==="revise";
   const denied=authorize(s,org,site,action==="review"?"read":"apply",isStaff);
   if(denied)return denied;
   if(isStaff&&!staff(s))return err(403,"ADMIN_MFA_REQUIRED","Acceso SUPERADMIN ficticio requerido.");
   if(!proposalFor(db,org,site,pid))return err(404,"NOT_FOUND","Propuesta no disponible.");
   return null;
  },staged=>{
   const p=proposalFor(staged,org,site,pid),body=req.body||{};
   if(!p||!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision!==p.revision)
    return err(409,"STALE_PROPOSAL","La revisión de la propuesta cambió.");
   if(action==="submit"){
    if(p.status!=="draft")return err(409,"INVALID_STATE","Propuesta ya enviada.");
    p.status="submitted";p.history.push({revision:p.revision,event:"submitted",actorId:s.userId});
    emit(staged,p,"submitted");return good(200,{proposal:p});
   }
   if(action==="review"){
    if(p.status!=="submitted")return err(409,"INVALID_STATE","Propuesta no pendiente.");
    if(!["approved","changes","rejected"].includes(body.decision))
     return err(422,"INVALID_DECISION","Decisión inválida.");
    const permission=member(s,org,site,body.decision==="changes"?"changes":"review");
    if(!permission)return err(403,"FORBIDDEN","El rol no permite esta decisión.");
    if(!validNote(body.note||"",body.decision!=="approved"))
     return err(422,"INVALID_NOTE","La observación de rechazo o cambios debe tener 8 a 500 caracteres.");
    p.status={approved:"approved",changes:"needs_changes",rejected:"rejected"}[body.decision];
    p.history.push({revision:p.revision,event:body.decision,note:(body.note||"").trim(),
     actorId:s.userId});
    staged.reviews.push({proposalId:p.id,revision:p.revision,decision:body.decision,
     reviewer:s.userId,note:(body.note||"").trim()});
    emit(staged,p,body.decision);return good(200,{proposal:p});
   }
   if(action==="revise"){
    if(!["needs_changes","rejected"].includes(p.status))
     return err(409,"INVALID_STATE","Solo revisar después de cambios/rechazo.");
    const organization=directory().organizations.find(o=>o.id===org);
    if(!organization||organization.plan!==p.plan)return err(409,"PLAN_CHANGED","Plan cambió.");
    const result=config.exchange.createPackage({clientId:org,siteId:site,plan:p.plan,proposal:body.proposal});
    if(!result.ok)return err(422,"PROPOSAL_INVALID",result.error);
    p.revision+=1;p.status="draft";p.proposal=deep(result.packet.proposal);
    p.history.push({revision:p.revision,event:"revised",actorId:s.userId});
    staged.revisions.push({proposalId:p.id,revision:p.revision,proposal:deep(p.proposal),author:s.userId});
    return good(200,{proposal:p});
   }
   if(action==="apply"){
    if(!member(s,org,site,"apply"))return err(403,"FORBIDDEN","No puede editar borradores.");
    if(p.status!=="approved")return err(409,"INVALID_STATE","La revisión necesita aprobación.");
    const d=staged.drafts.find(d=>d.clientId===org&&d.siteId===site);
    const organization=directory().organizations.find(o=>o.id===org);
    if(!d||!organization||organization.plan!==p.plan)return err(409,"PLAN_CHANGED","Plan/borrador no disponible.");
    if(!Number.isSafeInteger(body.expectedDraftVersion)||body.expectedDraftVersion!==d.version)
     return err(409,"STALE_DRAFT","El borrador cambió.");
    const incoming=p.proposal.pages.slice(1);
    if(d.pages.length+incoming.length>PLANS[p.plan])return err(409,"PLAN_LIMIT","Exceso de páginas para el plan.");
    if(incoming.some(pg=>d.pages.some(x=>x.slug===pg.slug)))
     return err(409,"SLUG_COLLISION","El sitio ya contiene una ruta propuesta.");
    if(!d.pages.some(x=>x.slug===""))return err(409,"MISSING_HOME","No hay página Inicio.");
    d.pages=d.pages.map(pg=>pg.slug===""?deep(p.proposal.pages[0]):pg).concat(deep(incoming));
    d.version++;
    p.status="applied";p.appliedDraftVersion=d.version;
    p.history.push({revision:p.revision,event:"applied",actorId:s.userId});
    emit(staged,p,"applied");
    return good(200,{proposal:p,draft:d});
   }
   return err(404,"NOT_FOUND","Acción no implementada.");
  });
 }
 return Object.freeze({version:"14.0-demo",mode:"transactional-memory-mock",request,
  inspectForTests:()=>deep(db)});
}
root.MGWebTransactionalAPI=Object.freeze({version:"14.0-demo",createTransactionalMock});
})(typeof window!=="undefined"?window:globalThis);
