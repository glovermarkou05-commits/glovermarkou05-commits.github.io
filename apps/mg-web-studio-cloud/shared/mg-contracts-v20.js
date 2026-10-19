/* MG WEB STUDIO CLOUD | V20 | Contratos canónicos SOLO PARA REVISIÓN
 * No migra ni escribe datos; no autentica usuarios, no realiza red ni SQL.
 * Datos ficticios; no interpretar roles del navegador como autorización real.
 */
(function(root) {
"use strict";
const VERSION="20.0-review";
const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOME="home";
const STATUSES=["draft","submitted","needs_changes","rejected","approved","applied"];
const ACTIONS=["create","submit","approve","changes","reject","revise","apply"];
const ALIASES=Object.freeze({submitted_for_review:"submitted",applied_to_draft:"applied"});
const ROLE_ACTIONS=Object.freeze({
 CLIENT_OWNER:["approve","changes","reject","apply"],
 CLIENT_ADMIN:["approve","changes","reject","apply"],
 CLIENT_EDITOR:["changes","apply"],
 CLIENT_VIEWER:[],
 SUPERADMIN:["create","submit","revise"]
});
const EVENTS=Object.freeze({
 create:{from:null,to:"draft",role:"staff",increment:false},
 submit:{from:"draft",to:"submitted",role:"staff",increment:false},
 approve:{from:"submitted",to:"approved",role:"client",increment:false},
 changes:{from:"submitted",to:"needs_changes",role:"client",increment:false},
 reject:{from:"submitted",to:"rejected",role:"client",increment:false},
 revise:{from:["needs_changes","rejected"],to:"draft",role:"staff",increment:true},
 apply:{from:"approved",to:"applied",role:"client",increment:false}
});
const err=(code,message,extra)=>({ok:false,code,message,...(extra||{})});
const ok=payload=>({ok:true,...payload});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
function normalizedSlug(slug){
 if(typeof slug!=="string")return err("INVALID_SLUG","La ruta debe ser una cadena.");
 if(slug===""||slug===HOME)return ok({slug:HOME,isHome:true,path:"/"});
 if(slug.length>75||!SLUG.test(slug))return err("INVALID_SLUG","Slug inválido: minúsculas, números y guiones sin espacios.");
 return ok({slug,isHome:false,path:"/"+slug});
}
function pathToPage(path){
 if(typeof path!=="string"||path.length>78||path.includes("?")||path.includes("#")||
  path.includes("%")||path.includes("\\")||!path.startsWith("/")||
  path.includes("//"))return err("INVALID_PATH","Utiliza un path absoluto canónico sin consulta, fragmento ni encoding.");
 if(path==="/")return normalizedSlug(HOME);
 if(path.endsWith("/"))return err("NONCANONICAL_PATH","No se permiten barras finales salvo en Inicio.");
 const candidate=path.slice(1);
 if(candidate===HOME)return err("RESERVED_HOME","La página Inicio se representa por /, no por /home.");
 if(candidate.includes("/"))return err("NESTED_PATH","La V20 no admite rutas anidadas.");
 return normalizedSlug(candidate);
}
function canonicalPages(pages){
 if(!Array.isArray(pages)||!pages.length||pages.length>25)
  return err("INVALID_PAGES","La lista de páginas debe tener entre 1 y 25 elementos.");
 const out=[],seen=new Set();let homeCount=0;
 for(const page of pages){
  if(!plain(page)||!own(page,"slug"))return err("INVALID_PAGE","Página sin slug explícito.");
  const n=normalizedSlug(page.slug);
  if(!n.ok)return n;
  if(seen.has(n.slug))return err("DUPLICATE_SLUG","La página "+n.slug+" aparece dos veces.");
  seen.add(n.slug);
  if(n.isHome)homeCount++;
  const normalized={...page,slug:n.slug};
  // JSON fixture only: drop non-serializable data; no references to caller data.
  try{out.push(JSON.parse(JSON.stringify(normalized)));}
  catch(e){return err("INVALID_PAGE","La página debe ser serializable.");}
 }
 if(homeCount!==1)return err("MISSING_HOME","Se requiere exactamente una página Inicio.");
 return ok({pages:out,homeSlug:HOME,homePath:"/"});
}
function normalizedState(status){
 if(typeof status!=="string")return err("INVALID_STATUS","Estado no reconocido.");
 const canonical=own(ALIASES,status)?ALIASES[status]:status;
 if(!STATUSES.includes(canonical))return err("INVALID_STATUS","Estado no reconocido.");
 return ok({status:canonical,wasLegacy:canonical!==status});
}
function contractDecision(input){
 if(!plain(input)||!ACTIONS.includes(input.action))
  return err("INVALID_ACTION","Acción de propuesta no reconocida.");
 const event=EVENTS[input.action],action=input.action;
 const s=input.status===null&&action==="create"?ok({status:null}):normalizedState(input.status);
 if(!s.ok)return s;
 const allowedFrom=Array.isArray(event.from)?event.from:[event.from];
 if(!allowedFrom.includes(s.status))return err("INVALID_TRANSITION",
   "La acción "+action+" no se admite desde "+s.status+".");
 if(!Number.isSafeInteger(input.currentRevision)||input.currentRevision<0||
  (action!=="create"&&input.currentRevision<1)||
  !Number.isSafeInteger(input.expectedRevision)||input.expectedRevision!==input.currentRevision)
  return err("STALE_REVISION","La revisión ha cambiado.");
 const actor=input.actor;
 if(!plain(actor)||actor.active!==true||!own(ROLE_ACTIONS,actor.role)||
   !ROLE_ACTIONS[actor.role].includes(action))return err("FORBIDDEN","Rol o membresía no autorizados.");
 if(actor.role==="SUPERADMIN"){
  if(actor.kind!=="staff"||actor.aal!=="aal2")return err("MFA_REQUIRED","Se exige MFA de prueba para SUPERADMIN.");
 } else {
  if(actor.kind!=="client"||!plain(input.scope)||
     input.scope.organizationId!==input.organizationId||
     !input.siteId||typeof input.siteId!=="string")
    return err("SCOPE_DENIED","No existe pertenencia válida a esta empresa/sitio.");
  const all=["CLIENT_OWNER","CLIENT_ADMIN"].includes(actor.role);
  if(all&&input.scope.level!=="all")return err("SCOPE_DENIED","Permiso del responsable no corresponde.");
  if(!all&&(input.scope.level!=="selected"||!Array.isArray(input.scope.siteIds)||
    !input.scope.siteIds.includes(input.siteId)))return err("SCOPE_DENIED","El sitio no está asignado.");
 }
 if(action==="apply"){
  if(!Number.isSafeInteger(input.currentDraftVersion)||input.currentDraftVersion<1||
   !Number.isSafeInteger(input.expectedDraftVersion)||input.expectedDraftVersion!==input.currentDraftVersion)
   return err("STALE_DRAFT","El borrador ha cambiado.");
 }
 if(["reject","changes"].includes(action)&&
   (typeof input.note!=="string"||input.note.trim().length<8||input.note.length>500))
  return err("INVALID_NOTE","La observación debe tener entre 8 y 500 caracteres.");
 return ok({
  state:event.to,revision:input.currentRevision+(event.increment||action==="create"?1:0),
  draftVersion:action==="apply"?input.currentDraftVersion+1:null,
  isDemo:true,authorizationIsReal:false
 });
}
root.MGWebContractsV20=Object.freeze({version:VERSION,mode:"review-only",
 HOME_SLUG:HOME,STATUSES:Object.freeze(STATUSES.slice()),
 ACTIONS:Object.freeze(ACTIONS.slice()),
 aliases:ALIASES,
 normalizedSlug,pathToPage,canonicalPages,normalizedState,contractDecision,
 transitions:Object.freeze(Object.keys(EVENTS).map(action=>Object.freeze({action,
  from:EVENTS[action].from,to:EVENTS[action].to})))
});
})(typeof window!=="undefined"?window:globalThis);
