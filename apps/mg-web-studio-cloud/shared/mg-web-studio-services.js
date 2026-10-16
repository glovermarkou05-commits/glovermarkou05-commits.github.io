/* MG WEB STUDIO CLOUD — SERVICIOS COMPARTIDOS V1
 * Adaptador de lectura en memoria, SIN autenticación, APIs, almacenamiento o red.
 * No usar las comprobaciones del cliente como autorización de producción.
 * Los dos HTML mantienen estados locales independientes hasta disponer de backend.
 */
(function(root){
 "use strict";
 var VERSION="1.0.0";
 var ROLES=["CLIENT_OWNER","CLIENT_ADMIN","CLIENT_EDITOR","CLIENT_VIEWER"];
 var PLANS=["Start","Crece","Pro"];
 var ACTIONS=["read","edit","publish","users","support","billing"];
 var ROLE_RULES={
  CLIENT_OWNER:{read:true,edit:true,publish:true,users:true,support:true,billing:true},
  CLIENT_ADMIN:{read:true,edit:true,publish:true,users:true,support:true,billing:false},
  CLIENT_EDITOR:{read:true,edit:true,publish:false,users:false,support:false,billing:false},
  CLIENT_VIEWER:{read:true,edit:false,publish:false,users:false,support:false,billing:false}
 };
 var FIXTURES=[
  {id:"c1",name:"Café Horizonte (ejemplo)",plan:"Crece",
   site:{id:"s1",name:"Café Horizonte",domain:"cafe-horizonte.ejemplo.invalid"}},
  {id:"c2",name:"Papelería Nube (ejemplo)",plan:"Start",
   site:{id:"s2",name:"Papelería Nube",domain:"papeleria-nube.ejemplo.invalid"}}
 ];
 function copy(value){return JSON.parse(JSON.stringify(value));}
 function result(ok,data,error){return ok?{ok:true,data:copy(data)}:{ok:false,error:error||"Recurso no disponible."};}
 function requireId(id){return typeof id==="string"&&/^[a-z][a-z0-9_-]{0,39}$/.test(id);}
 function validRole(role){return ROLES.indexOf(role)!==-1;}
 function validPlan(plan){return PLANS.indexOf(plan)!==-1;}
 function fixtureBySite(siteId){return FIXTURES.find(function(o){return o.site.id===siteId;})||null;}
 function validateRecords(value){
  return !!value&&Array.isArray(value.organizations)&&Array.isArray(value.sites)&&Array.isArray(value.members);
 }
 function createMemoryService(getRecords){
  if(typeof getRecords!=="function")throw new TypeError("createMemoryService requiere una función que entregue datos locales.");
  function records(){var v=getRecords();if(!validateRecords(v))throw new TypeError("Estructura de datos ficticios inválida.");return v;}
  function organization(id){return records().organizations.find(function(o){return o.id===id;})||null;}
  function siteById(id){return records().sites.find(function(s){return s.id===id;})||null;}
  function memberById(id){return records().members.find(function(m){return m.id===id;})||null;}
  function can(memberId,siteId,action){
   if(!ACTIONS.includes(action))return false;
   var s=siteById(siteId),m=memberById(memberId);
   if(!s||!m||m.clientId!==s.clientId||m.status!=="Activo (demo)"||
      !ROLE_RULES[m.role]||ROLE_RULES[m.role][action]!==true)return false;
   if(!organization(m.clientId))return false;
   if(m.scope==="all")return m.role==="CLIENT_OWNER"||m.role==="CLIENT_ADMIN";
   return m.scope==="selected"&&Array.isArray(m.siteIds)&&m.siteIds.includes(siteId);
  }
  function listOrganizations(){
   return copy(records().organizations.filter(function(o){return requireId(o.id);}));
  }
  function getOrganization(id){
   if(!requireId(id))return result(false,null,"Identificador de negocio inválido.");
   var o=organization(id);return o?result(true,o):result(false,null,"Negocio ficticio no encontrado.");
  }
  function listSites(clientId){
   if(!requireId(clientId)||!organization(clientId))return result(false,null,"Negocio ficticio inexistente.");
   return result(true,records().sites.filter(function(s){return s.clientId===clientId&&requireId(s.id);}));
  }
  function getSite(clientId,siteId){
   if(!requireId(clientId)||!requireId(siteId))return result(false,null,"Identificadores de sitio inválidos.");
   var s=siteById(siteId);
   return s&&s.clientId===clientId&&organization(clientId)?result(true,s):result(false,null,"Sitio ajeno o inexistente.");
  }
  function getFixtureSite(siteId){
   var f=fixtureBySite(siteId);
   if(!f)return result(false,null,"Sitio sin portal estático de ejemplo.");
   var s=getSite(f.id,siteId);
   if(!s.ok)return s;
   return result(true,{clientId:f.id,siteId:f.site.id,portalName:f.site.name});
  }
  function createNavigation(args){
   args=args||{};
   var f=getFixtureSite(args.siteId);
   if(!f.ok||f.data.clientId!==args.clientId)return result(false,null,"Sitio no vinculado al negocio.");
   var o=getOrganization(args.clientId);
   if(!o.ok||!validRole(args.role)||!validPlan(args.plan)||o.data.plan!==args.plan)
    return result(false,null,"Rol, sitio o plan de demostración inválido.");
   if(args.memberId){
    var m=memberById(args.memberId);
    if(!m||m.role!==args.role||!can(args.memberId,args.siteId,"read"))
     return result(false,null,"Colaborador sin acceso al sitio.");
   }
   var query="?mgdemo="+encodeURIComponent([args.clientId,args.siteId,args.role].join("."))+
    "&mgplan="+encodeURIComponent(args.plan);
   return result(true,{query:query,relativeHref:"./portal-cliente.html"+query});
  }
  function readNavigation(search){
   var match=String(search||"").match(/[?&]mgdemo=([^&#]+)/);
   if(!match)return result(false,null,"No se recibió contexto de demostración.");
   var parts,plan="";
   try{parts=decodeURIComponent(match[1]).split(".");
    var m=String(search).match(/[?&]mgplan=([^&#]+)/);
    if(m)plan=decodeURIComponent(m[1]);
   }catch(err){return result(false,null,"Parámetros de demostración inválidos.");}
   if(parts.length!==3||!requireId(parts[0])||!requireId(parts[1])||
      !validRole(parts[2])||(plan&&!validPlan(plan)))return result(false,null,"Contexto no válido.");
   var f=getFixtureSite(parts[1]);
   if(!f.ok||f.data.clientId!==parts[0])return result(false,null,"Empresa y sitio no corresponden.");
   var o=getOrganization(parts[0]);
   if(!o.ok)return result(false,null,"Empresa no disponible.");
   return result(true,{clientId:parts[0],siteId:parts[1],role:parts[2],plan:plan||null});
  }
  return Object.freeze({
   version:VERSION,mode:"memory-demo",listOrganizations:listOrganizations,
   getOrganization:getOrganization,listSites:listSites,getSite:getSite,
   getFixtureSite:getFixtureSite,can:can,createNavigation:createNavigation,
   readNavigation:readNavigation
  });
 }
 root.MGWebStudioServices=Object.freeze({
  version:VERSION,mode:"memory-demo",roles:ROLES.slice(),plans:PLANS.slice(),
  actions:ACTIONS.slice(),fixtureCatalog:copy(FIXTURES),
  createMemoryService:createMemoryService
 });
})(typeof window!=="undefined"?window:globalThis);
