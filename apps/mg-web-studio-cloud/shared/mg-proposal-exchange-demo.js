/* MG WEB STUDIO CLOUD — Paquete de propuestas V10 (solo transferencia MANUAL).
 * Los documentos NO son autenticados ni firmados. Nunca aceptar paquetes como
 * prueba de propiedad, membresía o autorización. Validación backend pendiente.
 * Sin red, base de datos, archivos automáticos ni almacenamiento persistente.
 */
(function(root){
 "use strict";
 const FORMAT="mg-web-studio-proposal/v10-demo-1";
 const PAGES={Start:1,Crece:3,Pro:5},SECTIONS={Start:5,Crece:8,Pro:12};
 const BLOCK_LEVEL={text:0,image:0,gallery:0,services:0,faq:0,cta:0,contact:0,quote:1,feature:2};
 const RANK={Start:0,Crece:1,Pro:2};
 const fail=(error)=>({ok:false,error});
 const good=(data)=>({ok:true,data});
 const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
 const id=x=>typeof x==="string"&&/^[a-z][a-z0-9_-]{0,63}$/.test(x);
 const text=(s,max,min=0)=>typeof s==="string"&&s.trim().length>=min&&s.length<=max&&!/[<>]|[\u0000-\u001f]/.test(s);
 const trim=x=>x.trim();
 function normalizeProposal(source,plan){
  if(!object(source)||source.mode!=="template-simulation"||source.plan!==plan||
    !text(source.businessName,65,2)||!/^#[0-9a-fA-F]{6}$/.test(source.color||"")||
    !Array.isArray(source.pages)||source.pages.length<1||source.pages.length>PAGES[plan])
    return fail("La propuesta contiene campos inválidos o excede el plan.");
  const slugs=new Set(),normalized=[];
  for(const [idx,p] of source.pages.entries()){
   if(!object(p)||!text(p.name,85,2)||typeof p.slug!=="string"||p.slug.length>64||
      (idx===0?(p.slug!==""||p.name!=="Inicio"):!(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug)))||
      slugs.has(p.slug)||!text(p.title,150,2)||!text(p.description,300,1)||!text(p.cta,45,2)||
      !object(p.seo)||!text(p.seo.title,100)||!text(p.seo.description,300)||
      !text(p.seo.shareTitle,100)||!text(p.seo.shareDescription,300)||typeof p.seo.noindex!=="boolean"||
      !Array.isArray(p.blocks)||p.blocks.length<1||p.blocks.length>SECTIONS[plan])
    return fail("Página o metadatos inválidos en la propuesta.");
   slugs.add(p.slug);
   const blocks=[];
   for(const b of p.blocks){
    if(!object(b)||!Object.hasOwn(BLOCK_LEVEL,b.type)||BLOCK_LEVEL[b.type]>RANK[plan]||
      !text(b.title,150,2)||!text(b.body,1200,1)||b.visible!==true)
     return fail("Bloque fuera del plan o contenido inválido.");
    blocks.push({type:b.type,title:trim(b.title),body:trim(b.body),visible:true,
      image:"",images:[],alt:"",imageAssetId:"",galleryAssetIds:[]});
   }
   normalized.push({name:trim(p.name),slug:p.slug,title:trim(p.title),
    description:trim(p.description),cta:trim(p.cta),
    seo:{title:trim(p.seo.title),description:trim(p.seo.description),
     shareTitle:trim(p.seo.shareTitle),shareDescription:trim(p.seo.shareDescription),noindex:p.seo.noindex},
    blocks});
  }
  return good({mode:"template-simulation",businessName:trim(source.businessName),plan,color:source.color,pages:normalized,
   summary:"Propuesta de demostración para "+trim(source.businessName)+". Requiere aprobación expresa; no es IA real.",
   warnings:["No ingresar datos reales ni contraseñas.","Revisar los cambios antes de aplicarlos al borrador."]});
 }
 function createPackage(params){
  if(!object(params)||!id(params.clientId)||!id(params.siteId)||!Object.hasOwn(PAGES,params.plan))
   return fail("Negocio, sitio o plan no válidos.");
  const normalized=normalizeProposal(params.proposal,params.plan);
  if(!normalized.ok)return normalized;
  const packet={format:FORMAT,source:"superadmin-demo",target:{clientId:params.clientId,siteId:params.siteId,plan:params.plan},
   proposal:normalized.data};
  const encoded=JSON.stringify(packet,null,2);
  if(encoded.length>40000)return fail("Paquete demasiado grande.");
  return {ok:true,json:encoded,packet};
 }
 function parsePackage(json,target){
  if(typeof json!=="string"||json.length>40000||json.length<50)return fail("Formato o tamaño de paquete incorrecto.");
  let packet;
  try{packet=JSON.parse(json);}catch(e){return fail("El texto no contiene JSON válido.");}
  if(!object(packet)||packet.format!==FORMAT||packet.source!=="superadmin-demo"||!object(packet.target)||
    !id(packet.target.clientId)||!id(packet.target.siteId)||!Object.hasOwn(PAGES,packet.target.plan))
    return fail("Paquete incompatible con V10.");
  if(!object(target)||!id(target.clientId)||!id(target.siteId)||!Object.hasOwn(PAGES,target.plan)||
    packet.target.clientId!==target.clientId||packet.target.siteId!==target.siteId||
    packet.target.plan!==target.plan)
    return fail("La propuesta pertenece a otro negocio, sitio o plan.");
  const normalized=normalizeProposal(packet.proposal,packet.target.plan);
  if(!normalized.ok)return normalized;
  return good({target:{clientId:packet.target.clientId,siteId:packet.target.siteId,plan:packet.target.plan},
   proposal:normalized.data});
 }
 root.MGWebProposalExchange=Object.freeze({format:FORMAT,mode:"manual-demo",
  createPackage,parsePackage});
})(typeof window!=="undefined"?window:globalThis);
