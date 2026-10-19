"use strict";
/* V35 status-review UI: DOM simulation only. No real browser, HTTP or DB.
 * node apps/mg-web-studio-cloud/tests/proposal-status-compat-v35-ui.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const html=read("revision-estados-v35.html"),root={};
for(const f of ["mg-contracts-v20.js","mg-proposal-status-compat-v35.js"])
 new Function("window",read("shared/"+f))(root);
let n=0;const check=(label,val)=>{assert.ok(val,label);n++};
const make=()=>({value:"",textContent:"",disabled:false,onclick:null});
const ids=["status","target","normalize","project","stateResult","targetResult"];
const dom=Object.fromEntries(ids.map(id=>[id,make()]));
const document={getElementById:id=>dom[id]||(dom[id]=make()),
 querySelectorAll:()=>["normalize","project"].map(id=>dom[id])};
const inline=html.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
check("UI script present",!!inline);
const src=inline[0].replace(/^<script>/,"").replace(/<\/script>$/,"");
new Function("document","window",src)(document,root);
check("Normalize action wired",typeof dom.normalize.onclick==="function");
check("Project action wired",typeof dom.project.onclick==="function");
check("Spanish language",html.includes('lang="es"'));
check("No indexing",html.includes('name="robots" content="noindex,nofollow"'));
check("No GO label",html.includes("NO GO · REVISIÓN LOCAL"));
check("No form posts",!html.includes('type="submit"'));
check("No fetch",!html.includes("fetch("));
check("No localStorage",!html.includes("localStorage"));
check("No Supabase",!html.includes("supabase."));
check("Shared V20 included",html.includes('src="./shared/mg-contracts-v20.js"'));
check("Shared V35 included",html.includes('src="./shared/mg-proposal-status-compat-v35.js"'));
check("Comment SQL linked",html.includes("./db/v35-estados-propuestas.review.sql"));
check("V20 lab links V35",read("laboratorio-contratos-v20.html").includes("./revision-estados-v35.html"));
check("Live regions",html.includes('aria-live="polite"'));
dom.status.value="submitted_for_review";dom.normalize.onclick();
check("submitted_for_review recognized",dom.stateResult.textContent.includes('"status": "submitted"'));
check("legacy marked",dom.stateResult.textContent.includes('"wasLegacy": true'));
check("Never writes",dom.stateResult.textContent.includes('"mayWrite": false'));
check("Never authorizes",dom.stateResult.textContent.includes('"go": false'));
dom.status.value="applied_to_draft";dom.normalize.onclick();
check("applied_to_draft recognized",dom.stateResult.textContent.includes('"status": "applied"'));
dom.status.value="changes";dom.normalize.onclick();
check("changes not a proposal status",dom.stateResult.textContent.includes("INVALID_STATUS"));
dom.status.value="submitted_for_review";dom.target.value="canonical-v20-proposed";
dom.project.onclick();
check("Canonical proposed writes submitted",dom.targetResult.textContent.includes('"proposedStatus": "submitted"'));
check("Canonical target still unverified",dom.targetResult.textContent.includes('"actualTargetVerified": false'));
check("Real writes zero",dom.targetResult.textContent.includes('"realWritesPerformed": 0'));
check("No GO even canonical",dom.targetResult.textContent.includes('"go": false'));
dom.target.value="legacy-v13-proposed";dom.project.onclick();
check("Legacy target preserves historical spelling",dom.targetResult.textContent.includes('"proposedStatus": "submitted_for_review"'));
check("Legacy contract not a DB",dom.targetResult.textContent.includes('"actualTargetVerified": false'));
dom.target.value="actual-production";dom.project.onclick();
check("Unknown production target rejected",dom.targetResult.textContent.includes("UNVERIFIED_TARGET_CONTRACT"));
const disabled=Object.fromEntries(ids.map(id=>[id,make()]));
const documentMissing={getElementById:id=>disabled[id]||(disabled[id]=make()),
 querySelectorAll:()=>["normalize","project"].map(id=>disabled[id])};
new Function("document","window",src)(documentMissing,{});
check("Missing libraries disable controls",disabled.normalize.disabled&&disabled.project.disabled);
check("Missing library warning",disabled.stateResult.textContent.includes("No se cargaron"));
console.log(n+" / "+n+" V35 proposal status UI DOM simulations correct; NO GO.");
