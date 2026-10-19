"use strict";
/* V34 Home compatibility tests — static JavaScript and SQL text ONLY.
 * Node command (optional): node apps/mg-web-studio-cloud/tests/home-compat-v34.test.cjs
 * Never creates schemas, writes to DB, calls Supabase, deploys or publishes.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const win={};
for(const name of ["mg-contracts-v20.js","mg-home-compat-v34.js"])
 new Function("window",read("shared/"+name))(win);
const C=win.MGWebContractsV20,H=win.MGHomeCompatV34;
const clone=x=>JSON.parse(JSON.stringify(x));
let n=0;const yes=(label,v)=>{assert.ok(v,label);n++};
const noGo=r=>r.go===false&&r.mayWrite===false&&r.mayPublish===false&&r.simulationOnly===true;
const fixture=()=>[
 {slug:"",title:"Inicio",blocks:[{kind:"hero",text:"Ejemplo"}]},
 {slug:"contacto",title:"Contacto"},{slug:"servicios",title:"Servicios"}
];
yes("V34 version",H.version==="34.0-review");
yes("Home canonical slug",H.homeSlug==="home");
yes("Home public URL",H.publicRoot==="/");
yes("V20 still canonical home",C.HOME_SLUG==="home");
const orig=fixture(),before=JSON.stringify(orig),res=H.prepareDraft(orig,C);
yes("legacy prepare successful",res.ok&&res.homeSlug==="home");
yes("legacy empty mapped to home",res.pages[0].slug==="home");
yes("legacy correction counted",res.legacyAliasesRewritten===1);
yes("public route root",res.publicPath==="/");
yes("non-home pages untouched",res.pages[1].slug==="contacto"&&res.pages[2].slug==="servicios");
yes("not prepared for real DB",res.readyForDatabase===false&&!res.realSchemaVerified);
yes("conversion never persists",noGo(res));
yes("only future server boundary",res.target==="future-server-boundary");
yes("fixture unchanged",JSON.stringify(orig)===before);
res.pages[0].blocks[0].text="modified";
yes("deep copied proposal",orig[0].blocks[0].text==="Ejemplo");
const already=H.prepareDraft([{slug:"home",title:"Inicio"}],C);
yes("canonical stored ready for review",already.ok&&already.legacyAliasesRewritten===0);
yes("canonical still cannot write",noGo(already));
for(const [slug,expected] of [
 ["", "home"],["home","home"],["about-us","about-us"],["servicios2","servicios2"]
 ]){
 const s=C.normalizedSlug(slug);
 yes("V20 normalizes "+slug,s.ok&&s.slug===expected);
}
const invalid=[
 ["no pages",[],"INVALID_PAGES"],
 ["missing Home",[{slug:"contacto"}],"MISSING_HOME"],
 ["empty and home duplicate",[{slug:""},{slug:"home"}],"DUPLICATE_SLUG"],
 ["two explicit home",[{slug:"home"},{slug:"home"}],"DUPLICATE_SLUG"],
 ["duplicated normal slug",[{slug:"home"},{slug:"contacto"},{slug:"contacto"}],"DUPLICATE_SLUG"],
 ["uppercase Home",[{slug:"HOME"}],"INVALID_SLUG"],
 ["slash as page slug",[{slug:"/"}],"INVALID_SLUG"],
 ["slash home",[{slug:"/home"}],"INVALID_SLUG"],
 ["bad characters",[{slug:"home"},{slug:"foo_bar"}],"INVALID_SLUG"],
 ["blank page",[{slug:"home"},{}],"INVALID_PAGE"],
 ["null page",[{slug:"home"},null],"INVALID_PAGE"],
 ["not a page list",null,"INVALID_PAGES"],
 ["nonstring slug",[{slug:3}],"INVALID_SLUG"],
 ["too many pages",Array(26).fill({slug:"home"}),"INVALID_PAGES"]
];
for(const [name,pages,code] of invalid){
 const actual=H.prepareDraft(pages,C);
 yes(name+" rejects",!actual.ok&&actual.code===code);
 yes(name+" never writes",noGo(actual));
}
yes("Missing dependency rejected",H.prepareDraft(fixture(),{}).code==="CONTRACT_REQUIRED");
yes("Contract missing never writes",noGo(H.prepareDraft(fixture(),null)));
const routables=[["/","home",true],["/contacto","contacto",false],["/servicios","servicios",false]];
for(const [url,slug,home] of routables){
 const r=H.resolvePublicPath(url,fixture(),C);
 yes("resolve "+url,r.ok&&r.slug===slug&&r.isHome===home);
 yes("read remains simulated "+url,r.servedOverHttp===false&&!r.authorizedSite&&noGo(r));
 yes("returns public route "+url,r.route===url);
}
for(const [url,code] of [
 ["/home","RESERVED_HOME"],["/home/","NONCANONICAL_PATH"],
 ["/contacto/","NONCANONICAL_PATH"],["/servicios/more","NESTED_PATH"],
 ["http://bad","INVALID_PATH"],["/%2f","INVALID_PATH"],["/?q=1","INVALID_PATH"],
 ["/#x","INVALID_PATH"],["/contacto?preview=1","INVALID_PATH"],
 ["/contacto#x","INVALID_PATH"],["/MAYUS","INVALID_SLUG"],
 ["/missing","PAGE_NOT_FOUND"]
 ]){
 const r=H.resolvePublicPath(url,fixture(),C);
 yes("bad route "+url+" rejected",r.code===code&&!r.ok);
 yes("bad route "+url+" never serves",noGo(r));
}
const legacyPath=H.resolvePublicPath("/",[{slug:""},{slug:"home"}],C);
yes("routing cannot hide duplicate legacy Home",legacyPath.code==="DUPLICATE_SLUG");
yes("routing no access to DB",legacyPath.mayWrite===false);
const core=read("db/schema_core.review.sql"),schema=H.inspectCoreSchema(core);
yes("Existing SQL structural scan succeeds",schema.ok&&schema.structurallyCompatible);
yes("Published status exists",schema.controls.sitePublishedStatus);
yes("Pages table exists",schema.controls.pagesExists);
yes("site table exists",schema.controls.siteExists);
yes("unique(site,slug) exists",schema.controls.uniqueSiteSlug);
yes("Home regex accepted in current SQL",schema.controls.regexAcceptsHome);
yes("DB stored slug must be nonempty",schema.controls.slugNonempty);
yes("Composite FK tenant/site exists",schema.controls.compositeTenantFk);
yes("RLS statement present",schema.controls.pagesRlsEnabled);
yes("No anon grant observed",schema.controls.noAnonPagesGrant);
yes("Text scan not PostgreSQL parser",schema.parserOrRlsTested===false);
yes("SQL never executed",schema.sqlExecuted===false);
yes("Schema cannot guarantee Home exists",schema.guaranteesAtLeastOneHome===false);
yes("Schema cannot guarantee published Home",schema.guaranteesOnlyOneHomeAtPublish===false);
yes("Blocker named even if structural scan passes",schema.status==="HOME_EXISTENCE_UNPROVEN");
yes("Static schema result never GO",noGo(schema));
const sqlMutations=[
 ["missing pages table",src=>src.replace("create table public.mg_pages","create table public.old_pages"),"pagesExists"],
 ["missing site table",src=>src.replace("create table public.mg_sites","create table public.old_sites"),"siteExists"],
 ["unique removed",src=>src.replace("unique(site_id,slug),","-- removed unique"),"uniqueSiteSlug"],
 ["tenant FK removed",src=>src.replace("foreign key(site_id,organization_id)","foreign key(site_id)"),"compositeTenantFk"],
 ["RLS removed",src=>src.replace("alter table public.mg_pages enable row level security;","-- removed"),"pagesRlsEnabled"],
 ["regex disallows home",src=>src.replace(
  "slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),\n  title",
  "slug text not null check (slug ~ '^$'),\n  title"),"regexAcceptsHome"],
 ["published removed",src=>src.replace("('draft','review','published','suspended')",
  "('draft','review','suspended')"),"sitePublishedStatus"],
 ["anon granted",src=>src+"\ngrant select on public.mg_pages to anon;","noAnonPagesGrant"]
];
for(const [name,mutate,flag] of sqlMutations){
 const altered=H.inspectCoreSchema(mutate(core));
 yes(name+" detected",!altered.controls[flag]&&!altered.structurallyCompatible);
 yes(name+" no false permission",noGo(altered));
}
const injection=H.inspectCoreSchema("-- grant select on public.mg_pages to anon;\n"+core);
yes("SQL comments not treated as active grants",injection.controls.noAnonPagesGrant);
yes("Malformed schema fails structural check",!H.inspectCoreSchema("").structurallyCompatible);
const site={id:"siteA",organizationId:"orgA",status:"draft"};
const rows=[{organizationId:"orgA",siteId:"siteA",slug:"home"},
 {organizationId:"orgA",siteId:"siteA",slug:"servicios"}];
const stored=H.inspectStoredRows(site,rows);
yes("draft with Home valid",stored.ok&&stored.homeCount===1);
yes("publish candidate is content-only",stored.publishCandidate);
yes("rows scan never writes",noGo(stored));
const published={...site,status:"published"};
yes("published with single Home is structurally fine",H.inspectStoredRows(published,rows).ok);
yes("published without Home rejected",H.inspectStoredRows(published,[]).code==="PUBLISHED_HOME_MISSING");
yes("published only contact rejected",H.inspectStoredRows(published,[rows[1]]).code==="PUBLISHED_HOME_MISSING");
const draftNoHome=H.inspectStoredRows(site,[rows[1]]);
yes("draft without Home can temporarily exist",draftNoHome.ok&&draftNoHome.homeCount===0);
yes("draft without Home not publish candidate",draftNoHome.publishCandidate===false);
const duplicateStored=H.inspectStoredRows(site,[rows[0],rows[0]]);
yes("DB duplicate Home reported",duplicateStored.code==="DUPLICATE_STORED_SLUG");
const unsafePersist=H.inspectStoredRows(published,[{...rows[0],slug:""}]);
yes("legacy empty cannot persist",unsafePersist.code==="PERSISTED_SLUG_INVALID");
const cross=H.inspectStoredRows(published,[{...rows[0],organizationId:"orgB"}]);
yes("tenant mismatch rejected",cross.code==="CROSS_TENANT_OR_SITE_ROW");
const otherSite=H.inspectStoredRows(published,[{...rows[0],siteId:"siteB"}]);
yes("site mismatch rejected",otherSite.code==="CROSS_TENANT_OR_SITE_ROW");
const caps=H.inspectStoredRows(published,[{...rows[0],slug:"HOME"}]);
yes("uppercase stored rejected",caps.code==="PERSISTED_SLUG_INVALID");
const rowSameSlugDifferentSites=H.inspectStoredRows(published,[rows[0],{...rows[0],siteId:"siteB"}]);
yes("cannot combine sites into one query",rowSameSlugDifferentSites.code==="CROSS_TENANT_OR_SITE_ROW");
const otherPublished=H.inspectStoredRows({id:"siteB",organizationId:"orgB",status:"published"},
 [{siteId:"siteB",organizationId:"orgB",slug:"home"}]);
yes("separate tenant Home allowed",otherPublished.ok);
yes("invalid site rejected",H.inspectStoredRows({},rows).code==="INVALID_SITE_FIXTURE");
const candidate=H.inspectPublicationDraft({...site,status:"review"},fixture(),C);
yes("Review page content eligible",candidate.ok&&candidate.contentPreconditionsMet);
yes("Content-only cannot authorize real publish",candidate.requiresVerifiedTenantAuthorization&&candidate.requiresServerTransaction&&candidate.requiresPublicationMutex);
yes("Content-only NO GO",noGo(candidate));
const suspended=H.inspectPublicationDraft({...site,status:"suspended"},fixture(),C);
yes("Suspended site blocked",suspended.code==="SUSPENDED_SITE");
const without=H.inspectPublicationDraft({...site,status:"review"},[{slug:"contacto"}],C);
yes("Publish Home missing blocked",without.code==="MISSING_HOME");
const withDuplicates=H.inspectPublicationDraft(site,[{slug:""},{slug:"home"}],C);
yes("Publish legacy duplication blocked",withDuplicates.code==="DUPLICATE_SLUG");
const sqlReview=read("db/v34-home-publication.review.sql");
yes("Proposal SQL is not empty",sqlReview.length>3000);
yes("Every nonempty SQL line is comment",sqlReview.split(/\r?\n/).every(line=>!line.trim()||line.trim().startsWith("--")));
yes("V34 never proposed automatic live migration",sqlReview.includes("NO EJECUTAR"));
for(const required of [
 "SELECT ... FOR UPDATE","CAS","ROLLBACK","slug='home'","GET /home",
 "UNIQUE(site_id,slug)","GRANT INSERT/UPDATE","PUBLICACIÓN","SECURITY_DEFINER_REVIEW"
])yes("SQL review documents "+required,sqlReview.includes(required));
const v20=read("db/v20-contratos-propuestos.review.sql");
yes("Original V20 SQL remains a review document",v20.includes("NINGUNA SENTENCIA SQL ACTIVA"));
const roadmap=JSON.parse(read("staging/v33-master-roadmap.review.json"));
yes("C01 remains review-work item",roadmap.tasks.find(x=>x.id==="C01").status==="READY_FOR_GITHUB_WORK");
yes("C02 still remains independent",roadmap.tasks.find(x=>x.id==="C02").gate.includes("sql_compat"));
const v18=JSON.parse(read("staging/v18-manifest.review.json"));
yes("V18 staging remains unauthorized",v18.authorization.granted===false&&v18.state==="NOT_AUTHORIZED");
yes("V18 16 checks still pending",v18.checks.length===16&&v18.checks.every(x=>x.status==="pending"));
yes("No fetch in adapter",!read("shared/mg-home-compat-v34.js").includes("fetch("));
yes("No Supabase client in adapter",!read("shared/mg-home-compat-v34.js").includes("supabase."));
yes("No timers or shell",!read("shared/mg-home-compat-v34.js").includes("setTimeout("));
console.log(n+" / "+n+" V34 static Home compatibility checks passed — NO GO.");
