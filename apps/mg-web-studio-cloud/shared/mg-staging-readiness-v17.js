/* MG WEB STUDIO CLOUD · V17
 * EVALUACIÓN NO VINCULANTE: no autentica, autoriza, publica ni conecta servicios.
 * Todas las verificaciones del navegador son HIPOTÉTICAS y no equivalen a QA real.
 */
(function(root) {
"use strict";
const CATEGORIES={
 business:"Gobierno y presupuesto",infrastructure:"Infraestructura aislada",
 security:"Identidad y seguridad",data:"Datos y recuperación",
 delivery:"Calidad y despliegue",operations:"Operación y monitoreo"};
const REQUIREMENTS=[
 ["approval","business","Aprobación expresa del entorno, proveedor y límite de gasto","stage",true,"Acta o mensaje de autorización específica; no la sustituye esta demo"],
 ["budget","business","Presupuesto mensual máximo, alertas de consumo y responsable","stage",true,"Presupuesto escrito y captura de topes configurados"],
 ["region","business","Región de datos y tratamiento de información revisados","stage",true,"Decisión de región, privacidad y residencia de datos"],
 ["scope","business","Alcance de staging y exclusiones aprobados","stage",true,"Alcance separado de FINZY, BAZAR y otros proyectos"],
 ["ai_billing","business","IA externa y cobros reales desactivados por defecto","stage",true,"Prueba sin claves activas, sin cobros ni autopublicación"],
 ["independent_project","infrastructure","Proyecto aislado y sin reutilizar otros proyectos","stage",true,"Identificador de proyecto aislado, sin producción compartida"],
 ["private_secrets","infrastructure","Secretos solo en backend y separación de ambientes","stage",true,"Escaneo del repositorio y de configuración sin claves expuestas"],
 ["preview_dns","infrastructure","Dominio de pruebas separado y controlado","stage",false,"URL de staging, no usar DNS de producción"],
 ["migration_plan","data","Migraciones V13 revisadas y plan de reversión","stage",true,"Revisión técnica firmada; la documentación no es una migración"],
 ["schema_compat","data","Compatibilidad de esquema y ruta de Home validadas","stage",true,"Prueba en base temporal; la demo usa un slug Home distinto"],
 ["rls_test","security","RLS real por empresa, sitio y acción","stage",true,"Prueba SQL con varias identidades; no basta validación estática"],
 ["auth_mfa","security","Sesiones reales y MFA obligatorio en SUPERADMIN","stage",true,"Pruebas con sesión, MFA y revocación verificables"],
 ["no_client_trust","security","Autorización del servidor, nunca desde parámetros del navegador","stage",true,"Revisión anti-IDOR/BOLA, scopes y privilegios"],
 ["api_safe","security","API y Data API con GRANT, RLS y CORS controlados","stage",true,"Inspección de grants, endpoints expuestos y políticas"],
 ["test_accounts","delivery","Cuentas y datos ficticios sin datos de clientes","stage",true,"Usuarios de prueba, aislados y eliminables"],
 ["smoke","delivery","Smoke test, healthchecks y despliegue reversible","stage",true,"Pruebas automatizadas post-despliegue en staging"],
 ["recovery_plan","data","Plan de respaldo, RPO/RTO y restauración probado","stage",true,"Ensayo real de restauración; los checkpoints JS no cuentan"],
 ["observability","operations","Trazas y alertas sin datos privados ni secretos","stage",false,"Ejemplos de logs, retención y alertas verificadas"],
 ["rate_limit","security","Protecciones antiabuso, límites, CSRF/cookies","stage",false,"Prueba de rate limit, sesiones/cookies y cabeceras"],
 ["spend_alerts","operations","Límites y avisos de consumo comprobados","stage",true,"Captura de spend cap o regla con confirmación del proveedor"],
 ["tenant_e2e","delivery","E2E multiempresa y varios sitios de la misma empresa","production",true,"Tests de OWNER/ADMIN/EDITOR/VIEWER, otro tenant y revocados"],
 ["multi_device","delivery","Sincronización entre sesiones y dispositivos reales","production",true,"Pruebas concurrentes con navegador independiente"],
 ["transaction","data","CAS, idempotencia, rollback y outbox en PostgreSQL","production",true,"Prueba transaccional y reinicio de servicio"],
 ["restore_proven","data","Backups automáticos y recuperación real verificados","production",true,"Registro de ensayo RTO/RPO de staging"],
 ["privacy","business","Aviso de privacidad, retención y consentimiento","production",true,"Revisión aplicable a las operaciones y ubicación elegida"],
 ["security_review","security","Auditoría externa/interna de sesiones, RLS y storage","production",true,"Informe de hallazgos críticos solucionados"],
 ["release","delivery","Firma de aprobación humana y plan de rollback","production",true,"Aprobación explícita de publicación, dominio y reversión"],
 ["payments","business","Cobros/desembolsos y pasarela aprobados aparte","production",true,"Aprobación comercial y financiera independiente"],
 ["ai_provider","business","Proveedor IA, privacidad, presupuesto y cuotas aprobados aparte","production",true,"Solo activar tras revisión de datos y claves de servidor"],
 ["incident","operations","Plan de incidentes, soporte y dueños definidos","production",false,"Runbook probado y responsables designados"],
 ["mobile_a11y","delivery","QA en móvil, accesibilidad y carga","production",false,"Capturas y reporte de rendimiento y accesibilidad"],
 ["dns_tls","infrastructure","Dominio público, TLS y acceso de producción aprobados","production",true,"Prueba de certificados y publicación autorizada"]
].map(x=>Object.freeze({id:x[0],category:x[1],title:x[2],gate:x[3],critical:x[4],evidenceHint:x[5]}));
const validStatuses=["pending","documented","simulated_checked"];
const copy=v=>JSON.parse(JSON.stringify(v));
function evaluate(records){
 const entries=records&&typeof records==="object"&&!Array.isArray(records)?records:{};
 const ids=new Set(REQUIREMENTS.map(x=>x.id));
 const errors=[];
 for(const id of Object.keys(entries)){
   if(!ids.has(id)){errors.push("ID desconocido: "+id);continue;}
   const rec=entries[id];
   if(!rec||typeof rec!=="object"||Array.isArray(rec)||
      !validStatuses.includes(rec.status)||typeof rec.evidence!=="string"||
      rec.evidence.length>350||/[<>]|[\u0000-\u001f]/.test(rec.evidence))
     errors.push("Registro inválido: "+id);
   else if(rec.status!=="pending"&&rec.evidence.trim().length<5)
     errors.push("Falta descripción de evidencia ficticia para "+id);
 }
 const summary={total:REQUIREMENTS.length,pending:0,documented:0,simulated_checked:0};
 const stage=[],production=[];
 for(const item of REQUIREMENTS){
  const rec=entries[item.id],valid=rec&&validStatuses.includes(rec.status)&&typeof rec.evidence==="string"&&rec.evidence.trim().length>=5;
  const status=valid?rec.status:"pending";summary[status]++;
  const unmet=status!=="simulated_checked";
  const row={id:item.id,title:item.title,category:item.category,critical:item.critical,gate:item.gate,status,
     evidence:valid?rec.evidence.trim():"",unmet};
  if(item.gate==="stage")stage.push(row);else production.push(row);
 }
 const stageBlocking=stage.filter(item=>item.critical&&item.unmet);
 const prodBlocking=production.filter(item=>item.critical&&item.unmet);
 const blockers=stageBlocking.concat(prodBlocking);
 const stageReadyHypothetical=!errors.length&&stageBlocking.length===0&&stage.every(x=>!x.unmet);
 const productionReadyHypothetical=stageReadyHypothetical&&production.every(x=>!x.unmet);
 return copy({mode:"simulation-no-authorization",valid:errors.length===0,errors,summary,
  stage:{count:stage.length,pending:stage.filter(x=>x.unmet).length,blockers:stageBlocking,
   hypothetical:stageReadyHypothetical},
  production:{count:production.length,pending:production.filter(x=>x.unmet).length,
   blockers:prodBlocking,hypothetical:productionReadyHypothetical},
  blockers,actualAuthorization:false,actualStagingDeployed:false,actualProductionPublished:false});
}
function budget(scenario){
 const kind=typeof scenario==="string"?scenario:"unselected";
 if(!["unselected","free","pro_new","pro_extra"].includes(kind))
  return {ok:false,error:"Escenario de presupuesto no reconocido."};
 const out={
  unselected:{minimumMonthlyUsd:null,label:"Por decidir",detail:"Elegir proveedor, plan y cupos antes de autorizar cualquier gasto."},
  free:{minimumMonthlyUsd:0,label:"Free (referencia)",detail:"Sujeto a límites de proyectos gratuitos y pausa por inactividad; no incluye backups automáticos. No asumir apto para staging durable."},
  pro_new:{minimumMonthlyUsd:25,label:"Pro en organización sin Pro previo",detail:"Suscripción desde USD 25/mes con 1 instancia Micro cubierta por créditos. No incluye excedentes ni servicios adicionales."},
  pro_extra:{minimumMonthlyUsd:10,label:"Micro adicional en organización Pro existente",detail:"Costo incremental desde USD 10/mes por proyecto Micro adicional; asume que la suscripción Pro ya se paga. No incluye extras."}
 }[kind];
 return {ok:true,scenario:kind,currency:"USD",...out,
  estimateOnly:true,source:"https://supabase.com/pricing",
  exclusions:["Impuestos, backups extras, almacenamiento, egreso, funciones, correos, dominio, IA, pasarela y otros servicios","Sujeto a tarifas y elegibilidad actuales del proveedor"]};
}
root.MGStageGateV17=Object.freeze({version:"17.0-review",categories:copy(CATEGORIES),
 requirements:copy(REQUIREMENTS),statuses:validStatuses.slice(),evaluate,budget});
})(typeof window!=="undefined"?window:globalThis);
