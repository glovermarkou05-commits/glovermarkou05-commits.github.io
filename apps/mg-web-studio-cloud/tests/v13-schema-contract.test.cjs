"use strict";
/* node apps/mg-web-studio-cloud/tests/v13-schema-contract.test.cjs
 * Revisión ESTÁTICA de contratos SQL sin ejecutar SQL ni conectar Supabase.
 * Los casos de acceso son expectativas independientes, NO pruebas RLS.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(base,p),"utf8");
const original=read("db/v13-propuestas-scopes.review.sql");
const patch=read("db/v13-endurecimiento-rls-legado.review.sql");
const matrix=JSON.parse(read("db/v13-casos-autorizacion.review.json"));
const sql=original.replace(/--[^\n]*/g,""),legacy=patch.replace(/--[^\n]*/g,"");
let passed=0;
const check=(label,v)=>{assert.ok(v,label);passed++;console.log("✓",label)};
function has(pattern,target=sql){return pattern.test(target)}
function decide(userId,siteId,action){
 const member=matrix.members.find(m=>m.id===userId),site=matrix.sites.find(s=>s.id===siteId);
 if(!member||!site||member.organization!==site.organization||member.status!=="active"||
   matrix.organizations.find(o=>o.id===member.organization)?.status!=="active")return false;
 const roles={
 CLIENT_OWNER:["read","edit","publish","members","billing","support"],
 CLIENT_ADMIN:["read","edit","publish","members","support"],
 CLIENT_EDITOR:["read","edit"],CLIENT_VIEWER:["read"]};
 if(!roles[member.role]?.includes(action))return false;
 if(member.role==="CLIENT_OWNER"||member.role==="CLIENT_ADMIN")return true;
 return member.siteIds.includes(siteId);
}
function main(){
 check("archivo V13 marcado como revisión",original.includes("NO ES MIGRACIÓN"));
 check("parche legado marcado como revisión",patch.includes("NO MIGRACIÓN"));
 const publicTables=["mg_membership_site_scopes","mg_site_draft_versions",
  "mg_site_proposals","mg_proposal_revisions","mg_proposal_reviews",
  "mg_proposal_notifications","mg_notification_reads"];
 const privateTables=["mg_proposal_outbox","mg_operation_idempotency"];
 for(const t of publicTables){
  check("tabla public "+t,has(new RegExp("create table public\\."+t+"\\s*\\(")));
  check("RLS habilitado "+t,has(new RegExp("alter table public\\."+t+" enable row level security")));
  check("revoca privilegios "+t,has(new RegExp("revoke all on public\\."+t+" from public,anon,authenticated")));
  check("solo SELECT concedido "+t,has(new RegExp("grant select on public\\."+t+" to authenticated")));
 }
 for(const t of privateTables){
  check("tabla privada "+t,has(new RegExp("create table mg_private\\."+t+"\\s*\\(")));
  check("RLS privada "+t,has(new RegExp("alter table mg_private\\."+t+" enable row level security")));
  check("no concesión a clientes "+t,!has(new RegExp("grant (?:select|insert|update|delete|all) on mg_private\\."+t+" to authenticated")));
 }
 check("función segura en esquema privado",has(/create function mg_private\.mg_can_access_site/));
 check("SECURITY DEFINER con search_path pin",has(/security definer\s+set search_path = ''/i));
 check("función usa identidad confiable",has(/m\.user_id=\(select auth\.uid\(\)\)/i));
 check("comprueba miembro activo",has(/m\.status='active'/));
 check("comprueba negocio activo",has(/o\.status='active'/));
 check("compara empresa y sitio",has(/join public\.mg_sites s on s\.organization_id=m\.organization_id\s+and s\.id=p_site_id/));
 check("comprueba scope editor",has(/when m\.role='CLIENT_EDITOR'[\s\S]*?mg_membership_site_scopes scope/));
 check("comprueba scope viewer",has(/when m\.role='CLIENT_VIEWER'[\s\S]*?mg_membership_site_scopes scope/));
 check("no da permisos directos de escritura",!has(/^\s*grant\s+(?:all|insert|update|delete)\b[^\n]*\bauthenticated\s*;/im));
 check("revoca ejecución pública de función",has(/revoke all on function mg_private\.mg_can_access_site\(uuid,uuid,text\)\s+from public,anon,authenticated/));
 check("ejecución limitada a autenticados",has(/grant execute on function mg_private\.mg_can_access_site\(uuid,uuid,text\)\s+to authenticated/));
 check("scope FK a membresía",has(/foreign key \(organization_id,user_id\)\s+references public\.mg_memberships/));
 check("scope FK a sitio y tenant",has(/foreign key \(site_id,organization_id\)\s+references public\.mg_sites/));
 check("FK propuesta y sitio",has(/unique\(id,organization_id,site_id\)/));
 check("FK revisión y propuesta",has(/foreign key\(proposal_id,organization_id,site_id\)\s+references public\.mg_site_proposals/));
 check("FK review a revisión exacta",has(/foreign key\(proposal_id,revision,organization_id,site_id\)\s+references public\.mg_proposal_revisions/));
 check("nota obligatoria para rechazar/cambios",has(/check\(decision='approved' or char_length\(btrim\(note\)\) between 8 and 500\)/));
 check("una decisión por revisión",has(/unique\(proposal_id,revision\)/));
 check("notificación por destinatario",has(/recipient_user_id uuid not null references auth\.users/));
 check("lectura de aviso para destinatario",has(/foreign key\(notification_id,recipient_user_id\)/));
 check("notificaciones filtradas por auth.uid",has(/recipient_user_id=\(select auth\.uid\(\)\)/));
 check("outbox privado",has(/create table mg_private\.mg_proposal_outbox/));
 check("idempotencia por organización, actor y operación",has(/primary key\(organization_id,actor_user_id,operation_key\)/));
 check("versionado de borrador",has(/create table public\.mg_site_draft_versions[\s\S]*?revision bigint not null default 1/));
 for(const p of ["drafts","proposals","revisions","reviews"]){
  check("RLS scoped "+p,has(new RegExp("create policy mg_v13_"+p+"_read_scoped[\\s\\S]*?mg_private\\.mg_can_access_site\\(")));
 }
 check("RLS notificaciones por usuario y scope",has(/create policy mg_v13_notifications_read_recipient[\s\S]*?recipient_user_id=\(select auth\.uid\(\)\)[\s\S]*?mg_can_access_site/));
 check("RLS marca de lectura usuario",has(/create policy mg_v13_notification_reads_self[\s\S]*?recipient_user_id=\(select auth\.uid\(\)\)/));
 const removed=["mg_sites_read_member","mg_sites_create_manager","mg_sites_update_manager",
  "mg_pages_read_member","mg_pages_create_editor","mg_pages_update_editor",
  "mg_domains_read_member","mg_site_identity_read","mg_site_products_read","mg_site_promotions_read"];
 for(const p of removed)check("política legado retirada "+p,has(new RegExp("drop policy if exists "+p+"\\b"),legacy));
 for(const t of ["mg_sites","mg_pages","mg_domains","mg_site_identity","mg_site_products","mg_site_promotions"]){
  check("lectura scoped heredada "+t,has(new RegExp("create policy mg_v13_\\w+_scoped_read\\s+on public\\."+t+"[\\s\\S]*?mg_can_access_site"),legacy));
  check("sin escrituras directas heredadas "+t,has(new RegExp("revoke insert,update,delete on public\\."+t+" from authenticated"),legacy));
 }
 check("revocación de update por columna sitios",has(/revoke update\(name,slug\) on public\.mg_sites from authenticated/,legacy));
 check("revocación de update por columna páginas",has(/revoke update\(slug,title,draft_blocks\) on public\.mg_pages from authenticated/,legacy));
 check("matriz con casos",matrix.cases.length>=30);
 for(const [actor,site,action,expected] of matrix.cases){
  check("escenario "+actor+"/"+site+"/"+action,decide(actor,site,action)===expected);
 }
 console.log("\n"+passed+" comprobaciones de CONTRATO V13 correctas. Ninguna sentencia SQL fue ejecutada.");
 return passed;
}
if(require.main===module)main();
module.exports={main};
