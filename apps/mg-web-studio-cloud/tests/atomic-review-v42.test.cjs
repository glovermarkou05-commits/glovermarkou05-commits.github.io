"use strict";
/* V42 source-only SQL review; zero PostgreSQL execution, Supabase calls or deploys.
 * node apps/mg-web-studio-cloud/tests/atomic-review-v42.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const packagePath="db/v42-drafts/INSTALL_ATOMIC.review.sql.txt";
const sql=read(packagePath),m=JSON.parse(read("staging/v42-review-manifest.json"));
const original=JSON.parse(read("staging/v40-sql-review-package.review.json"));
const roadmap=JSON.parse(read("staging/v33-master-roadmap.review.json"));
let n=0;
const yes=(label,v)=>{assert.ok(v,label);n++};
const strip=s=>s.replace(/\/\*[\s\S]*?\*\//g," ").replace(/--[^\n]*/g," ");
const count=(s,re)=>[...s.matchAll(re)].length;
const core=strip(sql);
const section=(a,b)=>core.slice(core.indexOf(a)+a.length,core.indexOf(b));
function review(s){
 const c=strip(s),errs=[];
 const add=(k,b)=>{if(!b)errs.push(k)};
 const tables=[...c.matchAll(/\bcreate\s+table\s+(public|mg_private)\.([a-z0-9_]+)/gi)].map(x=>x[1]+"."+x[2]);
 const policies=[...c.matchAll(/\bcreate\s+policy\s+([a-z0-9_]+)/gi)].map(x=>x[1]);
 const rls=[...c.matchAll(/alter\s+table\s+(public|mg_private)\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)].map(x=>x[1]+"."+x[2]);
 add("TX",count(c,/\bbegin\s*;/gi)===1&&count(c,/\bcommit\s*;/gi)===1);
 add("DDL_COUNT",tables.length===16&&new Set(tables).size===16);
 add("RLS_COUNT",rls.length===16&&new Set(rls).size===16);
 add("RLS_COVERAGE",tables.every(t=>rls.includes(t)));
 add("POLICIES",policies.length===12&&new Set(policies).size===12);
 add("DEFAULT_ACL",count(c,/alter\s+default\s+privileges\s+for\s+role\s+postgres\s+in\s+schema\s+public/gi)===4);
 add("DEFAULT_TABLES",/revoke\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+tables\s+from\s+anon\s*,\s*authenticated\s*,\s*service_role/i.test(c));
 add("DEFAULT_FUNCTIONS",/revoke\s+execute\s+on\s+functions\s+from\s+public/i.test(c));
 add("DEFAULT_SEQUENCES",/revoke\s+usage\s*,\s*select\s+on\s+sequences\s+from\s+anon/i.test(c));
 add("SITES_SAFE",/status\s+in\s*\(\s*'draft','review','suspended'\s*\)/i.test(c)&&!/status\s+in\s*\(\s*'draft','review','published'/i.test(c));
 add("CANONICAL_PROPOSAL",/status\s+in\s*\(\s*'draft','submitted','needs_changes','rejected','approved','applied'\s*\)/i.test(c));
 add("HOME_UNIQUE",/unique\s*\(\s*site_id\s*,\s*slug\s*\)/i.test(c));
 add("AUDIT_FK",/organization_id\s+uuid\s+references\s+public\.mg_organizations\s*\(\s*id\s*\)\s+on\s+delete\s+restrict/i.test(c));
 add("OUTBOX_DEDUP",/create\s+unique\s+index\s+mg_v42_outbox_business_key\s+on\s+mg_private\.mg_proposal_outbox\s*\(\s*proposal_id\s*,\s*revision\s*,\s*event_type\s*\)/i.test(c));
 add("NOTICE_DEDUP",/create\s+unique\s+index\s+mg_v42_notification_event_recipient_key\s+on\s+public\.mg_proposal_notifications\s*\(\s*proposal_id\s*,\s*revision\s*,\s*event_type\s*,\s*recipient_user_id\s*\)/i.test(c));
 add("BROWSER_DENIED",/revoke\s+all\s+on\s+table[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i.test(c));
 add("NO_ANON_GRANT",!/grant\s+[^;]*\s+to\s+anon\s*;/i.test(c));
 add("NO_CLIENT_WRITE_GRANT",!/grant\s+(?:insert|update|delete|all)\b[^;]*\s+to\s+authenticated\s*;/i.test(c));
 add("NO_ROUTINES",!/create\s+(?:function|trigger|policy.+for\s+insert)\b/i.test(c));
 add("NO_DATA_CHANGES",!/^\s*(insert\s+into|update\s+public\.|delete\s+from|truncate\s+|drop\s+table)\b/im.test(c));
 add("WARNINGS",s.startsWith("-- MG WEB STUDIO CLOUD / V42")&&s.includes("DO NOT EXECUTE")&&s.includes("OUTSIDE")===false);
 return errs;
}
yes("manifest v42 review",m.version===42&&m.status==="NO_GO"&&m.mode==="GITHUB_REVIEW_ONLY");
yes("SQL unapproved",m.authorization.sql===false&&m.authorization.production===false);
yes("real runs zero",m.sqlExecuted===0&&m.postgresTests===0&&m.restoreTests===0);
yes("all five P0 remain",JSON.stringify(m.blockingP0)===JSON.stringify(["V41-01","V41-02","V41-03","V41-04","V41-10"]));
yes("13 original tasks",roadmap.tasks.length===13);
yes("eight mandatory operational pending",m.roadmap.remainingMandatory===8&&m.roadmap.remainingIds.length===8);
yes("optional distinct",roadmap.tasks.find(x=>x.id==="X01").status==="NOT_AUTHORIZED_OPTIONAL");
yes("no roadmap rewritten",roadmap.summary.decision==="NO_GO"&&roadmap.stagingAuthorized===false);
yes("v40 source unapproved",original.authorization.executeSQL===false);
yes("V40 source manifests 3 legacy drafts",original.drafts.length===3);
yes("one atomic SQL text review",m.draft===packagePath);
yes("no Supabase path",!m.draft.includes("supabase/migrations/"));
yes("full SQL text present",sql.length>18000);
yes("one BEGIN",count(core,/\bbegin\s*;/gi)===1);
yes("one COMMIT",count(core,/\bcommit\s*;/gi)===1);
const baselineIssues=review(sql);
yes("twenty-one static invariants",baselineIssues.length===0);
const mutations=[
 ["BEGIN duplicate",s=>s.replace("begin;","begin;\nbegin;"),"TX"],
 ["COMMIT missing",s=>s.replace("commit;","-- commit withheld"),"TX"],
 ["extra table",s=>s+" \ncreate table public.hack(id uuid);","DDL_COUNT"],
 ["remove table RLS",s=>s.replace("alter table public.mg_pages enable row level security;",""),"RLS_COUNT"],
 ["remove policy",s=>s.replace("create policy mg_v40_profiles_self","create policY_removed mg_v40_profiles_self"),"POLICIES"],
 ["remove default ACL",s=>s.replace("alter default privileges for role postgres in schema public","-- removed"),"DEFAULT_ACL"],
 ["change creator",s=>s.replaceAll("for role postgres in schema public","for role unreviewed in schema public"),"DEFAULT_ACL"],
 ["anon in default table grants",s=>s.replace("on tables from anon, authenticated, service_role","on tables from authenticated, service_role"),"DEFAULT_TABLES"],
 ["remove functions public revoke",s=>s.replace("revoke execute on functions from public;","-- revoke removed"),"DEFAULT_FUNCTIONS"],
 ["remove default sequence control",s=>s.replace("revoke usage, select on sequences from anon","revoke usage, select on sequences from nobody"),"DEFAULT_SEQUENCES"],
 ["allow publishing",s=>s.replace("('draft','review','suspended')","('draft','review','published','suspended')"),"SITES_SAFE"],
 ["legacy proposal status",s=>s.replace("('draft','submitted','needs_changes','rejected','approved','applied')","('draft','submitted_for_review','needs_changes','rejected','approved','applied')"),"CANONICAL_PROPOSAL"],
 ["disable Home uniqueness",s=>s.replace("unique(site_id,slug)","unique(site_id,id)"),"HOME_UNIQUE"],
 ["drop audit FK",s=>s.replace("organization_id uuid references public.mg_organizations(id) on delete restrict,","organization_id uuid,"),"AUDIT_FK"],
 ["outbox index changed",s=>s.replace("mg_v42_outbox_business_key","mg_v42_outbox_unsafe_key"),"OUTBOX_DEDUP"],
 ["notice index removed",s=>s.replace("mg_v42_notification_event_recipient_key","mg_v42_notification_unsafe_key"),"NOTICE_DEDUP"],
 ["grant anon",s=>s+"\ngrant select on public.mg_sites to anon;","NO_ANON_GRANT"],
 ["grant browser updates",s=>s+"\ngrant update on public.mg_pages to authenticated;","NO_CLIENT_WRITE_GRANT"],
 ["add function",s=>s+"\ncreate function public.fake() returns int language sql as $$ select 1 $$;","NO_ROUTINES"],
 ["inject records",s=>s+"\ninsert into public.mg_sites(id) values(gen_random_uuid());","NO_DATA_CHANGES"],
 ["remove review warning",s=>s.replace("DO NOT EXECUTE","GO LIVE"),"WARNINGS"]
];
for(const [name,fn,expected] of mutations){
 const issues=review(fn(sql));
 yes("detect unsafe "+name,issues.includes(expected));
}
yes("all original SQL reference files remain review only",original.drafts.every(d=>d.path.startsWith("db/v40-drafts/")));
console.log(n+" / "+n+" V42 purely static checks passed — NO GO for PostgreSQL.");
