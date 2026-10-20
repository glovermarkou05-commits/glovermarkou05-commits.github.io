"use strict";
/* V40 code review only. No database, Supabase API, SQL parser, network or writes.
 * node apps/mg-web-studio-cloud/tests/sql-review-v40.test.cjs
 */
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const base=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(base,p),"utf8");
const source=read("staging/v40-review-preflight.cjs");
function load(asCli=false){
 const mod={exports:{}},log=[],proc={exitCode:0};
 const req=k=>require(k);req.main=asCli?mod:null;
 new Function("require","__dirname","module","console","process",source)(
  req,path.join(base,"staging"),mod,{log:x=>log.push(x)},proc
 );
 return {api:mod.exports,log,exitCode:proc.exitCode};
}
const {api}=load(),original=api.readFiles(read);
const clone=x=>JSON.parse(JSON.stringify(x));
let n=0;
function yes(label,v){assert.ok(v,label);n++;}
const baseline=api.check(original),m=original.manifest;
yes("V40 version",baseline.version===40);
yes("Review-only mode",baseline.mode==="static-draft-review");
yes("Valid review design",baseline.valid);
yes("No issues",baseline.issues.length===0);
yes("NO GO",baseline.decision==="NO_GO");
for(const k of ["mayRunSQL","mayMigrate","mayDeploy","mayPublish","mayModifyMain",
 "postgresParsed","backupRestored","publishedHomeGuardImplemented"])
 yes("V40 blocked "+k,baseline[k]===false);
