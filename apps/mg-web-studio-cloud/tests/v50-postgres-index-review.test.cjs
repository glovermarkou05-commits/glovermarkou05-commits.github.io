"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),ddl=fs.readFileSync(path.join(root,"db/v45-drafts/INSTALL_OBJECT_SCOPED.review.sql.txt"),"utf8"),clean=ddl.replace(/\/\*[\s\S]*?\*\//g," ").replace(/--[^\n]*/g," ");
function splitTopLevel(body){const out=[];let part="",depth=0;for(const c of body){if(c==="(")depth++;else if(c===")")depth--;if(c===","&&depth===0){out.push(part.trim());part="";}else part+=c;}if(part.trim())out.push(part.trim());return out;}
const tables=[...clean.matchAll(/create\s+table\s+([\w.]+)\s*\(([\s\S]*?)\n\);/gi)].map(m=>({name:m[1],parts:splitTopLevel(m[2])})),fks=[],indexes=[];
for(const table of tables){const keys=[];for(const part of table.parts){
 let m=part.match(/^(?:constraint\s+\w+\s+)?primary\s+key\s*\(([^)]+)\)/i);if(m)keys.push(m[1].split(",").map(x=>x.trim().toLowerCase()));
 m=part.match(/^(?:constraint\s+\w+\s+)?unique\s*\(([^)]+)\)/i);if(m)keys.push(m[1].split(",").map(x=>x.trim().toLowerCase()));
 m=part.match(/^foreign\s+key\s*\(([^)]+)\)\s*references\s+([\w.]+)\s*\(([^)]+)\)(?:\s+on\s+delete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action))?/i);if(m)fks.push({table:table.name,cols:m[1].split(",").map(x=>x.trim().toLowerCase()),target:m[2],onDelete:(m[4]||"no action").toLowerCase()});
 if(!/^(?:constraint|foreign|primary|unique|check)\b/i.test(part)){const col=part.match(/^(\w+)\s+/),ref=part.match(/\breferences\s+([\w.]+)\s*\(([^)]+)\)(?:\s+on\s+delete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action))?/i);if(col&&ref)fks.push({table:table.name,cols:[col[1].toLowerCase()],target:ref[1],onDelete:(ref[3]||"no action").toLowerCase()});if(col&&/\bprimary\s+key\b/i.test(part))keys.push([col[1].toLowerCase()]);if(col&&/\bunique\b/i.test(part))keys.push([col[1].toLowerCase()]);}
 }indexes.push(...keys.map(cols=>({table:table.name,cols,where:null}))); }
indexes.push(...[...clean.matchAll(/create\s+(unique\s+)?index\s+(\w+)\s+on\s+([\w.]+)\s*\(([^)]*)\)(?:\s+where\s+([^;]+))?;/gi)].map(m=>({table:m[3],cols:m[4].split(",").map(s=>s.trim().replace(/\s+(asc|desc)(\s+nulls\s+(first|last))?$/i,"").toLowerCase()),where:m[5]?.trim()||null})));
const hasIndex=fk=>indexes.some(i=>i.table===fk.table&&!i.where&&fk.cols.every(c=>i.cols.slice(0,fk.cols.length).includes(c)));
const missing=fks.filter(f=>!hasIndex(f)).map(f=>f.table+":"+f.cols.join(",")).sort();
test("V45 tiene 16 tablas y 23 claves foráneas",()=>{assert.equal(tables.length,16);assert.equal(fks.length,23);});
test("identifica exactamente las diez FKs sin índice completo",()=>{assert.deepEqual(missing,[
"mg_private.mg_audit_events:organization_id","mg_private.mg_operation_idempotency:actor_user_id",
"mg_private.mg_proposal_outbox:proposal_id,revision,organization_id,site_id",
"public.mg_membership_site_scopes:site_id,organization_id","public.mg_memberships:user_id",
"public.mg_proposal_notifications:proposal_id,revision,organization_id,site_id",
"public.mg_proposal_revisions:created_by","public.mg_proposal_reviews:reviewed_by",
"public.mg_site_draft_versions:updated_by","public.mg_site_proposals:created_by"
].sort());assert.match(clean,/on public\.mg_memberships\s*\(user_id,organization_id\)\s+where status='active'/i);});
test("filtro RLS de lecturas carece de índice que empiece por recipient_user_id",()=>{const p=clean.match(/create\s+policy\s+mg_v40_notification_reads_recipient[\s\S]*?using\s*\(([\s\S]*?)\);/i);assert.ok(p);assert.match(p[1],/recipient_user_id\s*=\s*\(select auth\.uid\(\)\)/i);const a=indexes.filter(i=>i.table==="public.mg_notification_reads"&&!i.where);assert.ok(a.length);assert.ok(a.every(i=>i.cols[0]!=="recipient_user_id"));});
test("el borrador V45 prohíbe ejecución y el test no propone DDL",()=>{assert.match(ddl,/DO NOT EXECUTE, DO NOT REGISTER AS MIGRATION/i);assert.match(ddl,/No SQL execution currently approved/i);assert.doesNotMatch(ddl,/create\s+index\s+mg_v50/i);});
