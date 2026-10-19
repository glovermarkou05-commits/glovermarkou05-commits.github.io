/* MG WEB STUDIO CLOUD · V18 · STATIC DRY-RUN VALIDATOR
 * Never executes migrations, shell commands, requests or provisioning.
 * This is not a security audit, nor authorization of real spending/deployment.
 */
(function(root){
"use strict";
const expectedSQL=[
 "db/schema_core.review.sql",
 "db/modelo-contenido-compartido.review.sql",
 "db/v13-propuestas-scopes.review.sql",
 "db/v13-endurecimiento-rls-legado.review.sql"
];
const expectedFlags=["dryRunOnly","mayProvision","mayRunMigrations","mayDeploy","mayPublish","maySendEmail","mayCharge","mayCallPaidAI"];
const stepPhases=["BEFORE","AFTER_EXPLICIT_APPROVAL"];
const forbiddenCommands=/\b(?:supabase\s+(?:db\s+(?:push|reset)|functions\s+deploy|link|login|start)|npm\s+(?:publish|deploy)|git\s+(?:push|merge)|vercel\s+(?:deploy|--prod)|netlify\s+deploy|curl\s+[^;\n]*https?:\/\/)\b/i;
const obj=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const clone=x=>JSON.parse(JSON.stringify(x));
function unique(items){return items.length===new Set(items).size;}
function inspect(manifest,env,procedure,reviewFiles){
 const blockers=[],warnings=[];
 const block=(code,why)=>blockers.push({code,why});
 if(!obj(manifest)||manifest.format!=="mg-web-studio/staging-v18-review"||manifest.version!==18){
  block("BAD_MANIFEST","Formato/versión del manifiesto no reconocidos.");
  return {valid:false,readyForStaging:false,readyForProduction:false,authorizedToDeploy:false,blockers,warnings,summary:null};
 }
 if(manifest.project!=="MG WEB STUDIO CLOUD"||
    manifest.state!=="NOT_AUTHORIZED"||
    manifest.sourceBranch!=="feature/mg-digital-v5-web-services"||
    manifest.destinationBranch!==null||
    !Array.isArray(manifest.protectedBranches)||
    !manifest.protectedBranches.includes("main"))
  block("SCOPE","El proyecto, rama protegida o estado NO GO cambiaron.");
 const auth=manifest.authorization;
 if(!obj(auth)||auth.granted!==false||auth.reference!==null||auth.approver!==null)
  block("AUTHORIZATION","No es válido incluir autorización en el paquete de revisión.");
 const target=manifest.target;
 if(!obj(target)||Object.values(target).some(x=>x!==null)||
   Object.keys(target).sort().join(",")!=="maximumMonthlyUsd,plan,projectRef,provider,region")
  block("TARGET","El paquete no debe indicar proyecto, plan, región, proveedor o presupuesto aprobados.");
 const flags=manifest.execution;
 if(!obj(flags)||expectedFlags.some(x=>typeof flags[x]!=="boolean"||
    flags[x]!== (x==="dryRunOnly")))
  block("EXECUTION","Algún indicador permitiría desplegar, pagar, enviar o ejecutar cambios.");
 if(manifest.noRealData!==true)block("PRIVACY","El paquete debe prohibir los datos reales.");
 if(!Array.isArray(manifest.sqlReviews)||!unique(manifest.sqlReviews)||
   manifest.sqlReviews.length!==expectedSQL.length||
   expectedSQL.some(x=>!manifest.sqlReviews.includes(x))||
   manifest.sqlReviews.some(x=>!/^(db\/[a-z0-9_-]+)\.review\.sql$/.test(x)))
  block("MIGRATION_LIST","El inventario debe contener exclusivamente los 4 diseños SQL conocidos.");
 if(!Array.isArray(manifest.checks)||manifest.checks.length<12||
   !unique(manifest.checks.map(x=>x.id))||
   manifest.checks.some(x=>!obj(x)||typeof x.id!=="string"||
    x.required!==true||x.status!=="pending"||x.evidenceRef!==null)||
   !manifest.checks.some(x=>x.id==="authorization")||
   !manifest.checks.some(x=>x.id==="rls_pgtest")||
   !manifest.checks.some(x=>x.id==="backup_restore"))
  block("CHECKS","Los controles del paquete deben permanecer pendientes, sin evidencia/GO inventados.");
 if(!obj(manifest.rollback)||manifest.rollback.exerciseOnly!==true||
   !Array.isArray(manifest.rollback.steps)||manifest.rollback.steps.length<5)
  block("ROLLBACK","Falta el procedimiento de reversión exclusivamente documental.");

 if(!obj(env)||env.format!=="mg-web-studio/staging-v18-env-catalog"||
   env.mode!=="names-only"||env.noValues!==true||
   !Array.isArray(env.variables)||env.variables.length<5)
   block("ENV_FORMAT","Catálogo de variables inválido.");
 else {
  const names=env.variables.map(x=>x&&x.name);
  if(!unique(names)||env.variables.some(v=>
   !obj(v)||typeof v.name!=="string"||!/^MG_STAGING_[A-Z0-9_]+$/.test(v.name)||
   !["browser","backend","ops"].includes(v.scope)||
   !["public-after-approval","server-config","server-secret","future-switch"].includes(v.classification)||
   typeof v.requiredForFuture!=="boolean"||
   ["value","default","example","secret","token","credential","apiKey"].some(k=>Object.prototype.hasOwnProperty.call(v,k))||
   (v.classification==="server-secret"&&v.scope!=="backend")||
   (v.scope==="browser"&&v.classification!=="public-after-approval")))
    block("ENV_VALUES","Detectados valores, campos desconocidos, secrets en browser o nombres duplicados.");
  for(const p of ["MG_STAGING_INTERNAL_DB_URL","MG_STAGING_SERVER_SECRET_KEY"])
   if(!env.variables.some(v=>v.name===p&&v.classification==="server-secret"&&v.scope==="backend"))
    block("SECRET_SCOPE","Falta clasificación privada de "+p+".");
 }
 if(!obj(procedure)||procedure.format!=="mg-web-studio/staging-v18-procedure"||
   procedure.mode!=="review-only"||!Array.isArray(procedure.executables)||
   procedure.executables.length!==0||
   !Array.isArray(procedure.sequence)||procedure.sequence.length<6)
  block("PROCEDURE_FORMAT","La secuencia no puede incluir ejecutables.");
 else {
  if(!unique(procedure.sequence.map(x=>x.id))||
   procedure.sequence.some(x=>!obj(x)||typeof x.id!=="string"||
    !stepPhases.includes(x.phase)||typeof x.action!=="string"||
    x.action.length<20||forbiddenCommands.test(x.action)||
    (x.phase==="BEFORE"&&x.kind==="executable")))
   block("PROCEDURE_UNSAFE","La secuencia contiene un comando o acción incompatible con el dry-run.");
  if(!procedure.sequence.some(x=>x.id==="smoke")||
    !procedure.sequence.some(x=>x.id==="local_rls")||
    !procedure.sequence.some(x=>x.id==="gate"))
   block("PROCEDURE_INCOMPLETE","Faltan las etapas futuras de smoke, RLS o firma GO.");
 }
 if(!obj(reviewFiles))block("SQL_INPUT","Los archivos SQL deben proporcionarse como texto para inspección.");
 else {
  for(const path of expectedSQL){
   const source=reviewFiles[path];
   if(typeof source!=="string"||source.length<100){
    block("SQL_MISSING","No se recibió "+path+".");continue;
   }
   const firstLines=source.slice(0,650).toLowerCase();
   if(!firstLines.includes("no es una migración")&&
      !firstLines.includes("no es migración")&&
      !firstLines.includes("no migración")&&
      !firstLines.includes("no ejecutar")){
     block("SQL_DISCLAIMER","El archivo "+path+" debe permanecer marcado NO EJECUTAR.");
   }
   if(path.includes("v13-propuestas-scopes")&&!source.includes("mg_can_access_site"))
    block("SQL_SCOPE","Falta revisión de control tenant/sitio.");
   if(path.includes("v13-endurecimiento")&&!source.includes("drop policy"))
    block("SQL_RLS","Falta la sustitución de políticas heredadas.");
  }
  for(const p of Object.keys(reviewFiles))
   if(!expectedSQL.includes(p))warnings.push("Se omitió del análisis un archivo adicional sin revisar.");
 }
 if(!blockers.length){
  warnings.push("Los controles técnicos y autorizaciones reales siguen sin verificarse: NO GO.");
  warnings.push("Los SQL revisados NO están probados con PostgreSQL y pueden contener incompatibilidades.");
 }
 return clone({valid:blockers.length===0,readyForStaging:false,readyForProduction:false,
  authorizedToDeploy:false,simulationOnly:true,
  blockers,warnings,
  summary:{reviewSqlExpected:expectedSQL.length,reviewSqlLoaded:obj(reviewFiles)?
    expectedSQL.filter(path=>typeof reviewFiles[path]==="string").length:0,
   prerequisitesPending:Array.isArray(manifest.checks)?
    manifest.checks.filter(x=>x.status==="pending").length:null,
   commandCount:obj(procedure)&&Array.isArray(procedure.executables)?
    procedure.executables.length:null,
   secretValuesProvided:false}});
}
function redactReport(audit){
 if(!obj(audit)||!Array.isArray(audit.blockers)||!Array.isArray(audit.warnings))
   return "NO GO. Evaluación no disponible.";
 const lines=["MG WEB STUDIO CLOUD — V18 · SOLO REVISIÓN EN SECO",
 "Estado: NO GO · No autoriza despliegue, gastos, SQL ni publicación",
 "Validez estructural: "+(audit.valid?"Comprobación estática correcta":"Detectadas inconsistencias"),
 "SQL de revisión cargados: "+(audit.summary?audit.summary.reviewSqlLoaded:"?")+"/4",
 "Requisitos pendientes: "+(audit.summary?audit.summary.prerequisitesPending:"?"),
 "Bloqueos de formato: "+audit.blockers.map(x=>x.code).join(", "),
 "Limitación: no se ejecutó SQL, HTTP, migración, CLI, RLS ni navegador real."];
 return lines.join("\n");
}
root.MGStagingPackageV18=Object.freeze({version:"18.0-review",inspect,redactReport,
 expectedSQL:expectedSQL.slice()});
})(typeof window!=="undefined"?window:globalThis);
