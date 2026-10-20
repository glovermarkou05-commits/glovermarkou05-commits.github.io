"use strict";
/* V45 static-only source verification. NEVER executes SQL or database API.
 * node apps/mg-web-studio-cloud/tests/permission-correction-v45.test.cjs
 */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const base=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(base,p),"utf8");
const manifest=JSON.parse(read("staging/v45-permission-correction.review.json"));
const old=read("db/v42-drafts/INSTALL_ATOMIC.review.sql.txt");
const sql=read("db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt");
const audit=read("db/v45-drafts/VERIFY_SCOPED_ACL.review.sql.txt");
const v44=JSON.parse(read("staging/v44-real-catalog-observations.review.json"));
const clean=s=>s.replace(/\/\*[\s\S]*?\*\//g," ").replace(/--[^\n]*/g," ");
const count=(s,re)=>[...s.matchAll(re)].length;
let n=0;const ok=(name,valid)=>{assert.ok(valid,name);n++};
function checkDraft(content){
 const sqlText=clean(content),issues=[];
 const check=(name,pred)=>{if(!pred)issues.push(name)};
 const allTables=[...sqlText.matchAll(/create\s+table\s+(public|mg_private)\.([a-z0-9_]+)/gi)].map(x=>x[1]+"."+x[2]);
 const rlsTables=[...sqlText.matchAll(/alter\s+table\s+(public|mg_private)\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)].map(x=>x[1]+"."+x[2]);
 check("single_tx",count(sqlText,/\bbegin\s*;/gi)===1&&count(sqlText,/\bcommit\s*;/gi)===1);
 check("tables_16",allTables.length===16&&new Set(allTables).size===16);
 check("rls_16",rlsTables.length===16&&allTables.every(t=>rlsTables.includes(t)));
 check("select_policy_12",count(sqlText,/create\s+policy\s+mg_v40_/gi)===12&&
 !/create\s+policy[^;]*for\s+(?:all|insert|update|delete)/i.test(sqlText));
 check("no_default_acl_changes",count(sqlText,/\balter\s+default\s+privileges\b/gi)===0);
 check("new_schema_revoke",/revoke\s+all\s+on\s+schema\s+mg_private\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i.test(sqlText));
 check("private_sequence_revoke",/revoke\s+all\s+on\s+all\s+sequences\s+in\s+schema\s+mg_private\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i.test(sqlText));
 check("private_function_revoke",/revoke\s+all\s+on\s+all\s+functions\s+in\s+schema\s+mg_private\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i.test(sqlText));
 check("per_object_revokes",
    count(sqlText,/revoke\s+all\s+on\s+table\s+[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/gi)>=3);
 check("auth_select_explicit",/grant\s+select\s+on\s+table[\s\S]*?to\s+authenticated\s*;/i.test(sqlText));
 check("no_anon_grants",!/grant\s+[^;]*?\bto\s+anon\s*;/i.test(sqlText));
 check("no_browser_dml",!/grant\s+(?:all|insert|update|delete)\b[^;]*?\bto\s+authenticated\s*;/i.test(sqlText));
 check("published_prohibited",/status\s+in\s*\('draft','review','suspended'\)/i.test(sqlText));
 check("proposal_states",/status\s+in\s*\('draft','submitted','needs_changes','rejected','approved','applied'\)/i.test(sqlText));
 check("outbox_unique",/create\s+unique\s+index\s+mg_v42_outbox_business_key/i.test(sqlText));
 check("notice_unique",/create\s+unique\s+index\s+mg_v42_notification_event_recipient_key/i.test(sqlText));
 check("audit_fk",/organization_id\s+uuid\s+references\s+public\.mg_organizations\(id\)/i.test(sqlText));
 check("no_privileged_routine",!/create\s+(?:function|trigger)\b/i.test(sqlText)&&!/security\s+definer/i.test(sqlText));
 check("no_data_mutation",!/^\s*(?:insert\s+into|delete\s+from|update\s+(?:public|mg_private)\.|drop\s+(?:table|schema)|truncate)\b/im.test(sqlText));
 check("review_warning",content.includes("DO NOT EXECUTE")&&content.startsWith("-- MG WEB STUDIO CLOUD / V45"));
 return issues;
}
ok("V45 version",manifest.version===45);
ok("branch scoped",manifest.branch==="feature/mg-digital-v5-web-services");
ok("review only",manifest.scope==="GITHUB_DRAFT_CORRECTION_ONLY");
ok("input V44 has both creators",JSON.stringify(v44.queries[2].result.creatingRoles)===JSON.stringify(["postgres","supabase_admin"]));
ok("V44 R02 still unconfirmed",v44.queries[1].status==="EXECUTED_RESULT_NOT_RETAINED");
ok("V44 records six default ACL rows",v44.queries[2].result.defaultAclRecords===6);
ok("V42 old SQL had four blanket default changes",count(clean(old),/\balter\s+default\s+privileges\b/gi)===4);
ok("V45 new SQL removes blanket changes",count(clean(sql),/\balter\s+default\s+privileges\b/gi)===0);
ok("no actual application migration authorized",manifest.authorization.ddl===false&&manifest.authorization.deploy===false);
ok("zero applied",manifest.execution.realSqlStatements===0&&manifest.execution.tablesInstalled===0);
ok("no site published",manifest.authorization.publish===false);
ok("no other systems",manifest.authorization.modifyMain===false&&manifest.authorization.modifyOtherProjects===false);
ok("no real backup",manifest.execution.realBackups===0&&manifest.execution.realRestores===0);
ok("future default ACL flagged OPEN",manifest.securityStatus.defaultACLForFutureObjects==="UNRESOLVED_VISIBLE_BROAD_DEFAULTS");
ok("not claiming security closure",manifest.securityStatus.productionRiskClosed===false);
ok("no alleged owner",manifest.securityStatus.schemaOwnersVerified===false);
ok("source artifacts remain .sql.txt",manifest.artifacts.every(x=>x.path.endsWith(".sql.txt")));
ok("source artifacts outside migrations",manifest.artifacts.every(x=>!x.path.includes("/migrations/")));
ok("six review gates",manifest.gates.length===6);
ok("all gates incomplete",manifest.gates.every(x=>x.status!=="DONE"&&x.status!=="PASS"&&x.status!=="GO"));
ok("16-table draft coherent",checkDraft(sql).length===0);
ok("audit contains five SELECT queries",count(audit,/^SELECT\s+/gm)===5);
ok("audit BEGIN READ ONLY and ROLLBACK",/BEGIN TRANSACTION READ ONLY;/i.test(audit)&&/ROLLBACK;/i.test(audit));
ok("audit no DDL",!/^\s*(?:CREATE|ALTER|DROP|REVOKE|GRANT|INSERT|UPDATE|DELETE)\b/im.test(clean(audit)));
ok("audit tests effective grants",audit.includes("has_table_privilege('anon'")&&audit.includes("has_table_privilege('authenticated'"));
ok("audit tests private schema",audit.includes("has_schema_privilege('anon'"));
ok("audit keeps future default ACL risk visible",audit.includes("pg_catalog.pg_default_acl"));
const cases=[
 ["legacy blanket default privileges",x=>x.replace("begin;","begin;\nalter default privileges for role postgres in schema public revoke all on tables from anon;"),"no_default_acl_changes"],
 ["supabase admin blanket defaults",x=>x.replace("begin;","begin;\nalter default privileges for role supabase_admin in schema public revoke all on tables from anon;"),"no_default_acl_changes"],
 ["missing RLS",x=>x.replace("alter table public.mg_pages enable row level security;",""),"rls_16"],
 ["allow publishing",x=>x.replace("('draft','review','suspended')","('draft','review','published','suspended')"),"published_prohibited"],
 ["auth browser DML",x=>x+"\ngrant update on public.mg_pages to authenticated;","no_browser_dml"],
 ["anon SELECT",x=>x+"\ngrant select on public.mg_sites to anon;","no_anon_grants"],
 ["private schema public",x=>x.replaceAll("revoke all on schema mg_private from public, anon, authenticated;","grant usage on schema mg_private to anon;").replaceAll("revoke all on schema mg_private from public,anon,authenticated;","grant usage on schema mg_private to anon;"),"new_schema_revoke"],
 ["remove seq revoke",x=>x.replace("revoke all on all sequences in schema mg_private from public, anon, authenticated;",""),"private_sequence_revoke"],
 ["remove function revoke",x=>x.replace("revoke all on all functions in schema mg_private from public, anon, authenticated;",""),"private_function_revoke"],
 ["remove table revoked grants",x=>x.replaceAll("from public,anon,authenticated;","from only_postgres;").replaceAll("from public, anon, authenticated;","from only_postgres;"),"per_object_revokes"],
 ["remove authenticated read",x=>x.replace("grant select on table","grant execute on table"),"auth_select_explicit"],
 ["remove audit FK",x=>x.replace("organization_id uuid references public.mg_organizations(id) on delete restrict,","organization_id uuid,"),"audit_fk"],
 ["outbox uniqueness removed",x=>x.replace("mg_v42_outbox_business_key","mg_v42_outbox_unprotected"),"outbox_unique"],
 ["notifications uniqueness removed",x=>x.replace("mg_v42_notification_event_recipient_key","mg_v42_notification_unprotected"),"notice_unique"],
 ["add privileged routine",x=>x+"\ncreate function public.inject() returns int language sql security definer as $$select 1$$;","no_privileged_routine"],
 ["add destructive SQL",x=>x+"\ndrop table public.mg_sites;","no_data_mutation"],
 ["extra transaction",x=>x.replace("begin;","begin;\nbegin;"),"single_tx"],
 ["no COMMIT",x=>x.replace("commit;",""),"single_tx"],
 ["remove policy",x=>x.replace("create policy mg_v40_profiles_self","create deleted_policy mg_v40_profiles_self"),"select_policy_12"],
 ["remove table",x=>x.replace("create table public.mg_pages","create table public.old_pages"),"rls_16"],
 ["add new table",x=>x+"\ncreate table public.v45_hack(id uuid);","tables_16"],
 ["remove review warning",x=>x.replace("DO NOT EXECUTE","CAN_EXECUTE"),"review_warning"]
];
for(const [name,mut,expected] of cases){
 const found=checkDraft(mut(sql));
 ok("mutant catches "+name,found.includes(expected));
}
console.log(n+" / "+n+" V45 static-only security checks PASS; SQL remains NOT AUTHORIZED.");
