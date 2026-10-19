"use strict";
/* node apps/mg-web-studio-cloud/tests/sql-compat-v19.test.cjs
 * Heuristic static contracts; no PostgreSQL parser, SQL execution or network.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const w={};new Function("window",read("shared/mg-sql-compat-v19.js"))(w);
const audit=w.MGSqlCompatibilityV19;
const files=audit.files;
const originals=Object.fromEntries(files.map(name=>[name,read(name)]));
const demo=read("tests/transactional-api-v14.test.cjs");
const manifest=JSON.parse(read("staging/v18-manifest.review.json"));
const clone=x=>JSON.parse(JSON.stringify(x));
let passed=0;
function ok(label,v){assert.ok(v,label);passed++;console.log("✓ "+label);}
function scan(m=manifest,s=originals,d=demo){return audit.assess({manifest:m,sqlReviews:s,demoCode:d});}
function has(report,code){return report.issues.some(i=>i.code===code);}
function mutation(label,fn,expected){
 const input={manifest:clone(manifest),sqlReviews:clone(originals),demoCode:demo};
 fn(input);
 const result=audit.assess(input);
 ok(label,has(result,expected)&&result.authorizedToDeploy===false&&result.readyForMigrations===false);
}
function main(){
 const baseline=scan();
 ok("versión del módulo",audit.version==="19.0-review");
 ok("cuatro fuentes ordenadas",files.length===4);
 ok("se preserva esquema core primero",files[0].includes("schema_core"));
 ok("patch RLS último",files[3].includes("endurecimiento"));
 ok("inputs base aceptados",baseline.validInputs);
 ok("análisis solo estático",baseline.mode==="static-only");
 ok("no permite SQL desplegable",baseline.readyForMigrations===false);
 ok("no declara autorización",baseline.authorizedToDeploy===false);
 ok("21 tablas reconocidas",baseline.tables.length===21);
 ok("21 nombres de tablas únicos",new Set(baseline.tables.map(t=>t.name)).size===21);
 ok("tablas tiene RLS",baseline.tables.every(x=>x.hasRls));
 ok("tablas no omiten referencias externas",baseline.tables.some(x=>x.references.includes("auth.users")));
 ok("relaciones presentes",baseline.tables.some(x=>x.references.includes("public.mg_sites")));
 ok("dependencias ordenadas sin infracción heurística",baseline.dependencyViolations===0);
 ok("10 políticas retiradas",baseline.retiredPolicyCount===10);
 ok("17 políticas efectivas en inventario",baseline.policyCount===17);
 ok("contrato Home falla",has(baseline,"HOME_SLUG_CONFLICT"));
 ok("contrato estados falla",has(baseline,"STATUS_CONTRACT_MISMATCH"));
 ok("revisión SECURITY DEFINER",has(baseline,"SECURITY_DEFINER_REVIEW"));
 ok("revisión CAS transaccional",has(baseline,"CAS_SQL_TRANSACTION_UNPROVEN"));
 ok("se exige PostgreSQL real",has(baseline,"POSTGRES_REQUIRED"));
 ok("dos bloqueos confirmados",baseline.counts.blocker===2);
 ok("tres revisiones necesarias",baseline.counts.review===3);
 ok("enum contiene submitted_for_review",baseline.sqlStatuses.includes("submitted_for_review"));
 ok("demo contiene submitted",demo.includes('status==="submitted"'));
 ok("enum SQL contiene applied_to_draft",baseline.sqlStatuses.includes("applied_to_draft"));
 ok("demo contiene applied",demo.includes('status==="applied"'));
 ok("sitios creados antes que propuestas",baseline.tables.findIndex(x=>x.name==="public.mg_sites")<
  baseline.tables.findIndex(x=>x.name==="public.mg_site_proposals"));
 ok("revisiones creadas antes que reviews",baseline.tables.findIndex(x=>x.name==="public.mg_proposal_revisions")<
  baseline.tables.findIndex(x=>x.name==="public.mg_proposal_reviews"));
 ok("notificaciones antes de reads",baseline.tables.findIndex(x=>x.name==="public.mg_proposal_notifications")<
  baseline.tables.findIndex(x=>x.name==="public.mg_notification_reads"));
 ok("no retroceder a migraciones en manifiesto",manifest.sqlReviews.every(x=>x.endsWith(".review.sql")));
 const trans=audit.policyTransitions(Object.fromEntries(files.map(x=>[x,originals[x].replace(/--[^\n]*/g,"")])));
 ok("10 drops encontrados",trans.events.filter(x=>x.action==="drop").length===10);
 ok("no sobrevive mg_pages_read_member",!trans.live.some(x=>x.policy==="mg_pages_read_member"));
 ok("no sobrevive mg_sites_read_member",!trans.live.some(x=>x.policy==="mg_sites_read_member"));
 ok("lectura scoped de páginas",trans.live.some(x=>x.table==="public.mg_pages"&&x.policy==="mg_v13_pages_scoped_read"));
 ok("lectura scoped de sitios",trans.live.some(x=>x.table==="public.mg_sites"&&x.policy==="mg_v13_sites_scoped_read"));
 const withoutDemo=scan(manifest,originals,null);
 ok("si falta fixture se advierte",has(withoutDemo,"DEMO_INPUT_MISSING"));
 ok("sin demo no se afirma slug correcto",!has(withoutDemo,"HOME_SLUG_CONFLICT"));
 mutation("fuente SQL faltante",x=>{delete x.sqlReviews[files[0]];},"SQL_SOURCE_MISSING");
 mutation("fuente SQL vacía",x=>{x.sqlReviews[files[1]]="";},"SQL_SOURCE_MISSING");
 mutation("manifiesto aprobado no permitido",x=>{x.manifest.authorization.granted=true;},"UNEXPECTED_AUTHORIZATION");
 mutation("dryRun bloqueado desactivado",x=>{x.manifest.execution.dryRunOnly=false;},"NOT_DRY_RUN");
 mutation("mayRunMigrations activado",x=>{x.manifest.execution.mayRunMigrations=true;},"NOT_DRY_RUN");
 mutation("mayDeploy activado",x=>{x.manifest.execution.mayDeploy=true;},"NOT_DRY_RUN");
 mutation("mayPublish activado",x=>{x.manifest.execution.mayPublish=true;},"NOT_DRY_RUN");
 mutation("estado de staging activado",x=>{x.manifest.state="APPROVED";},"NOT_DRY_RUN");
 mutation("tabla duplicada",x=>{x.sqlReviews[files[1]]+="\n"+x.sqlReviews[files[1]].match(/create table public\.mg_site_identity \([\s\S]*?\n\);/i)[0];},"DUPLICATE_TABLE");
 mutation("tabla referenciada inexistente",x=>{x.sqlReviews[files[1]]=x.sqlReviews[files[1]].replace(/references public\.mg_sites/g,"references public.mg_missing_sites");},"UNRESOLVED_FK");
 mutation("FK antes de crear tabla",x=>{x.sqlReviews[files[0]]=x.sqlReviews[files[0]].replace("references public.mg_organizations(id) on delete restrict","references public.mg_sites(id) on delete restrict");},"FK_ORDER");
 mutation("RLS removida de tabla",x=>{x.sqlReviews[files[0]]=x.sqlReviews[files[0]].replace("alter table public.mg_profiles enable row level security;","");},"RLS_DISABLED");
 mutation("sin contrato de slug",x=>{x.sqlReviews[files[0]]=x.sqlReviews[files[0]].replace(/slug text not null check \(slug ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'\),\n  title/,"slug text not null,\n  title");},"HOME_RULE_MISSING");
 mutation("enum SQL estado retirado",x=>{x.sqlReviews[files[2]]=x.sqlReviews[files[2]].replace("'submitted_for_review'","'submitted'");},"STATUS_CONTRACT_MISMATCH");
 mutation("función de permisos ausente",x=>{x.sqlReviews[files[2]]=x.sqlReviews[files[2]].replace(/mg_can_access_site/g,"can_access_without_guard");},"SCOPE_FUNCTION_MISSING");
 mutation("unique tenant site perdida",x=>{x.sqlReviews[files[0]]=x.sqlReviews[files[0]].replace("unique(id,organization_id)","unique(id)");},"TENANT_FK_TARGET_MISSING");
 mutation("FK tenant site perdida",x=>{x.sqlReviews[files[2]]=x.sqlReviews[files[2]].replace("foreign key(site_id,organization_id)","foreign key(site_id)");},"TENANT_FK_MISSING");
 mutation("unicidad revision compuesta perdida",x=>{x.sqlReviews[files[2]]=x.sqlReviews[files[2]].replace("unique(proposal_id,revision,organization_id,site_id)","unique(proposal_id,revision)");},"REVISION_FK_TARGET_MISSING");
 mutation("FK a revision exacta perdida",x=>{x.sqlReviews[files[2]]=x.sqlReviews[files[2]].replace("foreign key(proposal_id,revision,organization_id,site_id)","foreign key(proposal_id,revision)");},"REVISION_FK_MISSING");
 mutation("borrador sin clave empresa sitio",x=>{x.sqlReviews[files[2]]=x.sqlReviews[files[2]].replace("primary key(organization_id,site_id)","primary key(site_id)");},"CAS_DRAFT_KEY_MISSING");
 mutation("drop pages_read antiguo perdido",x=>{x.sqlReviews[files[3]]=x.sqlReviews[files[3]].replace("drop policy if exists mg_pages_read_member on public.mg_pages;","");},"BROAD_POLICY_SURVIVES");
 mutation("drop sites_read antiguo perdido",x=>{x.sqlReviews[files[3]]=x.sqlReviews[files[3]].replace("drop policy if exists mg_sites_read_member on public.mg_sites;","");},"BROAD_POLICY_SURVIVES");
 mutation("falta retiro policy de páginas",x=>{x.sqlReviews[files[3]]=x.sqlReviews[files[3]].replace("drop policy if exists mg_pages_read_member on public.mg_pages;","");},"POLICY_DROP_MISSING");
 mutation("nueva política insegura adicional",x=>{x.sqlReviews[files[3]]+="\ncreate policy allow_all_pages on public.mg_pages for select to authenticated using(true);\n";},"UNREVIEWED_POLICY");
 mutation("política scoped desaparece",x=>{x.sqlReviews[files[3]]=x.sqlReviews[files[3]].replace("create policy mg_v13_pages_scoped_read","create policy mg_v13_pages_old_read");},"SCOPED_RLS_MISSING");
 mutation("revocación permisos de escritura removida",x=>{x.sqlReviews[files[3]]=x.sqlReviews[files[3]].replace("revoke insert,update,delete on public.mg_pages from authenticated;","");},"LEGACY_WRITE_GRANT");
 mutation("revocación columnar removida",x=>{x.sqlReviews[files[3]]=x.sqlReviews[files[3]].replace("revoke update(slug,title,draft_blocks) on public.mg_pages from authenticated;","");},"COLUMN_WRITE_GRANTS");
 mutation("releases sin RLS",x=>{x.sqlReviews[files[1]]=x.sqlReviews[files[1]].replace("alter table public.mg_site_content_releases enable row level security;","");},"RELEASE_RLS_MISSING");
 mutation("CHECK estado eliminado",x=>{x.sqlReviews[files[2]]=x.sqlReviews[files[2]].replace("check(status in ('draft','submitted_for_review','needs_changes',","check(status in (");},"STATUS_CONTRACT_MISMATCH");
 ok("analizador sin fetch",!read("shared/mg-sql-compat-v19.js").includes("fetch("));
 ok("analizador sin cliente Supabase",!read("shared/mg-sql-compat-v19.js").includes("createClient("));
 ok("analizador sin shell",!read("shared/mg-sql-compat-v19.js").includes("execSync"));
 ok("analizador sin llamadas SQL",!read("shared/mg-sql-compat-v19.js").includes("query("));
 const untouched=scan();
 untouched.tables[0].name="public.mg_fake";
 ok("resultado defensivo no modifica origen",scan().tables[0].name==="public.mg_profiles");
 console.log("\n"+passed+" comprobaciones V19 estáticas y de regresión negativa correctas.");
 return passed;
}
if(require.main===module)main();
module.exports={main};
