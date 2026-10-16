/* MG WEB STUDIO CLOUD — SIMULADOR DE PERSISTENCIA V1
 * Sin red, disco, localStorage, cookies, base de datos ni usuarios reales.
 * Un repository es un estado VOLÁTIL dentro de una instancia JS; no sincroniza
 * pestañas ni documentos HTML distintos. Autorización aquí es únicamente demo.
 */
(function(root){
 "use strict";
 var CAPABILITIES={
  CLIENT_OWNER:{read:true,edit:true,publish:true},
  CLIENT_ADMIN:{read:true,edit:true,publish:true},
  CLIENT_EDITOR:{read:true,edit:true,publish:false},
  CLIENT_VIEWER:{read:true,edit:false,publish:false}
 };
 function clone(v){return JSON.parse(JSON.stringify(v));}
 function reply(ok,status,body){return clone(Object.assign({ok:ok,status:status},body||{}));}
 function validKey(v){return typeof v==="string"&&/^[a-z][a-z0-9_-]{0,63}$/.test(v);}
 function validOperationId(v){return typeof v==="string"&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{5,99}$/.test(v);}
 function safeDocument(d){
  if(!d||typeof d!=="object"||Array.isArray(d))return false;
  if(!Array.isArray(d.pages)||d.pages.length<1||d.pages.length>25)return false;
  if(!d.shared||typeof d.shared!=="object"||Array.isArray(d.shared))return false;
  var keys=new Set();
  for(var i=0;i<d.pages.length;i++){
   var p=d.pages[i];
   if(!p||!validKey(p.id)||typeof p.title!=="string"||p.title.trim().length<2||p.title.length>150||keys.has(p.id))return false;
   keys.add(p.id);
  }
  if(!keys.has("home"))return false;
  try{return JSON.stringify(d).length<=65536;}catch(e){return false;}
 }
 function createRepository(input){
  if(!input||typeof input.directory!=="function"||!Array.isArray(input.initialDocuments))
   throw new TypeError("Se requiere directorio de prueba y documentos iniciales.");
  var documents=new Map(),releases=new Map(),changes=new Map(),seen=new Map(),listeners=new Map();
  input.initialDocuments.forEach(function(x){
   if(!validKey(x.clientId)||!validKey(x.siteId)||!safeDocument(x.draft))throw new TypeError("Documento inicial inválido.");
   var k=x.clientId+"/"+x.siteId;if(documents.has(k))throw new TypeError("Sitio duplicado.");
   documents.set(k,{version:1,draft:clone(x.draft),activeRelease:0});
   releases.set(k,[]);changes.set(k,[]);listeners.set(k,new Set());
  });
  function directory(){
   var d=input.directory();
   if(!d||!Array.isArray(d.organizations)||!Array.isArray(d.sites)||!Array.isArray(d.members))
    throw new TypeError("Directorio de prueba inválido.");
   return d;
  }
  function authorize(ctx,action){
   if(!ctx||!validKey(ctx.clientId)||!validKey(ctx.siteId)||!validKey(ctx.memberId))
    return {error:reply(false,400,{error:"Contexto de demostración inválido."})};
   var d=directory(),org=d.organizations.find(function(o){return o.id===ctx.clientId;});
   var site=d.sites.find(function(s){return s.id===ctx.siteId&&s.clientId===ctx.clientId;});
   var member=d.members.find(function(m){return m.id===ctx.memberId&&m.clientId===ctx.clientId;});
   if(!org||!site||!member||member.status!=="Activo (demo)"||!CAPABILITIES[member.role]||!CAPABILITIES[member.role][action])
    return {error:reply(false,403,{error:"Acceso denegado en simulación."})};
   if(member.scope==="selected"&&(!Array.isArray(member.siteIds)||!member.siteIds.includes(ctx.siteId)))
    return {error:reply(false,403,{error:"Sitio fuera del alcance de demostración."})};
   if(member.scope==="all"&&!["CLIENT_OWNER","CLIENT_ADMIN"].includes(member.role))
    return {error:reply(false,403,{error:"Alcance de demostración inválido."})};
   if(member.scope!=="selected"&&member.scope!=="all")
    return {error:reply(false,403,{error:"Alcance no asignado."})};
   var key=ctx.clientId+"/"+ctx.siteId;
   if(!documents.has(key))return {error:reply(false,404,{error:"No hay documento ficticio para este sitio."})};
   return {key:key};
  }
  function readSite(ctx){
   var a=authorize(ctx,"read");if(a.error)return Promise.resolve(a.error);
   var d=documents.get(a.key),r=releases.get(a.key);
   return Promise.resolve(reply(true,200,{clientId:ctx.clientId,siteId:ctx.siteId,
    version:d.version,draft:d.draft,releaseNumber:d.activeRelease,releases:r.length}));
  }
  function previousOperation(ctx,kind,operationId,payload){
   if(!validOperationId(operationId))return {error:reply(false,400,{error:"Clave de operación ficticia inválida."})};
   var id=ctx.clientId+"/"+ctx.siteId+"/"+ctx.memberId+"/"+operationId;
   var fingerprint=JSON.stringify({kind:kind,payload:payload});
   var old=seen.get(id);
   if(old)return old.fingerprint===fingerprint?
    {result:Object.assign(clone(old.result),{replayed:true})}:
    {error:reply(false,409,{error:"Esta clave de operación ya se usó para otra solicitud."})};
   return {id:id,fingerprint:fingerprint};
  }
  function commit(a,ctx,kind,operation,body){
   var row=documents.get(a.key);
   row.version+=1;
   var event={kind:kind,version:row.version,clientId:ctx.clientId,siteId:ctx.siteId,
    at:new Date().toISOString()};
   changes.get(a.key).push(event);
   var response=reply(true,200,Object.assign({version:row.version,operationId:operation},body||{}));
   seen.set(operation.id,{fingerprint:operation.fingerprint,result:response});
   listeners.get(a.key).forEach(function(sub){
    if(!authorize(sub.ctx,"read").error){
     try{sub.fn(clone(event));}catch(err){/* Listener local no revierte operación confirmada */}
    }
   });
   return response;
  }
  function writeDraft(args){
   args=args||{};var ctx=args.context;
   var a=authorize(ctx,"edit");if(a.error)return Promise.resolve(a.error);
   if(!safeDocument(args.draft))return Promise.resolve(reply(false,422,{error:"Borrador inválido."}));
   var operation=previousOperation(ctx,"draft",args.operationId,{expectedVersion:args.expectedVersion,draft:args.draft});
   if(operation.error||operation.result)return Promise.resolve(operation.error||operation.result);
   var d=documents.get(a.key);
   if(!Number.isSafeInteger(args.expectedVersion)||args.expectedVersion!==d.version)
    return Promise.resolve(reply(false,409,{error:"Conflicto: recarga antes de guardar.",currentVersion:d.version}));
   d.draft=clone(args.draft);
   return Promise.resolve(commit(a,ctx,"draft",operation,{saved:true}));
  }
  function publish(args){
   args=args||{};var ctx=args.context,a=authorize(ctx,"publish");
   if(a.error)return Promise.resolve(a.error);
   var operation=previousOperation(ctx,"publish",args.operationId,{expectedVersion:args.expectedVersion});
   if(operation.error||operation.result)return Promise.resolve(operation.error||operation.result);
   var d=documents.get(a.key);
   if(!Number.isSafeInteger(args.expectedVersion)||args.expectedVersion!==d.version)
    return Promise.resolve(reply(false,409,{error:"Conflicto de publicación.",currentVersion:d.version}));
   var list=releases.get(a.key),n=list.length+1;
   list.push({number:n,draft:clone(d.draft),createdAt:new Date().toISOString(),authorDemo:ctx.memberId});
   d.activeRelease=n;
   return Promise.resolve(commit(a,ctx,"publish",operation,{releaseNumber:n}));
  }
  function readReleases(ctx){
   var a=authorize(ctx,"read");if(a.error)return Promise.resolve(a.error);
   return Promise.resolve(reply(true,200,{items:releases.get(a.key),active:documents.get(a.key).activeRelease}));
  }
  function readChanges(ctx,afterVersion){
   var a=authorize(ctx,"read");if(a.error)return Promise.resolve(a.error);
   if(!Number.isSafeInteger(afterVersion)||afterVersion<0)return Promise.resolve(reply(false,400,{error:"Versión de cursor inválida."}));
   var events=changes.get(a.key).filter(function(e){return e.version>afterVersion;});
   return Promise.resolve(reply(true,200,{items:events,version:documents.get(a.key).version}));
  }
  function subscribe(ctx,fn){
   var a=authorize(ctx,"read");
   if(a.error||typeof fn!=="function")return {ok:false,unsubscribe:function(){}};
   var entry={ctx:clone(ctx),fn:fn};
   listeners.get(a.key).add(entry);
   return {ok:true,unsubscribe:function(){listeners.get(a.key).delete(entry);}};
  }
  return Object.freeze({
   version:"1.0.0",mode:"volatile-demo",readSite:readSite,saveDraft:writeDraft,
   publishSite:publish,readReleases:readReleases,readChanges:readChanges,subscribe:subscribe
  });
 }
 root.MGWebStudioPersistence=Object.freeze({version:"1.0.0",mode:"volatile-demo",createRepository:createRepository});
})(typeof window!=="undefined"?window:globalThis);