yes("No SQL executed",baseline.sqlExecuted===0);
yes("No real PostgreSQL tests",baseline.realPostgresTests===0);
yes("Three draft files",baseline.drafts===3);
yes("16 tables",baseline.tableDefinitions===16);
yes("16 RLS enabled clauses",baseline.rlsEnabledCount===16);
yes("12 SELECT policies",baseline.selectPolicies===12);
yes("Future backend blocked",baseline.futureBackendAndPublicationNotAuthorized===true);
yes("Package source branch",m.sourceBranch==="feature/mg-digital-v5-web-services");
yes("Correct target",m.intendedTarget.includes("isolated")&&m.intendedTarget.includes("never production"));
yes("No data written on staging",m.outcomes.realSchemaTablesCreated===0);
yes("Current V39 had no tables",original.baseline.counts.publicTables===0);
yes("Current V39 had no migrations",original.baseline.counts.migrations===0);
yes("No project ref leaked",!JSON.stringify(m).includes("yefcgjtovfnsqtdjdsod"));
yes("Draft names intentionally .sql.txt",m.drafts.every(x=>x.path.endsWith(".sql.txt")));
yes("Files are outside migration directory",m.drafts.every(x=>!x.path.includes("/migrations/")));
yes("Draft 2 depends on draft 1",JSON.stringify(m.phases[1].depends)===JSON.stringify(["M40A"]));
yes("Draft 3 depends on drafts 1+2",JSON.stringify(m.phases[2].depends)===JSON.stringify(["M40A","M40B"]));
yes("Risk of active historical SQL quarantined",m.sourceRisks.some(x=>x.id==="LEGACY_RLS_ACTIVE_SQL"&&x.disposition==="QUARANTINE_NEVER_AUTO_APPLY"));
yes("Migration not approved",m.authorization.applyMigration===false);
yes("Published status deliberately unavailable",m.invariants.publishedSiteStatusDisabledByDesign);
yes("Future Home guarantee missing",m.invariants.oneHomePerPublishedSiteNotYetGuaranteed);
yes("Canonical status mapping",m.invariants.v13LegacyAliasesReadOnly.applied_to_draft==="applied");
yes("Metadata does not claim full database empty",m.assumptions.allSchemasEmptyAssumed===false);
yes("Synthetic only",m.invariants.noProductionData);
const each=[original.core,original.proposals,original.rls];
yes("No migration filenames with .sql extension",m.drafts.every(x=>!x.path.endsWith(".sql")));
for(const [idx,s] of each.entries()){
 const cleaned=api.strip(s);
 yes("Draft "+(idx+1)+" contains transaction",/\bbegin\s*;/i.test(cleaned)&&/\bcommit\s*;/i.test(cleaned));
 yes("Draft "+(idx+1)+" has review warning",s.includes("DO NOT EXECUTE"));
 yes("Draft "+(idx+1)+" no SQL DROP",!/\bdrop\s+(?:table|schema|function|policy)\b/i.test(cleaned));
 yes("Draft "+(idx+1)+" no SECURITY DEFINER",!/security\s+definer/i.test(cleaned));
 yes("Draft "+(idx+1)+" no CREATE FUNCTION",!/create\s+function/i.test(cleaned));
 yes("Draft "+(idx+1)+" no nonempty INSERT",!/\binsert\s+into/i.test(cleaned));
}
yes("No policy insert/update/delete",!/create\s+policy[^;]*for\s+(?:insert|update|delete)/i.test(api.strip(original.rls)));
yes("No permitted site publish status",!api.strip(original.core).match(/status\s+text[^;]*?status\s+in\s*\([^)]*'published'/i));
yes("Composite FK in proposals",/foreign\s+key\s*\(site_id,organization_id\)/i.test(original.proposals));
yes("Composite FK in pages",/foreign\s+key\s*\(site_id,organization_id\)/i.test(original.core));
yes("No direct grants to anon",!api.strip(original.rls).match(/grant\s+[^;]*to\s+anon/i));
yes("Not creating users",!api.strip(original.core).includes("insert into auth.users"));
yes("No email or outbox worker",!api.strip(original.proposals).includes("create function"));
yes("No service keys",!JSON.stringify(original).includes("sb_secret_"));
yes("No Postgres URLs",!JSON.stringify(original).includes("postgresql://"));
yes("Not tampered by static reader",JSON.stringify(api.readFiles(read))===JSON.stringify(original));
yes("Fail-closed missing data",!api.check({}).valid&&api.check({}).decision==="NO_GO");
yes("Fail-closed null data",!api.check(null).valid);
const mutations=[
 ["Branch to main",x=>x.manifest.sourceBranch="main","MANIFEST_OR_BRANCH_CHANGED"],
 ["Fake GO",x=>x.manifest.decision="GO","MANIFEST_OR_BRANCH_CHANGED"],
 ["Unapproved creation",x=>x.manifest.stagingProjectCreationAlreadyApproved=false,"MANIFEST_OR_BRANCH_CHANGED"],
 ["SQL explicitly approved",x=>x.manifest.authorization.executeSQL=true,"UNAUTHORIZED_ACTION"],
 ["Migration approved",x=>x.manifest.authorization.applyMigration=true,"UNAUTHORIZED_ACTION"],
 ["Deployment approved",x=>x.manifest.authorization.deployment=true,"UNAUTHORIZED_ACTION"],
 ["Publish approved",x=>x.manifest.authorization.publishProduction=true,"UNAUTHORIZED_ACTION"],
 ["Paid plans approved",x=>x.manifest.authorization.activatePaidService=true,"UNAUTHORIZED_ACTION"],
 ["Other projects allowed",x=>x.manifest.authorization.modifyExistingProjects=true,"UNAUTHORIZED_ACTION"],
 ["Baseline already has tables",x=>x.baseline.counts.publicTables=3,"V39_BASELINE_UNVERIFIED"],
 ["Baseline claims migration",x=>x.baseline.counts.migrations=1,"V39_BASELINE_UNVERIFIED"],
 ["Baseline SQL approved",x=>x.baseline.approvalBoundary.executeSQLApproved=true,"V39_BASELINE_UNVERIFIED"],
 ["Remove SQL draft",x=>x.manifest.drafts.pop(),"DRAFT_INVENTORY_CHANGED"],
 ["Change draft pathname",x=>x.manifest.drafts[0].path="migrations/test.sql","DRAFT_INVENTORY_CHANGED"],
 ["Erase draft SHA",x=>x.manifest.drafts[0].sha="none","DRAFT_INVENTORY_CHANGED"],
 ["Remove phase",x=>x.manifest.phases.pop(),"DEPENDENCY_OR_PHASE_CHANGED"],
 ["Swap phase dependencies",x=>x.manifest.phases[2].depends=[],"DEPENDENCY_OR_PHASE_CHANGED"],
 ["Fake Home guarantee",x=>x.manifest.invariants.oneHomePerPublishedSiteNotYetGuaranteed=false,"CANONICAL_CONTRACT_CHANGED"],
 ["Fake browser writes allowed",x=>x.manifest.invariants.noBrowserWrites=false,"CANONICAL_CONTRACT_CHANGED"],
 ["Change Home route",x=>x.manifest.invariants.canonicalHomePublicPath="/home","CANONICAL_CONTRACT_CHANGED"],
 ["Change canonical status",x=>x.manifest.invariants.v20ProposalStates[1]="submitted_for_review","CANONICAL_CONTRACT_CHANGED"],
 ["Change event type",x=>x.manifest.invariants.outboxEventTypesUnchanged[2]="needs_changes","CANONICAL_CONTRACT_CHANGED"],
 ["Change review decision",x=>x.manifest.invariants.reviewDecisionsUnchanged[1]="needs_changes","CANONICAL_CONTRACT_CHANGED"],
 ["No data policy",x=>x.manifest.invariants.noProductionData=false,"CANONICAL_CONTRACT_CHANGED"],
 ["Drop exclusions",x=>x.manifest.scopeExclusions=[],"EXCLUSIONS_MISSING"],
 ["Ignore historical active SQL",x=>x.manifest.sourceRisks[0].disposition="AUTORUN","LEGACY_SQL_HAZARD_IGNORED"],
 ["Fake review complete",x=>x.manifest.reviewGates[0].status="PASSED","FUTURE_GATES_FALSIFIED"],
 ["Fake real validation",x=>x.manifest.reviewGates[4].status="PASSED","FUTURE_GATES_FALSIFIED"],
 ["Fake SQL executed",x=>x.manifest.outcomes.sqlStatementsExecuted=4,"REAL_RESULTS_FALSIFIED"],
 ["Fake parser",x=>x.manifest.outcomes.postgresParserPassed=true,"REAL_RESULTS_FALSIFIED"],
 ["Fake backup",x=>x.manifest.outcomes.backupRestored=true,"REAL_RESULTS_FALSIFIED"],
 ["Fake production",x=>x.manifest.outcomes.productionApproved=true,"REAL_RESULTS_FALSIFIED"],
 ["Remove review header",x=>x.core=x.core.replace("DO NOT EXECUTE","UNREVIEWED"),"DRAFT_SAFETY_HEADER_OR_TX_MISSING"],
 ["Remove SQL transaction",x=>x.core=x.core.replace("begin;","-- begin omitted"),"DRAFT_SAFETY_HEADER_OR_TX_MISSING"],
 ["Drop site table",x=>x.core=x.core.replace("create table public.mg_sites","create table public.old_sites"),"TABLE_INVENTORY_CHANGED"],
 ["Duplicate table",x=>x.core+="\ncreate table public.mg_sites(id uuid);","TABLE_INVENTORY_CHANGED"],
 ["Remove RLS on pages",x=>x.core=x.core.replace("alter table public.mg_pages enable row level security;","-- missing"),"RLS_NOT_ENABLED_ON_ALL_TABLES"],
 ["Replace RLS with no row security",x=>x.proposals=x.proposals.replace("alter table public.mg_proposal_reviews enable row level security;",""),"RLS_NOT_ENABLED_ON_ALL_TABLES"],
 ["Privileged function injected",x=>x.core+="\ncreate function public.bad() returns int language sql as $$ select 1 $$;","UNREVIEWED_DESTRUCTIVE_OR_PRIVILEGED_STATEMENT"],
 ["Destructive SQL",x=>x.core+="\ndrop table public.mg_sites;","UNREVIEWED_DESTRUCTIVE_OR_PRIVILEGED_STATEMENT"],
 ["Missing SQL commit",x=>x.proposals=x.proposals.replace("commit;",""),"DRAFT_SAFETY_HEADER_OR_TX_MISSING"],
 ["Change site to published",x=>x.core=x.core.replace("('draft','review','suspended')","('draft','review','published','suspended')"),"PUBLISHED_SITE_UNSAFE"],
 ["Remove Home uniqueness",x=>x.core=x.core.replace("unique(site_id,slug),",""),"HOME_OR_TENANT_CONSTRAINT_MISSING"],
 ["Remove composite FK",x=>x.core=x.core.replace("foreign key(site_id,organization_id)","foreign key(site_id)"),"HOME_OR_TENANT_CONSTRAINT_MISSING"],
 ["Legacy SQL status",x=>x.proposals=x.proposals.replace("'draft','submitted','needs_changes'","'draft','submitted_for_review','needs_changes'"),"CANONICAL_STATUS_CHECK_INVALID"],
 ["Unknown proposal status",x=>x.proposals=x.proposals.replace("'rejected','approved','applied'","'rejected','approved','deleted'"),"CANONICAL_STATUS_CHECK_INVALID"],
 ["Wrong review decision",x=>x.proposals=x.proposals.replace("('approved','changes','rejected')","('approved','needs_changes','rejected')"),"EVENT_DECISION_SCHEMA_DRIFT"],
 ["New outbox event",x=>x.proposals=x.proposals.replaceAll("'rejected','applied'","'rejected','applied','proposal_created'"),"EVENT_DECISION_SCHEMA_DRIFT"],
 ["New insert policy",x=>x.rls+="\ncreate policy bad on public.mg_sites for insert to authenticated with check(true);","RLS_POLICY_PERMISSIONS_INVALID"],
 ["Grant all browser",x=>x.rls+="\ngrant all on public.mg_sites to authenticated;","UNSAFE_DATA_API_GRANTS"],
 ["Grant update browser",x=>x.rls+="\ngrant update on public.mg_pages to authenticated;","UNSAFE_DATA_API_GRANTS"],
 ["Grant anon read",x=>x.rls+="\ngrant select on public.mg_pages to anon;","UNSAFE_DATA_API_GRANTS"],
 ["SQL routine Definer",x=>x.rls+="\ncreate function public.bypass() returns boolean language sql security definer as $$ select true $$;","UNREVIEWED_DESTRUCTIVE_OR_PRIVILEGED_STATEMENT"],
 ["No private schema",x=>x.core=x.core.replace("create schema if not exists mg_private;",""),"PRIVATE_SCHEMA_EXPOSURE_RISK"],
 ["No private service grant",x=>x.rls=x.rls.replace("grant usage on schema mg_private to service_role;",""),"PRIVATE_GRANTS_INCOMPLETE"],
 ["SQL row insertion",x=>x.core+="\ninsert into public.mg_organizations(name,slug) values('Test','test');","SEED_OR_DATA_MUTATION_PRESENT"]
];
for(const [title,fn,expected] of mutations){
 const sample=clone(original);fn(sample);
 const r=api.check(sample);
 yes(title+" is detected",!r.valid&&r.issues.includes(expected));
 yes(title+" is NO GO",r.decision==="NO_GO"&&!r.mayRunSQL&&!r.mayMigrate);
}
const cli=load(true);
yes("Valid package returns expected NO GO exit code",cli.exitCode===2);
yes("CLI prints NO GO",cli.log.length===1&&cli.log[0].includes("NO GO"));
yes("No command execution",!source.includes("child_process"));
yes("No actual supabase query",!source.includes("supabase."));
yes("No file writes",!source.includes("writeFileSync"));
yes("No network fetch",!source.includes("fetch("));
yes("Original package unchanged after tests",JSON.stringify(api.readFiles(read))===JSON.stringify(original));
console.log(n+" / "+n+" V40 static PostgreSQL review checks PASS — NO GO.");
