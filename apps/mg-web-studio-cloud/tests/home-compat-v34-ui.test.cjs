"use strict";
/* V34 DOM-only test for the browser review page. No real browser/server/network.
 * node apps/mg-web-studio-cloud/tests/home-compat-v34-ui.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const html=read("revision-home-v34.html");
const lib={};for(const file of ["mg-contracts-v20.js","mg-home-compat-v34.js"])
 new Function("window",read("shared/"+file))(lib);
let n=0;const check=(label,actual)=>{assert.ok(actual,label);n++;};
const dummy=()=>({value:"",textContent:"",disabled:false,onclick:null});
const ids=["fixture","route","normalize","checkPublish","resolve","pagesResult","routeResult"];
const elems=Object.fromEntries(ids.map(k=>[k,dummy()]));
const document={getElementById:k=>elems[k]||(elems[k]=dummy()),
 querySelectorAll:()=>ids.filter(k=>["normalize","checkPublish","resolve"].includes(k)).map(k=>elems[k])};
const match=html.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
check("Inline local script located",!!match);
const src=match[0].replace(/^<script>/,"").replace(/<\/script>$/,"");
new Function("document","window",src)(document,lib);
check("Normalizar connected",typeof elems.normalize.onclick==="function");
check("Publish review connected",typeof elems.checkPublish.onclick==="function");
check("Resolve connected",typeof elems.resolve.onclick==="function");
check("Root link from V20",read("laboratorio-contratos-v20.html").includes('./revision-home-v34.html'));
check("Meta noindex",html.includes('name="robots" content="noindex,nofollow"'));
check("Spanish language",html.includes('lang="es"'));
check("V34 scripts relative",html.includes('src="./shared/mg-home-compat-v34.js"'));
check("V20 scripts relative",html.includes('src="./shared/mg-contracts-v20.js"'));
check("A11y live regions",html.includes('aria-live="polite"'));
check("No form submit",!html.includes('type="submit"'));
check("No network requests",!html.includes("fetch("));
check("No local storage",!html.includes("localStorage"));
check("No direct Supabase",!html.includes("supabase."));
check("No external inline scripts",!html.includes("https://"));
check("NO GO message visible",html.includes("NO GO · REVISIÓN LOCAL"));
check("SQL review linked",html.includes("./db/v34-home-publication.review.sql"));
elems.fixture.value="legacy";elems.route.value="/";
elems.normalize.onclick();
check("Legacy mapped",elems.pagesResult.textContent.includes('"slug": "home"'));
check("Legacy conversion counted",elems.pagesResult.textContent.includes('"legacyAliasesRewritten": 1'));
check("Legacy no write",elems.pagesResult.textContent.includes('"mayWrite": false'));
elems.resolve.onclick();
check("Root resolved",elems.routeResult.textContent.includes('"route": "/"'));
check("Canonical slug displayed",elems.routeResult.textContent.includes('"slug": "home"'));
check("Not actually served",elems.routeResult.textContent.includes('"servedOverHttp": false'));
elems.route.value="/home";elems.resolve.onclick();
check("Noncanonical /home rejected",elems.routeResult.textContent.includes("RESERVED_HOME"));
elems.route.value="/contacto";elems.resolve.onclick();
check("Contact page resolves",elems.routeResult.textContent.includes('"slug": "contacto"'));
elems.route.value="/contacto/?p=1";elems.resolve.onclick();
check("Query/noncanonical blocked",elems.routeResult.textContent.includes("INVALID_PATH"));
elems.checkPublish.onclick();
check("Legacy content eligible",elems.pagesResult.textContent.includes('"contentPreconditionsMet": true'));
check("Only fake publish check",elems.pagesResult.textContent.includes('"mayPublish": false'));
check("Server transaction still required",elems.pagesResult.textContent.includes('"requiresServerTransaction": true'));
elems.fixture.value="missing";elems.normalize.onclick();
check("Missing Home blocked",elems.pagesResult.textContent.includes("MISSING_HOME"));
elems.fixture.value="duplicate";elems.normalize.onclick();
check("Duplicate Home alias blocked",elems.pagesResult.textContent.includes("DUPLICATE_SLUG"));
elems.fixture.value="canonical";elems.normalize.onclick();
check("Already canonical recognized",elems.pagesResult.textContent.includes('"legacyAliasesRewritten": 0'));
check("Canonical still no publish",elems.pagesResult.textContent.includes('"mayPublish": false'));
const disabled=Object.fromEntries(ids.map(k=>[k,dummy()]));
new Function("document","window",src)({
 getElementById:k=>disabled[k]||(disabled[k]=dummy()),
 querySelectorAll:()=>["normalize","checkPublish","resolve"].map(k=>disabled[k])
},{});
check("Missing libs disable buttons",["normalize","checkPublish","resolve"].every(k=>disabled[k].disabled));
check("Missing libs shows warning",disabled.pagesResult.textContent.includes("No se cargaron"));
console.log(n+" / "+n+" V34 Home review UI tests passed (simulated DOM, NO GO).");
