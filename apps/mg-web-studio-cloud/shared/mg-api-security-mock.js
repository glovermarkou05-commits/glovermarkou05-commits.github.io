/* MG WEB STUDIO CLOUD — CONTRATO API V8 (SIMULADOR, NO SERVIDOR)
 * Simula la autorización que DEBE ocurrir en un backend. No ofrece endpoints,
 * no escucha peticiones HTTP y NO autentica usuarios reales.
 * getTrustedSession y getStaffAccess son stubs provistos por pruebas.
 * Jamás derivar actor, tenant o rol de una query o del body en producción.
 */
(function(root) {
"use strict";
const VERSION="0.8.0-demo";
const ROLES={
 CLIENT_OWNER:{read:1,edit:1,publish:1,users:1,support:1,billing:1},
 CLIENT_ADMIN:{read:1,edit:1,publish:1,users:1,support:1,billing:0},
 CLIENT_EDITOR:{read:1,edit:1,publish:0,users:0,support:0,billing:0},
 CLIENT_VIEWER:{read:1,edit:0,publish:0,users:0,support:0,billing:0}
};
function copy(o){return JSON.parse(JSON.stringify(o));}
function result(status,data) {
 return {status,body:copy(data||{}),headers:{"Cache-Control":"no-store"}};
}
function error(status,code,message) {return result(status,{ok:false,error:{code,message}});}
function validId(id){return typeof id==="string"&&/^[a-z][a-z0-9_-]{0,63}$/.test(id);}
function createMockAPI(opts) {
 if(!opts||typeof opts.getTrustedSession!=="function"||
 typeof opts.directory!=="function"||!opts.repository||typeof opts.getStaffAccess!=="function")
 throw new TypeError("Falta la sesión de servidor simulado, directorio, repositorio o regla de personal.");
 function records() {
  const value=opts.directory();
  if(!value||!Array.isArray(value.organizations)||!Array.isArray(value.sites)||
    !Array.isArray(value.members))throw new TypeError("Directorio inválido.");
  return value;
 }
 function principal(req) {
  // En este mock, el actor procede EXCLUSIVAMENTE del callback confiable
  // inyectado por el test, NUNCA de body/query/headers aportados por cliente.
  const session=opts.getTrustedSession(req);
  return session&&session.verified===true&&validId(session.userId)?session:null;
 }
 function activeMembership(actor,organizationId) {
  return records().members.find(m=>m.userId===actor.userId&&
   m.clientId===organizationId&&m.status==="Activo (demo)"&&ROLES[m.role])||null;
 }
 function allowedSite(m,siteId,action) {
  const rules=ROLES[m.role];
  if(!rules||!rules[action])return false;
  if(m.scope==="all")return m.role==="CLIENT_OWNER"||m.role==="CLIENT_ADMIN";
  return m.scope==="selected"&&Array.isArray(m.siteIds)&&m.siteIds.includes(siteId);
 }
 function authorizeSite(actor,orgId,siteId,action) {
  if(!validId(orgId)||!validId(siteId))return {error:error(400,"INVALID_ID","Identificadores no válidos.")};
  const directory=records();
  const org=directory.organizations.find(x=>x.id===orgId);
  const site=directory.sites.find(x=>x.id===siteId&&x.clientId===orgId);
  if(!org||!site)return {error:error(404,"NOT_FOUND","Recurso no disponible.")};
  const member=activeMembership(actor,orgId);
  if(!member||!allowedSite(member,siteId,action))
   return {error:error(403,"FORBIDDEN","No autorizado en este sitio de demostración.")};
  return {member,site,context:{clientId:orgId,siteId,memberId:member.id}};
 }
 async function request(req) {
  req=req||{};
  const actor=principal(req);
  if(!actor)return error(401,"UNAUTHENTICATED","No hay una sesión confiable de demostración.");
  const method=String(req.method||"GET").toUpperCase();
  const pathname=String(req.path||"").split("?")[0];
  if(pathname==="/api/admin/organizations"&&method==="GET") {
   const staff=opts.getStaffAccess(actor);
   if(!staff||staff.role!=="SUPERADMIN"||actor.aal!=="aal2")
    return error(403,"ADMIN_MFA_REQUIRED","Acceso administrativo y MFA no verificados.");
   return result(200,{ok:true,items:records().organizations});
  }
  if(pathname==="/api/me/organizations"&&method==="GET") {
   const r=records();
   const ids=new Set(r.members.filter(m=>m.userId===actor.userId&&
     m.status==="Activo (demo)"&&ROLES[m.role]).map(m=>m.clientId));
   return result(200,{ok:true,items:r.organizations.filter(o=>ids.has(o.id))});
  }
  const orgSites=/^\/api\/organizations\/([a-z0-9_-]+)\/sites$/.exec(pathname);
  if(orgSites&&method==="GET") {
   const orgId=orgSites[1],r=records();
   const member=activeMembership(actor,orgId);
   if(!member)return error(403,"FORBIDDEN","No autorizado para consultar sitios.");
   const sites=r.sites.filter(s=>s.clientId===orgId&&allowedSite(member,s.id,"read"));
   return result(200,{ok:true,items:sites});
  }
  const route=/^\/api\/organizations\/([a-z0-9_-]+)\/sites\/([a-z0-9_-]+)(?:\/(draft|releases|changes|capabilities))?$/.exec(pathname);
  if(!route)return error(404,"NOT_FOUND","Ruta no disponible en este mock.");
  const orgId=route[1],siteId=route[2],resource=route[3]||"details";
  let action="read";
  if(resource==="draft"&&method==="PUT")action="edit";
  if(resource==="releases"&&method==="POST")action="publish";
  const auth=authorizeSite(actor,orgId,siteId,action);
  if(auth.error)return auth.error;
  const ctx=auth.context;
  if(resource==="details"&&method==="GET")return result(200,{ok:true,site:auth.site});
  if(resource==="capabilities"&&method==="GET"){
   const capabilities={};
   Object.keys(ROLES[auth.member.role]).forEach(key=>{
    capabilities[key]=allowedSite(auth.member,siteId,key);
   });
   return result(200,{ok:true,capabilities});
  }
  if(resource==="draft"&&method==="GET"){
   const response=await opts.repository.readSite(ctx);
   return result(response.status,response);
  }
  if(resource==="draft"&&method==="PUT"){
   const body=req.body||{};
   const response=await opts.repository.saveDraft({
    context:ctx,expectedVersion:body.expectedVersion,
    operationId:String(req.operationId||""),
    draft:body.draft
   });
   return result(response.status,response);
  }
  if(resource==="releases"&&method==="GET"){
   const response=await opts.repository.readReleases(ctx);
   return result(response.status,response);
  }
  if(resource==="releases"&&method==="POST"){
   const response=await opts.repository.publishSite({
    context:ctx,expectedVersion:(req.body||{}).expectedVersion,
    operationId:String(req.operationId||"")
   });
   return result(response.status,response);
  }
  if(resource==="changes"&&method==="GET"){
   const cursor=Number((req.query||{}).afterVersion);
   const response=await opts.repository.readChanges(ctx,cursor);
   return result(response.status,response);
  }
  return error(405,"METHOD_NOT_ALLOWED","Método no permitido.");
 }
 return Object.freeze({version:VERSION,mode:"mock-only",request});
}
root.MGWebStudioAPIMock=Object.freeze({version:VERSION,createMockAPI});
})(typeof window!=="undefined"?window:globalThis);
