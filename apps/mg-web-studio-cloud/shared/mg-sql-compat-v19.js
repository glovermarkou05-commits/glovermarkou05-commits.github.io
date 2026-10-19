/* MG WEB STUDIO CLOUD | V19 | AUDITORÍA SQL ESTÁTICA
 * NO parser PostgreSQL, no SQL ejecutable, no permisos, red ni servidor.
 * Detecta regresiones conocidas en borradores de esquemas y API de demostración.
 */
(function(root){
"use strict";
const ORDER=[
 "db/schema_core.review.sql",
 "db/modelo-contenido-compartido.review.sql",
 "db/v13-propuestas-scopes.review.sql",
 "db/v13-endurecimiento-rls-legado.review.sql"
];
const EXTERNAL=new Set(["auth.users"]);
const EXPECTED_STATUS=["draft","submitted","needs_changes","rejected","approved","applied"];
const ACTUAL_TABLES=["public.mg_sites","public.mg_pages","public.mg_memberships",
 "public.mg_site_identity","public.mg_site_products","public.mg_site_promotions",
 "public.mg_site_proposals","public.mg_proposal_revisions","public.mg_proposal_reviews",
 "public.mg_proposal_notifications","public.mg_notification_reads",
 "public.mg_membership_site_scopes","public.mg_site_draft_versions"];
const SCOPE_TABLES=["public.mg_sites","public.mg_pages","public.mg_domains",
 "public.mg_site_identity","public.mg_site_products","public.mg_site_promotions"];
const clean=s=>s.replace(/--[^\n]*/g,"").replace(/\/\*[\s\S]*?\*\//g,"");
const norm=s=>s.replace(/\s+/g," ").trim();
const obj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const clone=v=>JSON.parse(JSON.stringify(v));
function findTables(sql,path){
 const found=[],matcher=/create\s+table\s+(?:if\s+not\s+exists\s+)?((?:public|mg_private)\.[a-z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
 let m;
 while((m=matcher.exec(sql))){
  const refs=[...m[2].matchAll(/\breferences\s+((?:public|mg_private|auth)\.[a-z0-9_]+)/gi)].map(x=>x[1].toLowerCase());
  found.push({name:m[1].toLowerCase(),path,references:[...new Set(refs)].sort(),
   hasRls:new RegExp("alter\\s+table\\s+"+m[1].replace(".","\\.")+"\\s+enable\\s+row\\s+level\\s+security\\s*;","i").test(sql)});
 }
 return found;
}
function policyTransitions(sources){
 const live=new Map(),events=[];
 for(const path of ORDER){
  const sql=clean(sources[path]||"");
  const re=/\b(create\s+policy\s+([a-z0-9_]+)\s+on\s+((?:public|mg_private)\.[a-z0-9_]+)|drop\s+policy\s+if\s+exists\s+([a-z0-9_]+)\s+on\s+((?:public|mg_private)\.[a-z0-9_]+))/gi;
  for(let m;(m=re.exec(sql));){
   const action=m[2]?"create":"drop";
   const policy=(m[2]||m[4]).toLowerCase(),table=(m[3]||m[5]).toLowerCase();
   const key=table+"/"+policy;
   if(action==="create")live.set(key,{table,policy,path});
   else live.delete(key);
   events.push({action,table,policy,path});
  }
 }
 return {live:[...live.values()],events};
}
function assess(input){
 const issues=[],add=(code,severity,detail,files)=>issues.push({code,severity,detail,files});
 const supplied=input&&input.sqlReviews;
 const sqlReady=obj(supplied);
 const texts={};
 for(const path of ORDER){
  const original=sqlReady?supplied[path]:null;
  if(typeof original!=="string"||original.length<80)
   add("SQL_SOURCE_MISSING","blocker","Falta el borrador SQL "+path,[path]);
  else texts[path]=clean(original);
 }
 const authorized=input&&input.manifest&&input.manifest.authorization&&input.manifest.authorization.granted===true;
 if(authorized)add("UNEXPECTED_AUTHORIZATION","blocker","Este analizador es exclusivamente de revisión, no admite autorización activa.",[]);
 const suppliedManifest=input&&input.manifest;
 if(!obj(suppliedManifest)||suppliedManifest.state!=="NOT_AUTHORIZED"||
   !obj(suppliedManifest.execution)||suppliedManifest.execution.mayRunMigrations!==false||
   suppliedManifest.execution.mayDeploy!==false||suppliedManifest.execution.mayPublish!==false||
   suppliedManifest.execution.dryRunOnly!==true)
  add("NOT_DRY_RUN","blocker","El manifiesto debe mantener todos los despliegues bloqueados.",[]);
 const created=[],seen=new Map();
 for(const path of ORDER){
  if(!texts[path])continue;
  for(const t of findTables(texts[path],path)){
   if(seen.has(t.name))add("DUPLICATE_TABLE","blocker","Tabla "+t.name+" creada más de una vez.",[seen.get(t.name),path]);
   else seen.set(t.name,path);
   created.push(t);
  }
 }
 for(const table of created){
  if(!table.hasRls)add("RLS_DISABLED","blocker","No se encontró ENABLE RLS en "+table.name,[table.path]);
  for(const dependency of table.references)
   if(!EXTERNAL.has(dependency)&&!seen.has(dependency))
    add("UNRESOLVED_FK","blocker",table.name+" refiere tabla ausente "+dependency,[table.path]);
 }
 let positions=new Set(EXTERNAL),dependencyViolations=0;
 for(const table of created){
  for(const dep of table.references){
   if(!positions.has(dep)){dependencyViolations++;add("FK_ORDER","blocker",
    table.name+" declara dependencia antes de "+dep+".",[table.path]);}
  }
  positions.add(table.name);
 }
 const core=texts[ORDER[0]]||"",v13=texts[ORDER[2]]||"",patch=texts[ORDER[3]]||"";
 if(!/create\s+table\s+public\.mg_pages\s*\([\s\S]*?\bslug\s+text\s+not\s+null\s+check\s*\(\s*slug\s*~\s*'\^\[a-z0-9\]/i.test(core))
  add("HOME_RULE_MISSING","blocker","No se identifica el contrato de slug de las páginas.",[ORDER[0]]);
 else if(typeof input.demoCode==="string"&&/\bslug\s*:\s*["\x27]{2}/.test(input.demoCode))
  add("HOME_SLUG_CONFLICT","blocker","El SQL impide slug vacío en páginas; la demo usa slug=\"\" para Inicio.",[ORDER[0],"shared/mg-transactional-api-v14-demo.js"]);
 else add("DEMO_INPUT_MISSING","review","No se suministró demoCode para comparar la página Inicio.",[]);
 const realStatusMatch=v13.match(/create\s+table\s+public\.mg_site_proposals\s*\([\s\S]*?\bstatus\s+text\s+not\s+null\s+default\s+'draft'\s*check\s*\(\s*status\s+in\s*\(([^)]*)\)/i);
 const sqlStatuses=realStatusMatch?[...realStatusMatch[1].matchAll(/'([^']+)'/g)].map(m=>m[1]):[];
 if(!sqlStatuses.length)add("STATUS_ENUM_MISSING","blocker","No se encontró CHECK explícito de estados de propuestas.",[ORDER[2]]);
 else if(!EXPECTED_STATUS.every(x=>sqlStatuses.includes(x))||!sqlStatuses.every(x=>EXPECTED_STATUS.includes(x)))
  add("STATUS_CONTRACT_MISMATCH","blocker","SQL: "+sqlStatuses.join(", ")+"; simulador: "+EXPECTED_STATUS.join(", ")+".",[ORDER[2],"shared/mg-transactional-api-v14-demo.js"]);
 if(!/create\s+function\s+mg_private\.mg_can_access_site/i.test(v13)||
    !/security\s+definer/i.test(v13))
  add("SCOPE_FUNCTION_MISSING","blocker","Falta helper privado de permisos por sitio.",[ORDER[2]]);
 else add("SECURITY_DEFINER_REVIEW","review","Auditar propietario/bypass RLS/search_path/EXECUTE del helper privilegiado en staging.",[ORDER[2]]);
 if(!/grant\s+usage\s+on\s+schema\s+mg_private\s+to\s+authenticated\s*;/i.test(v13))
  add("HELPER_EXECUTION_REVIEW","review","Comprobar acceso real a función privada y no exposición accidental de otras funciones.",[ORDER[2]]);
 if(!/unique\s*\(\s*id\s*,\s*organization_id\s*\)/i.test(core))
  add("TENANT_FK_TARGET_MISSING","blocker","No se identificó unique(id,organization_id) para la FK compuesta del sitio.",[ORDER[0]]);
 if(!/foreign\s+key\s*\(\s*site_id\s*,\s*organization_id\s*\)\s*references\s+public\.mg_sites\s*\(\s*id\s*,\s*organization_id\s*\)/i.test(v13))
  add("TENANT_FK_MISSING","blocker","Falta FK compuesta tenant+site en el esquema V13.",[ORDER[2]]);
 if(!/unique\s*\(\s*proposal_id\s*,\s*revision\s*,\s*organization_id\s*,\s*site_id\s*\)/i.test(v13))
  add("REVISION_FK_TARGET_MISSING","blocker","Falta unicidad compuesta en revisiones.",[ORDER[2]]);
 if(!/foreign\s+key\s*\(\s*proposal_id\s*,\s*revision\s*,\s*organization_id\s*,\s*site_id\s*\)\s*references\s+public\.mg_proposal_revisions/i.test(v13))
  add("REVISION_FK_MISSING","blocker","Falta FK compuesta desde decisiones/avisos a revisión exacta.",[ORDER[2]]);
 if(!/\bprimary\s+key\s*\(\s*organization_id\s*,\s*site_id\s*\)/i.test(v13))
  add("CAS_DRAFT_KEY_MISSING","blocker","No se encontró clave de borrador por empresa/sitio.",[ORDER[2]]);
 else add("CAS_SQL_TRANSACTION_UNPROVEN","review","Una columna revision no prueba CAS, rollback ni outbox ACID; diseñar operaciones atómicas y pgTAP.",[ORDER[2]]);
 const trans=policyTransitions(texts),remaining=new Set(trans.live.map(x=>x.table+"/"+x.policy));
 for(const table of SCOPE_TABLES){
  if(!trans.live.some(p=>p.table===table&&/mg_v13_.*_scoped_read/.test(p.policy)))
   add("SCOPED_RLS_MISSING","blocker","No quedó política de lectura por sitio en "+table,[ORDER[3]]);
 }
 const old=["mg_sites_read_member","mg_sites_create_manager","mg_sites_update_manager",
 "mg_pages_read_member","mg_pages_create_editor","mg_pages_update_editor",
 "mg_domains_read_member","mg_site_identity_read","mg_site_products_read","mg_site_promotions_read"];
 for(const name of old)
  if(trans.live.some(x=>x.policy===name))
   add("BROAD_POLICY_SURVIVES","blocker","Sobrevive política heredada "+name+".",[ORDER[0],ORDER[1],ORDER[3]]);
 if(!trans.events.some(x=>x.action==="drop"&&x.policy==="mg_sites_read_member")||
    !trans.events.some(x=>x.action==="drop"&&x.policy==="mg_pages_read_member"))
  add("POLICY_DROP_MISSING","blocker","No se registró retirada de las políticas amplias de sitios y páginas.",[ORDER[3]]);
 for(const table of SCOPE_TABLES){
  const t=table.replace(".","\\.");
  if(!new RegExp("revoke\\s+insert\\s*,\\s*update\\s*,\\s*delete\\s+on\\s+"+t+"\\s+from\\s+authenticated","i").test(patch))
   add("LEGACY_WRITE_GRANT","blocker","No se revocan escrituras directas del cliente en "+table,[ORDER[3]]);
 }
 if(!/revoke\s+update\s*\(\s*name\s*,\s*slug\s*\)\s+on\s+public\.mg_sites/i.test(patch)||
    !/revoke\s+update\s*\(\s*slug\s*,\s*title\s*,\s*draft_blocks\s*\)\s+on\s+public\.mg_pages/i.test(patch))
  add("COLUMN_WRITE_GRANTS","blocker","Falta revocar UPDATE por columna en los esquemas antiguos.",[ORDER[3]]);
 for(const m of trans.live){
  if(SCOPE_TABLES.includes(m.table)&&!/scoped_read/.test(m.policy))
   add("UNREVIEWED_POLICY","blocker","Permanece una política no prevista en "+m.table+": "+m.policy,[m.path]);
 }
 if(/create\s+policy\s+\w+\s+on\s+public\.mg_site_content_releases/i.test(texts[ORDER[1]]||""))
  add("RELEASE_EXPOSURE_REVIEW","review","Verificar que releases privados no se expongan antes de autorizar publicación.",[ORDER[1]]);
 if(!/\balter\s+table\s+public\.mg_site_content_releases\s+enable\s+row\s+level\s+security/i.test(texts[ORDER[1]]||""))
  add("RELEASE_RLS_MISSING","blocker","Releases sin RLS explícita.",[ORDER[1]]);
 add("POSTGRES_REQUIRED","review","La revisión es heurística: hace falta parser, instalación aislada, roles reales, pgTAP y test de rollback antes de migrar.",[]);
 const counts={blocker:issues.filter(x=>x.severity==="blocker").length,review:issues.filter(x=>x.severity==="review").length};
 return clone({version:"19.0-review",mode:"static-only",readyForMigrations:false,authorizedToDeploy:false,
  validInputs:!issues.some(x=>["SQL_SOURCE_MISSING","NOT_DRY_RUN","UNEXPECTED_AUTHORIZATION"].includes(x.code)),
  files:ORDER.slice(),tables:created.map(t=>({name:t.name,path:t.path,references:t.references,hasRls:t.hasRls})),
  policyCount:trans.live.length,retiredPolicyCount:trans.events.filter(x=>x.action==="drop").length,
  dependencyViolations,sqlStatuses,issues,counts});
}
root.MGSqlCompatibilityV19=Object.freeze({version:"19.0-review",files:ORDER.slice(),
 assess,findTables,policyTransitions});
})(typeof window!=="undefined"?window:globalThis);
