"use strict";
/* node apps/mg-web-studio-cloud/tests/transactional-api-v14-ui.test.cjs
 * QA del laboratorio con DOM simulado; NO prueba Chrome/Android reales.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=f=>fs.readFileSync(path.join(root,f),"utf8");
const win={};
for(const f of ["shared/mg-ai-web-assistant-demo.js","shared/mg-proposal-exchange-demo.js",
 "shared/mg-transactional-api-v14-demo.js","shared/mg-service-adapter-v16-demo.js"])new Function("window",read(f))(win);
let count=0;function check(name,truth){assert.ok(truth,name);count++;console.log("✓",name);}
function element(){return {innerHTML:"",textContent:"",value:"",dataset:{},style:{},disabled:false,
 querySelectorAll:()=>[],addEventListener(){},focus(){},select(){}};}
async function main(){
 const html=read("laboratorio-api-v14.html");
 const inline=html.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
 check("JS de laboratorio V14",!!inline);
 let js=inline[0].replace(/^<script>/,"").replace(/<\/script>$/,"").trim();
 const end="\nrefresh();\n})();";check("cierre de laboratorio estable",js.endsWith(end));
 js=js.slice(0,-end.length)+"\nreturn {api,directory,sessions,refresh,sendOperation,perform,call,inspect:()=>api.inspectForTests()};\n})();";
 const els={};const dom={getElementById(id){return els[id]||(els[id]=element())},
  querySelectorAll:()=>[],createElement:()=>element()};
 els.actor=element();els.actor.value="super";
 els.site=element();els.site.value="c1.s1";
 els.brand=element();els.brand.value="Café Horizonte";
 els.note=element();els.note.value="Modificar los títulos ficticios de portada.";
 const ctx=new Function("document","window","return "+js)(dom,win);
 check("API simulada integrada",ctx.api.version==="14.0-demo");
 await ctx.refresh();
 check("sin propuestas iniciales",els.proposalCount.textContent===0);
 check("sin notificaciones iniciales",els.unreadCount.textContent===0);
 check("outbox vacío",els.outboxCount.textContent===0);
 await ctx.sendOperation("create");await ctx.refresh();
 check("super crea propuesta",els.proposalCount.textContent===1);
 check("super ve borrador",els.proposals.innerHTML.includes("draft"));
 check("outbox todavía cero",els.outboxCount.textContent===0);
 await ctx.sendOperation("submit");await ctx.refresh();
 check("envío en bandeja",els.proposals.innerHTML.includes("submitted"));
 check("outbox enviado",els.outboxCount.textContent===1);
 els.actor.value="owner1";await ctx.refresh();
 check("propietario ve propuesta",els.proposalCount.textContent===1);
 check("propietario recibe aviso",els.unreadCount.textContent===1);
 els.actor.value="owner2";await ctx.refresh();
 check("cliente ajeno no ve propuesta",els.proposalCount.textContent===0);
 check("cliente ajeno no ve avisos",els.unreadCount.textContent===0);
 els.actor.value="viewer1";await ctx.refresh();
 check("viewer ve pero no aplica",els.proposalCount.textContent===1&&els.apply.disabled);
 els.actor.value="owner1";await ctx.refresh();
 await ctx.sendOperation("reviewApproved");await ctx.refresh();
 check("decisión aprobada",els.proposals.innerHTML.includes("approved"));
 check("resolución HTTP 200",els.result.textContent.includes("200"));
 els.actor.value="editor1";await ctx.refresh();
 check("editor puede leer borrador",!els.apply.disabled);
 await ctx.sendOperation("apply");await ctx.refresh();
 check("aplicación solo a borrador",els.proposals.innerHTML.includes("applied"));
 check("borrador con versión 2",(await ctx.call("editor1","GET",
  "/api/v1/organizations/c1/sites/s1/draft")).body.draft.version===2);
 check("no se publicó",(await ctx.call("owner1","GET",
  "/api/v1/organizations/c1/sites/s1/draft")).body.draft.publishedCount===0);
 check("tercer sitio no cambió",(await ctx.call("owner1","GET",
  "/api/v1/organizations/c1/sites/s3/draft")).body.draft.version===1);
 check("no red externa",!read("laboratorio-api-v14.html").includes("fetch("));
 for(const file of ["prototipo.html","portal-cliente.html","bandeja-propuestas-demo.html"]){
  const str=read(file);
  check("enlace a laboratorio "+file,str.includes('href="./laboratorio-api-v14.html"'));
  const x=str.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
  check("script existente "+file,!!x);
  new Function(x[0].replace(/^<script>/,"").replace(/<\/script>$/,""));
  check("script válido "+file,true);
 }
 console.log("\n"+count+" comprobaciones UI V14 con DOM simulado correctas.");
 return count;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
