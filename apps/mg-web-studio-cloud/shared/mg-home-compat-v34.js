/* MG WEB STUDIO CLOUD | V34 | HOME compatibility plan, READ ONLY.
 * Bridges V14 legacy slug="" -> V20 internal home + public "/".
 * No real SQL, HTTP, DB write, authenticating, publishing, file I/O or paid actions.
 * Existing V14 fixtures remain unchanged; no deployment or migration is implied.
 */
(function(root){"use strict";
const VERSION="34.0-review",HOME="home",PUBLIC_ROOT="/";
const plain=x=>x!==null&&typeof x==="object"&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const err=(code)=>({ok:false,code,go:false,simulationOnly:true,mayWrite:false,mayPublish:false});
const ok=x=>({ok:true,...x,go:false,simulationOnly:true,mayWrite:false,mayPublish:false});
const slugPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const id=x=>typeof x==="string"&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(x);
const copy=x=>JSON.parse(JSON.stringify(x));
function deps(contracts){
 return !!contracts&&typeof contracts.canonicalPages==="function"&&
  typeof contracts.normalizedSlug==="function"&&typeof contracts.pathToPage==="function";
}
// A pure *proposal* for conversion at a future trusted API boundary.
// It never writes to the SQL schema, and deliberately rejects duplicate Home aliases.
function prepareDraft(pages,contracts){
 if(!deps(contracts))return err("CONTRACT_REQUIRED");
 let normalized;
 try{normalized=contracts.canonicalPages(pages);}
 catch(e){return err("CANONICALIZATION_FAILED");}
 if(!normalized||normalized.ok!==true)return err(normalized&&normalized.code||"INVALID_PAGES");
 const home=normalized.pages.filter(x=>x.slug===HOME);
 if(home.length!==1)return err("HOME_NOT_UNIQUE");
 let legacy=0;
 for(const page of pages)if(page.slug==="")legacy++;
 const all=normalized.pages.every(x=>typeof x.slug==="string"&&
  slugPattern.test(x.slug)&&x.slug!==""&&x.slug.length<=75);
 if(!all)return err("STORAGE_SLUG_INVALID");
 const slugSet=new Set(normalized.pages.map(x=>x.slug));
 if(slugSet.size!==normalized.pages.length)return err("DUPLICATE_SLUG");
 return ok({homeSlug:HOME,publicPath:PUBLIC_ROOT,
  pages:copy(normalized.pages),legacyAliasesRewritten:legacy,
  status:"DRAFT_CONVERSION_ONLY",readyForDatabase:false,realSchemaVerified:false,
  target:"future-server-boundary"});
}
function resolvePublicPath(path,pages,contracts){
 if(!deps(contracts))return err("CONTRACT_REQUIRED");
 // V20 strictly rejects /home, nested paths and noncanonical encodings.
 let route;try{route=contracts.pathToPage(path);}
 catch(e){return err("ROUTING_FAILURE");}
 if(!route||route.ok!==true)return err(route&&route.code||"INVALID_PATH");
 const normalized=prepareDraft(pages,contracts);
 if(!normalized.ok)return err(normalized.code);
 const page=normalized.pages.find(x=>x.slug===route.slug);
 if(!page)return err("PAGE_NOT_FOUND");
 return ok({route:route.path,slug:route.slug,isHome:route.slug===HOME,
  page:copy(page),status:"STATIC_ROUTE_RESOLVED",servedOverHttp:false,
  authorizedSite:false});
}
const cleanSQL=sql=>typeof sql==="string"?
 sql.replace(/\/\*[\s\S]*?\*\//g,"").replace(/--[^\n]*/g,""):"";
function inspectCoreSchema(sql){
 const source=cleanSQL(sql);
 const site=(source.match(/create\s+table\s+public\.mg_sites\s*\(([\s\S]*?)\n\);/i)||[])[1]||"";
 const pages=(source.match(/create\s+table\s+public\.mg_pages\s*\(([\s\S]*?)\n\);/i)||[])[1]||"";
 const controls={
  siteExists:!!site,pagesExists:!!pages,
  slugNonempty:/\bslug\s+text\s+not\s+null\s+check\s*\(\s*slug\s*~\s*'\^\[a-z0-9\]/i.test(pages),
  regexAcceptsHome:/\bslug\s*~\s*'\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'/i.test(pages),
  uniqueSiteSlug:/\bunique\s*\(\s*site_id\s*,\s*slug\s*\)/i.test(pages),
  compositeTenantFk:/foreign\s+key\s*\(\s*site_id\s*,\s*organization_id\s*\)\s*references\s+public\.mg_sites\s*\(\s*id\s*,\s*organization_id\s*\)/i.test(pages),
  sitePublishedStatus:/\bstatus\s+text[^\n]*\n\s*check\s*\(\s*status\s+in\s*\([^)]*'published'/i.test(site),
  pagesRlsEnabled:/alter\s+table\s+public\.mg_pages\s+enable\s+row\s+level\s+security/i.test(source),
  noAnonPagesGrant:!/grant\s+[^;]*\bon\s+public\.mg_pages\s+to\s+(?:public|anon)\b/i.test(source)
 };
 const keys=Object.keys(controls);
 return ok({mode:"static-sql-text-only",controls,
  structurallyCompatible:keys.every(k=>controls[k]===true),
  guaranteesAtLeastOneHome:false,guaranteesOnlyOneHomeAtPublish:false,
  sqlExecuted:false,parserOrRlsTested:false,
  status:"HOME_EXISTENCE_UNPROVEN"});
}
// Existing *stored* rows must never be silently normalized: persisted slug="" implies
// schema drift, because the reviewed schema requires a nonempty slug.
// A published site must have exactly one Home and never lose it in later changes.
function inspectStoredRows(site,rows){
 if(!plain(site)||!id(site.id)||!id(site.organizationId)||
  !["draft","review","published","suspended"].includes(site.status)||
  !Array.isArray(rows))return err("INVALID_SITE_FIXTURE");
 const slugs=new Set();let homeCount=0;
 for(const row of rows){
  if(!plain(row)||row.siteId!==site.id||row.organizationId!==site.organizationId)
   return err("CROSS_TENANT_OR_SITE_ROW");
  if(typeof row.slug!=="string"||row.slug.length>75||
   !slugPattern.test(row.slug))return err("PERSISTED_SLUG_INVALID");
  if(slugs.has(row.slug))return err("DUPLICATE_STORED_SLUG");
  slugs.add(row.slug);
  if(row.slug===HOME)homeCount++;
 }
 if(site.status==="published"&&homeCount!==1)
  return err("PUBLISHED_HOME_MISSING");
 return ok({homeCount,hasHome:homeCount===1,
  storedPageCount:rows.length,
  publishCandidate:homeCount===1&&site.status!=="suspended",
  status:"INVENTORY_REVIEW_ONLY",databaseChecked:false});
}
function inspectPublicationDraft(site,pages,contracts){
 if(!plain(site)||!id(site.id)||!id(site.organizationId)||
  !["draft","review","published","suspended"].includes(site.status))
  return err("INVALID_SITE_FIXTURE");
 if(site.status==="suspended")return err("SUSPENDED_SITE");
 const review=prepareDraft(pages,contracts);
 if(!review.ok)return err(review.code);
 return ok({contentPreconditionsMet:true,homeSlug:HOME,publicPath:PUBLIC_ROOT,
  draftPageCount:review.pages.length,requiresServerTransaction:true,
  requiresVerifiedTenantAuthorization:true,requiresPublicationMutex:true,
  status:"CONTENT_ONLY_NOT_AUTHORIZATION"});
}
root.MGHomeCompatV34=Object.freeze({version:VERSION,homeSlug:HOME,publicRoot:PUBLIC_ROOT,
 prepareDraft,resolvePublicPath,inspectCoreSchema,inspectStoredRows,inspectPublicationDraft});
})(typeof window!=="undefined"?window:globalThis);
