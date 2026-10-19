"use strict";
/* node apps/mg-web-studio-cloud/tests/contracts-v20-ui.test.cjs
 * Solo DOM simulado, no QA de navegador real.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const win={};new Function("window",read("shared/mg-contracts-v20.js"))(win);
let count=0;const ok=(name,yes)=>{assert.ok(yes,name);count++;console.log("✓ "+name)};
const el=()=>({value:"",textContent:"",innerHTML:"",dataset:{},disabled:false,style:{},onclick:null});
function main(){
 const html=read("laboratorio-contratos-v20.html");
 const script=html.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
 ok("HTML tiene script local",!!script);
 const ids=["slug","normalize","resolve","routeResult","actor","site","status","action",
  "testDecision","decisionResult"];
 const dom=Object.fromEntries(ids.map(id=>[id,el()]));
 const document={getElementById:id=>dom[id]||(dom[id]=el()),querySelectorAll:()=>[]};
 new Function("document","window",script[0].replace(/^<script>/,"").replace(/<\/script>$/,""))(document,win);
 ok("normalizador conectado",typeof dom.normalize.onclick==="function");
 ok("resolver conectado",typeof dom.resolve.onclick==="function");
 ok("decisión conectada",typeof dom.testDecision.onclick==="function");
 dom.slug.value="";dom.normalize.onclick();
 ok("slug demo vacío normalizado",dom.routeResult.textContent.includes('"slug":"home"'));
 ok("ruta raíz visible",dom.routeResult.textContent.includes('"path":"/"'));
 dom.slug.value="contacto";dom.normalize.onclick();
 ok("slug contacto",dom.routeResult.textContent.includes('"/contacto"'));
 dom.slug.value="HOME";dom.normalize.onclick();
 ok("rechaza mayúsculas",dom.routeResult.textContent.includes("INVALID_SLUG"));
 dom.slug.value="/";dom.resolve.onclick();
 ok("URL raíz",dom.routeResult.textContent.includes('"slug":"home"'));
 dom.slug.value="/home";dom.resolve.onclick();
 ok("URL /home reservada",dom.routeResult.textContent.includes("RESERVED_HOME"));
 dom.slug.value="/contacto";dom.resolve.onclick();
 ok("URL contacto",dom.routeResult.textContent.includes('"slug":"contacto"'));
 dom.slug.value="/productos/uno";dom.resolve.onclick();
 ok("URL anidada no permitida",dom.routeResult.textContent.includes("NESTED_PATH"));
 dom.actor.value="SUPERADMIN";dom.site.value="s1";dom.status.value="";
 dom.action.value="create";dom.testDecision.onclick();
 ok("SUPERADMIN crea",dom.decisionResult.textContent.includes('"state":"draft"'));
 dom.action.value="submit";dom.status.value="draft";dom.testDecision.onclick();
 ok("SUPERADMIN envía",dom.decisionResult.textContent.includes('"state":"submitted"'));
 dom.actor.value="SUPERADMIN_LOW";dom.testDecision.onclick();
 ok("SUPERADMIN sin MFA bloqueado",dom.decisionResult.textContent.includes("MFA_REQUIRED"));
 dom.actor.value="CLIENT_OWNER";dom.status.value="submitted";dom.action.value="approve";
 dom.testDecision.onclick();
 ok("OWNER aprueba",dom.decisionResult.textContent.includes('"state":"approved"'));
 dom.actor.value="CLIENT_ADMIN";dom.testDecision.onclick();
 ok("ADMIN aprueba",dom.decisionResult.textContent.includes('"state":"approved"'));
 dom.actor.value="CLIENT_EDITOR";dom.action.value="approve";dom.testDecision.onclick();
 ok("EDITOR no aprueba",dom.decisionResult.textContent.includes("FORBIDDEN"));
 dom.action.value="changes";dom.testDecision.onclick();
 ok("EDITOR solicita cambios",dom.decisionResult.textContent.includes('"state":"needs_changes"'));
 dom.site.value="s2";dom.testDecision.onclick();
 ok("EDITOR de otro sitio bloqueado",dom.decisionResult.textContent.includes("SCOPE_DENIED"));
 dom.actor.value="CLIENT_VIEWER";dom.site.value="s1";dom.testDecision.onclick();
 ok("VIEWER no puede solicitar cambios",dom.decisionResult.textContent.includes("FORBIDDEN"));
 dom.actor.value="CLIENT_OWNER";dom.action.value="apply";dom.status.value="approved";
 dom.testDecision.onclick();
 ok("OWNER aplica al borrador",dom.decisionResult.textContent.includes('"state":"applied"'));
 ok("no se interpreta como autorización real",dom.decisionResult.textContent.includes('"authorizationIsReal":false'));
 dom.action.value="revise";dom.actor.value="SUPERADMIN";dom.status.value="needs_changes";dom.testDecision.onclick();
 ok("nueva revisión",dom.decisionResult.textContent.includes('"revision":2'));
 dom.actor.value="CLIENT_OWNER";dom.status.value="draft";dom.action.value="approve";dom.testDecision.onclick();
 ok("transición inválida",dom.decisionResult.textContent.includes("INVALID_TRANSITION"));
 ok("aviso NO GO",html.includes("PROPUESTA SIN APLICAR · NO GO"));
 ok("URL SQL comentario",html.includes("v20-contratos-propuestos.review.sql"));
 ok("sin fetch",!html.includes("fetch("));
 ok("sin almacenamiento",!html.includes("localStorage"));
 ok("sin envío de formularios",!html.includes('type="submit"'));
 for(const file of ["prototipo.html","portal-cliente.html"]){
  const content=read(file);
  ok("enlace V20 "+file,content.includes('href="./laboratorio-contratos-v20.html"'));
  const match=content.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
  ok("script principal "+file,!!match);
  new Function(match[0].replace(/^<script>/,"").replace(/<\/script>$/,""));
  ok("sintaxis principal "+file,true);
 }
 console.log("\n"+count+" pruebas V20 UI con DOM simulado correctas.");
 return count;
}
if(require.main===module)main();
module.exports={main};
