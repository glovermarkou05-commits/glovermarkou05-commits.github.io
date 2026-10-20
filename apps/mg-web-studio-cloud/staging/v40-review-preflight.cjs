"use strict";
/* MG WEB STUDIO CLOUD / V40: source-only SQL design audit.
 * THIS SCRIPT NEVER RUNS SQL, IMPORTS SUPABASE, CONNECTS TO ANY SERVICE OR
 * MAKES A DRAFT EXECUTABLE. Static checks do not validate PostgreSQL syntax.
 * Exit 2: review package is structurally consistent but NO GO for execution.
 * Exit 1: detected inconsistency, still NO GO.
 */
const fs=require("node:fs"),path=require("node:path");
const BASE=path.join(__dirname,"..");
const FILES=Object.freeze({
 manifest:"staging/v40-sql-review-package.review.json",
 baseline:"staging/v39-initial-readonly-inventory.review.json",
 core:"db/v40-drafts/01_core_schema.sql.txt",
 proposals:"db/v40-drafts/02_proposals_audit.sql.txt",
 rls:"db/v40-drafts/03_readonly_rls.sql.txt"
});
const expectedTables=Object.freeze([
 "public.mg_profiles","public.mg_organizations","public.mg_memberships",
 "public.mg_sites","public.mg_pages","public.mg_membership_site_scopes",
 "mg_private.mg_staff_roles","mg_private.mg_audit_events",
 "public.mg_site_draft_versions","public.mg_site_proposals",
 "public.mg_proposal_revisions","public.mg_proposal_reviews",
 "public.mg_proposal_notifications","public.mg_notification_reads",
 "mg_private.mg_proposal_outbox","mg_private.mg_operation_idempotency"
]);
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
function readFiles(reader){
 const fn=typeof reader==="function"?reader:p=>fs.readFileSync(path.join(BASE,p),"utf8");
 const result={};
 for(const [k,p] of Object.entries(FILES)){
  const s=fn(p);result[k]=k==="manifest"||k==="baseline"?JSON.parse(s):s;
 }return result;
}
function strip(sql){
 return typeof sql==="string"?sql.replace(/\/\*[\s\S]*?\*\//g," ")
  .replace(/--[^\n]*/g," "):"";
}
function count(sql,re){return [...sql.matchAll(re)].length;}
function check(files){
 const issues=[],add=s=>{if(!issues.includes(s))issues.push(s);};
 const result=(details={})=>({
  version:40,mode:"static-draft-review",valid:issues.length===0,issues,
  decision:"NO_GO",sqlExecuted:0,mayRunSQL:false,mayMigrate:false,
  mayDeploy:false,mayPublish:false,mayModifyMain:false,
  realPostgresTests:0,postgresParsed:false,backupRestored:false,
  publishedHomeGuardImplemented:false,...details});
 if(!plain(files)||Object.keys(FILES).some(k=>!(k in files))){
  add("REQUIRED_INPUT_MISSING");return result();
 }
 const m=files.manifest,b=files.baseline;
 if(!plain(m)||m.format!=="mg-web-studio/v40-sql-review-package"||
  m.version!==40||m.project!=="MG WEB STUDIO CLOUD"||
  m.sourceBranch!=="feature/mg-digital-v5-web-services"||
  m.decision!=="REVIEW_ONLY_NOT_APPROVED"||
  m.stagingProjectCreationAlreadyApproved!==true||
  m.readOnlyInspectionCompleted!==true||
  m.verificationBaseline!==FILES.baseline)
 add("MANIFEST_OR_BRANCH_CHANGED");
 if(!plain(m&&m.authorization)||m.authorization.reviewDraftsAllowed!==true||
  m.authorization.executeSQL!==false||m.authorization.applyMigration!==false||
  m.authorization.deployment!==false||m.authorization.publishProduction!==false||
  m.authorization.activatePaidService!==false||
  m.authorization.modifyExistingProjects!==false)
 add("UNAUTHORIZED_ACTION");
 if(!plain(b)||b.version!==39||b.target?.name!=="MG WEB STUDIO CLOUD - STAGING"||
  b.target?.status!=="ACTIVE_HEALTHY"||b.target?.region!=="sa-east-1"||
  b.counts?.publicTables!==0||b.counts?.migrations!==0||
  b.approvalBoundary?.executeSQLApproved!==false||
  b.approvalBoundary?.applyMigrationsApproved!==false||
  b.status?.appSchemaInstalled!==false||b.status?.productionGo!==false)
 add("V39_BASELINE_UNVERIFIED");
 const wanted=[FILES.core,FILES.proposals,FILES.rls];
 const ds=m&&m.drafts;
 if(!Array.isArray(ds)||ds.length!==3||
  ds.some((x,i)=>!plain(x)||x.path!==wanted[i]||
   typeof x.sha!=="string"||!/^[a-f0-9]{40}$/.test(x.sha)||
   !Number.isInteger(x.bytes)||x.bytes<1000))
 add("DRAFT_INVENTORY_CHANGED");
 if(!Array.isArray(m&&m.phases)||m.phases.length!==3||
  JSON.stringify(m.phases.map(x=>x.id))!==JSON.stringify(["M40A","M40B","M40C"])||
  JSON.stringify(m.phases.map(x=>x.depends))!==JSON.stringify([[],["M40A"],["M40A","M40B"]])||
  !m.phases.every(x=>x.status==="REVIEW_ONLY"&&wanted.includes(x.path)))
 add("DEPENDENCY_OR_PHASE_CHANGED");
 const c=m&&m.invariants;
 if(!plain(c)||c.canonicalHomeSlug!=="home"||
  c.canonicalHomePublicPath!=="/"||
  c.oneHomePerPublishedSiteNotYetGuaranteed!==true||
  c.publishedSiteStatusDisabledByDesign!==true||
  c.noBrowserWrites!==true||c.allowAuthenticatedSelectWithRls!==true||
  c.noAnonGrants!==true||c.noSecurityDefinerFns!==true||
  c.noSyntheticUsersSeeded!==true||c.noProductionData!==true||
  c.allTenantScopedObjectsHaveCompositeFk!==true||
  c.privateSchemaWithoutAnonAccess!==true||
  JSON.stringify(c.v20ProposalStates)!==JSON.stringify(["draft","submitted","needs_changes","rejected","approved","applied"])||
  JSON.stringify(c.reviewDecisionsUnchanged)!==JSON.stringify(["approved","changes","rejected"])||
  JSON.stringify(c.outboxEventTypesUnchanged)!==JSON.stringify(["submitted","approved","changes","rejected","applied"])||
  c.v13LegacyAliasesReadOnly?.submitted_for_review!=="submitted"||
  c.v13LegacyAliasesReadOnly?.applied_to_draft!=="applied")
 add("CANONICAL_CONTRACT_CHANGED");
 if(!Array.isArray(m&&m.scopeExclusions)||m.scopeExclusions.length<7||
  !m.scopeExclusions.some(x=>x.includes("publishing"))||
  !m.scopeExclusions.some(x=>x.includes("backup"))&&
   !m.scopeExclusions.some(x=>x.includes("migration")))
 add("EXCLUSIONS_MISSING");
 if(!Array.isArray(m&&m.sourceRisks)||m.sourceRisks.length!==5||
  !m.sourceRisks.some(x=>x.id==="LEGACY_RLS_ACTIVE_SQL"&&x.disposition==="QUARANTINE_NEVER_AUTO_APPLY"))
 add("LEGACY_SQL_HAZARD_IGNORED");
 if(!Array.isArray(m&&m.reviewGates)||m.reviewGates.length!==6||
  m.reviewGates.some(x=>x.status==="PASSED"||x.status==="GO")||
  !m.reviewGates.some(x=>x.id==="G40-3"&&x.status==="NOT_AUTHORIZED")||
  !m.reviewGates.some(x=>x.id==="G40-5"&&x.status==="NOT_EXECUTED"))
 add("FUTURE_GATES_FALSIFIED");
 const o=m&&m.outcomes;
 if(!plain(o)||o.sqlStatementsExecuted!==0||o.realSchemaTablesCreated!==0||
  o.realBackendTestsPassed!==0||o.postgresParserPassed!==false||
  o.rlsVerifiedInPostgres!==false||o.backupRestored!==false||
  o.stagingSchemaInstalled!==false||o.productionApproved!==false||
  o.costsActivated!==false)
 add("REAL_RESULTS_FALSIFIED");
 const sqlFiles=[files.core,files.proposals,files.rls];
 if(!sqlFiles.every(s=>typeof s==="string"&&s.startsWith("-- MG WEB STUDIO CLOUD / V40")&&
    s.includes("DO NOT EXECUTE")&&/\bbegin\s*;/i.test(strip(s))&&
    /\bcommit\s*;/i.test(strip(s))))
 add("DRAFT_SAFETY_HEADER_OR_TX_MISSING");
 const sources=sqlFiles.map(strip),all=sources.join("\n");
 if(sources.some(s=>/\bdrop\s+(?:table|schema|function|policy)\b/i.test(s)||
  /\btruncate\s+|\bdelete\s+from\s+|\bupdate\s+public\./i.test(s)||
  /\bcreate\s+(?:extension|function|trigger)\b/i.test(s)||
  /\bcreate\s+policy\b/i.test(s)&&s!==sources[2]))
 add("UNREVIEWED_DESTRUCTIVE_OR_PRIVILEGED_STATEMENT");
 if(!sources.every(s=>count(s,/\bbegin\s*;/gi)===1&&count(s,/\bcommit\s*;/gi)===1))
 add("TRANSACTION_BOUNDARY_CHANGED");
 const actualTables=[...all.matchAll(/\bcreate\s+table\s+(public|mg_private)\.([a-z0-9_]+)/gi)]
   .map(x=>x[1].toLowerCase()+"."+x[2].toLowerCase());
 if(actualTables.length!==16||new Set(actualTables).size!==16||
    expectedTables.some(x=>!actualTables.includes(x)))
 add("TABLE_INVENTORY_CHANGED");
 const rlsStatements=[...all.matchAll(/alter\s+table\s+(public|mg_private)\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)]
   .map(x=>x[1].toLowerCase()+"."+x[2].toLowerCase());
 if(rlsStatements.length!==16||new Set(rlsStatements).size!==16||
   expectedTables.some(x=>!rlsStatements.includes(x)))
 add("RLS_NOT_ENABLED_ON_ALL_TABLES");
 if(!/create\s+schema\s+if\s+not\s+exists\s+mg_private/i.test(sources[0])||
  !/revoke\s+all\s+on\s+schema\s+mg_private\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(all))
 add("PRIVATE_SCHEMA_EXPOSURE_RISK");
 const status=/status\s+text\s+not\s+null\s+default\s+'draft'\s+check\s*\(\s*status\s+in\s*\(([^)]*)\)/gi;
 const sitesBlock=(sources[0].match(/create\s+table\s+public\.mg_sites\s*\(([\s\S]*?)\n\);/i)||[])[1]||"";
 const siteStatus=(sitesBlock.match(status)||[])[0]||"";
 if(!siteStatus||!siteStatus.includes("'draft'")||!siteStatus.includes("'review'")||
  !siteStatus.includes("'suspended'")||siteStatus.includes("'published'"))
 add("PUBLISHED_SITE_UNSAFE");
 const pageBlock=(sources[0].match(/create\s+table\s+public\.mg_pages\s*\(([\s\S]*?)\n\);/i)||[])[1]||"";
 if(!/unique\s*\(\s*site_id\s*,\s*slug\s*\)/i.test(pageBlock)||
  !/slug\s+text\s+not\s+null\s+check\s*\(\s*slug\s*~/i.test(pageBlock)||
  !/foreign\s+key\s*\(\s*site_id\s*,\s*organization_id\s*\)/i.test(pageBlock))
 add("HOME_OR_TENANT_CONSTRAINT_MISSING");
 const proposalBlock=(sources[1].match(/create\s+table\s+public\.mg_site_proposals\s*\(([\s\S]*?)\n\);/i)||[])[1]||"";
 if(!/status\s+text\s+not\s+null\s+default\s+'draft'/i.test(proposalBlock)||
  !/check\s*\(\s*status\s+in\s*\(\s*'draft'\s*,\s*'submitted'\s*,\s*'needs_changes'\s*,\s*'rejected'\s*,\s*'approved'\s*,\s*'applied'\s*\)\s*\)/i.test(proposalBlock)||
  /'submitted_for_review'|'applied_to_draft'/i.test(proposalBlock))
 add("CANONICAL_STATUS_CHECK_INVALID");
 const reviewBlock=(sources[1].match(/create\s+table\s+public\.mg_proposal_reviews\s*\(([\s\S]*?)\n\);/i)||[])[1]||"";
 if(!/decision\s+text\s+not\s+null\s+check\s*\(\s*decision\s+in\s*\(\s*'approved'\s*,\s*'changes'\s*,\s*'rejected'\s*\)\s*\)/i.test(reviewBlock)||
  !/event_type\s+text\s+not\s+null/i.test(sources[1])||
  /'proposal_created'|'proposal_revised'/i.test(sources[1]))
 add("EVENT_DECISION_SCHEMA_DRIFT");
 const policies=count(sources[2],/create\s+policy\s+mg_v40_[a-z0-9_]+\s+on\s+public\./gi);
 if(policies!==12||/create\s+policy[^;]+for\s+(?:insert|update|delete|all)/i.test(sources[2]))
 add("RLS_POLICY_PERMISSIONS_INVALID");
 if(!/grant\s+select\s+on\s+table[\s\S]*?to\s+authenticated\s*;/i.test(sources[2])||
  /grant\s+(?:all|insert|update|delete)[^;]*to\s+(?:public|anon|authenticated)\s*;/i.test(all)||
  /grant\s+[^;]*?\b(?:insert|update|delete|all)\b[^;]*?to\s+(?:public|anon|authenticated)\s*;/i.test(sources[2])||
  /grant\s+[^;]*?to\s+(?:public|anon)\s*;/i.test(all))
 add("UNSAFE_DATA_API_GRANTS");
 if(!/grant\s+usage\s+on\s+schema\s+mg_private\s+to\s+service_role/i.test(sources[2])||
  !/revoke\s+all\s+on\s+table[\s\S]*?from\s+public\s*,\s*anon\s*,\s*authenticated/i.test(sources[2]))
 add("PRIVATE_GRANTS_INCOMPLETE");
 if(/\bsecurity\s+definer\b/i.test(all)||/\bcreate\s+function\b/i.test(all)||
   /\bcreate\s+trigger\b/i.test(all))
 add("PRIVILEGED_ROUTINE_UNREVIEWED");
 if(/\b(?:insert\s+into|update\s+|delete\s+from)\b/i.test(all)&&
   !/\bupdate\s*\(/i.test(all)) {
   // no DML in these drafts; 'UPDATE' privilege is allowed in GRANT/REVOKE.
   const statements=all.split(";").filter(s=>/^\s*(insert|update|delete)\s+/i.test(s));
   if(statements.length)add("SEED_OR_DATA_MUTATION_PRESENT");
 }
 return result({drafts:3,tableDefinitions:actualTables.length,
  rlsEnabledCount:rlsStatements.length,selectPolicies:policies,
  futureBackendAndPublicationNotAuthorized:true});
}
function render(r){
 return [
  "MG WEB STUDIO CLOUD V40 — SQL BORRADOR / SIN EJECUCIÓN",
  "Inventario: "+(r.valid?"documentalmente coherente":"con problemas"),
  "Tablas propuestas: "+(r.tableDefinitions??"desconocidas"),
  "RLS habilitado (en texto): "+(r.rlsEnabledCount??"desconocido"),
  "Políticas SELECT (en texto): "+(r.selectPolicies??"desconocido"),
  "Problemas: "+r.issues.join(", "),
  "NO GO: no se ejecutó SQL, ningún backup/restore probado ni publicación."
 ].join("\n");
}
if(require.main===module){
 let res;try{res=check(readFiles());}catch(e){res={...check(null),issues:["REVIEW_SOURCE_UNREADABLE"],valid:false};}
 console.log(render(res));process.exitCode=res.valid?2:1;
}
module.exports={FILES,expectedTables,readFiles,strip,check,render};
