/* MG WEB STUDIO CLOUD — V16 — adaptador de servicios para LABORATORIOS LOCALES
 * No abre conexiones HTTP, NO recibe credenciales, NO autentica al usuario.
 * El modo remoto deliberadamente NO ESTÁ IMPLEMENTADO (fail-closed).
 * Contrato preparado para reemplazar SOLO tras autorización de infraestructura.
 */
(function(root){
"use strict";
const VERSION="16.0-demo";
const allowedMethods=["GET","POST"];
const patterns=[
 {type:"notifications",method:"GET",re:/^\/api\/v1\/me\/notifications$/},
 {type:"notification-read",method:"POST",re:/^\/api\/v1\/me\/notifications\/n[1-9][0-9]*\/read$/},
 {type:"admin-outbox",method:"GET",re:/^\/api\/v1\/admin\/outbox$/},
 {type:"site-draft",method:"GET",re:/^\/api\/v1\/organizations\/[a-z][a-z0-9_-]{0,63}\/sites\/[a-z][a-z0-9_-]{0,63}\/draft$/},
 {type:"proposals",method:"GET",re:/^\/api\/v1\/organizations\/[a-z][a-z0-9_-]{0,63}\/sites\/[a-z][a-z0-9_-]{0,63}\/proposals$/},
 {type:"proposal-create",method:"POST",re:/^\/api\/v1\/organizations\/[a-z][a-z0-9_-]{0,63}\/sites\/[a-z][a-z0-9_-]{0,63}\/proposals$/},
 {type:"proposal-get",method:"GET",re:/^\/api\/v1\/organizations\/[a-z][a-z0-9_-]{0,63}\/sites\/[a-z][a-z0-9_-]{0,63}\/proposals\/p[1-9][0-9]*$/},
 {type:"proposal-action",method:"POST",re:/^\/api\/v1\/organizations\/[a-z][a-z0-9_-]{0,63}\/sites\/[a-z][a-z0-9_-]{0,63}\/proposals\/p[1-9][0-9]*\/(submit|review|revise|apply)$/},
 {type:"site-events",method:"GET",re:/^\/api\/v1\/organizations\/[a-z][a-z0-9_-]{0,63}\/sites\/[a-z][a-z0-9_-]{0,63}\/events$/}
];
const readOnly={GET:true};
const clone=x=>JSON.parse(JSON.stringify(x));
const goodResult=x=>!!x&&Number.isSafeInteger(x.status)&&x.status>=200&&x.status<=599&&
 x.body&&typeof x.body==="object"&&!Array.isArray(x.body)&&x.headers&&typeof x.headers==="object";
function error(status,code,message){
 return {status,headers:{"Cache-Control":"no-store"},body:{ok:false,error:{code,message}}};
}
function createDemoAdapter(options){
 if(!options||options.mode&&options.mode!=="demo")throw new TypeError("Solo modo demo autorizado: el backend real está deshabilitado.");
 if(!options.api||options.api.mode!=="transactional-memory-mock"||typeof options.api.request!=="function")
 throw new TypeError("Se requiere un motor V14/V15 ficticio, no un transporte HTTP real.");
 if(options.baseUrl||options.token||options.headers||options.fetch||options.transport||options.credentials)
 throw new TypeError("Este adaptador NO acepta URL, claves, credenciales ni transporte externo.");
 const max=options.maxTraceRecords===undefined?60:options.maxTraceRecords;
 if(!Number.isSafeInteger(max)||max<1||max>200)throw new TypeError("maxTraceRecords fuera de rango.");
 let sequence=0,events=[],metrics={total:0,success:0,clientError:0,serverError:0,denied:0,replayed:0,transportFaults:0};
 function routeFor(method,path){
  if(!allowedMethods.includes(method)||typeof path!=="string"||path.length>300||path.includes("?")||path.includes("#"))
   return null;
  return patterns.find(x=>x.method===method&&x.re.test(path))||null;
 }
 function record(type,result,fault){
  const status=result.status;
  metrics.total++;if(status>=200&&status<300)metrics.success++;
  if(status>=400&&status<500)metrics.clientError++;
  if(status>=500)metrics.serverError++;
  if(status===401||status===403)metrics.denied++;
  if(result.headers["Idempotency-Replayed"]==="true")metrics.replayed++;
  if(fault)metrics.transportFaults++;
  events.push({sequence:++sequence,type:type||"denied-request",status,
   code:result.body&&result.body.error&&/^[A-Z0-9_]{1,35}$/.test(result.body.error.code||"")?
    result.body.error.code:"STATUS_"+status,
   replayed:result.headers["Idempotency-Replayed"]==="true"});
  if(events.length>max)events=events.slice(-max);
 }
 async function request(input){
  const req=input||{},method=String(req.method||"GET").toUpperCase();
  const route=routeFor(method,req.path);
  if(!route){
   const denied=error(400,"INVALID_REQUEST","Ruta o método no permitido en el adaptador local.");
   record("invalid-route",denied,false);return denied;
  }
  if(["role","userId","accessToken","authorization","cookies","session"].some(k=>Object.prototype.hasOwnProperty.call(req,k))){
   const denied=error(400,"FORGED_IDENTITY","No se permiten roles ni credenciales dentro del objeto de solicitud.");
   record(route.type,denied,false);return denied;
  }
  if(req.query!==undefined&&(!req.query||typeof req.query!=="object"||Array.isArray(req.query)||
     Object.keys(req.query).some(k=>k!=="after"))){
   const denied=error(400,"INVALID_QUERY","Parámetros de consulta no permitidos.");
   record(route.type,denied,false);return denied;
  }
  if(!readOnly[method]&&(typeof req.operationId!=="string"||req.operationId.length<8||req.operationId.length>100)){
   const denied=error(400,"OPERATION_KEY_REQUIRED","Las escrituras necesitan clave de operación de demostración.");
   record(route.type,denied,false);return denied;
  }
  if(req.body!==undefined&&(!req.body||typeof req.body!=="object"||Array.isArray(req.body))){
   const denied=error(400,"INVALID_BODY","Cuerpo de solicitud de prueba inválido.");
   record(route.type,denied,false);return denied;
  }
  let response,transportFault=false;
  try {
   const clean={method,path:req.path,body:clone(req.body||{}),
    operationId:req.operationId,query:clone(req.query||{}),fixture:req.fixture};
   response=await options.api.request(clean);
   if(!goodResult(response)){
    transportFault=true;response=error(502,"BAD_DEMO_RESPONSE","Respuesta de simulación incompatible.");
   }
  }catch(e){
   transportFault=true;
   response=error(503,"DEMO_UNAVAILABLE","Transporte de demostración no disponible.");
  }
  const sanitized={status:response.status,headers:clone(response.headers),body:clone(response.body)};
  sanitized.headers["Cache-Control"]="no-store";
  record(route.type,sanitized,transportFault);
  return sanitized;
 }
 function getTelemetry(){
  return clone({mode:"demo",version:VERSION,metrics,events});
 }
 function clearTelemetry(){events=[];metrics={total:0,success:0,clientError:0,serverError:0,denied:0,replayed:0,transportFaults:0};sequence=0;}
 return Object.freeze({mode:"demo",version:VERSION,request,getTelemetry,clearTelemetry});
}
function createRemoteAdapter(){
 throw new Error("Backend V16 deshabilitado: requiere autorización, Auth/MFA real, RLS, privacidad y auditoría.");
}
root.MGWebStudioServiceAdapter=Object.freeze({version:VERSION,createDemoAdapter,createRemoteAdapter});
})(typeof window!=="undefined"?window:globalThis);
