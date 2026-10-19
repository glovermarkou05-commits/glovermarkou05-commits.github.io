"use strict";
/* node apps/mg-web-studio-cloud/tests/readiness-v16.test.cjs
 * QA de contrato y pantalla estática; marcas NO validan entornos reales.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const win={};new Function("window",read("shared/mg-readiness-v16-demo.js"))(win);
const service=win.MGWebV16Readiness;
let total=0;
function check(name,yes){assert.ok(yes,name);total++;console.log("✓ "+name)}
function stub(){return {innerHTML:"",textContent:"",value:"",dataset:{},querySelectorAll:()=>[],addEventListener(){}};}
async function main(){
 check("planificación V16 disponible",service.version==="16.0-planning");
 check("14 requisitos definidos",service.gates.length===14);
 check("identificadores únicos",new Set(service.gates.map(x=>x.id)).size===14);
 const initial=service.assess({});
 check("ninguna casilla marcada",initial.coreDeclared===0);
 check("requisitos centrales 13",initial.coreTotal===13);
 check("13 pendientes",initial.corePending.length===13);
 check("no autoriza producción",initial.productionReady===false&&initial.authorized===false);
 check("no declara verificación",initial.verified===false);
 check("IA inicialmente desactivada",initial.aiDeclared===false);
 check("distingue IA del núcleo",service.gates.filter(g=>g.group==="optional-ai").length===1);
 check("requiere evidencia independiente",initial.items.every(g=>g.status.includes("Pendiente")));
 const partial=service.assess({auth:true,rls:true,project:true});
 check("tres declaraciones parciales",partial.coreDeclared===3);
 check("todavía sin autorización",partial.authorized===false);
 check("declarado no es verificado",partial.items.find(g=>g.id==="auth").status.includes("NO VERIFICADO"));
 const all=Object.fromEntries(service.gates.map(g=>[g.id,true]));
 const declared=service.assess(all);
 check("todos declarados 13/13",declared.coreDeclared===13&&declared.corePending.length===0);
 check("IA declarada no activada",declared.aiDeclared===true&&declared.productionReady===false);
 check("todos marcados siguen no verificados",declared.items.every(g=>g.status.includes("NO VERIFICADO")));
 check("sigue sin seguridad acreditada",declared.verified===false);
 check("entrada malformada manejada",service.assess("texto").coreDeclared===0);
 check("entradas desconocidas ignoradas",service.assess({fake:true}).coreDeclared===0);
 check("false no cuenta",service.assess({project:false,auth:true}).coreDeclared===1);
 check("números no cuentan",service.assess({project:1,auth:"true"}).coreDeclared===0);
 const staticHtml=read("preparacion-backend-v16.html");
 check("página de preparación",staticHtml.includes("Centro")||staticHtml.includes("Preparación del backend"));
 check("deja desactivado producción",staticHtml.includes("NO AUTORIZADA"));
 check("incluye aviso visible",staticHtml.includes("NO AUTORIZA DESPLIEGUE"));
 check("carga módulo compartido",staticHtml.includes('src="./shared/mg-readiness-v16-demo.js"'));
 let snippet=staticHtml.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
 check("script de tablero presente",!!snippet);
 let js=snippet[0].replace(/^<script>/,"").replace(/<\/script>$/,"").trim();
 const tail="\nrender();\n})();";check("cierre de interfaz",js.endsWith(tail));
 js=js.slice(0,-tail.length)+"\nrender();return {render,checked,engine};\n})();";
 const elements={},dom={getElementById(id){return elements[id]||(elements[id]=stub())},querySelectorAll:()=>[]};
 const ui=new Function("document","window","return "+js)(dom,win);
 check("inicia 0 / 13",elements.coverage.textContent==="0 / 13");
 check("producción sigue no autorizada",elements.production.textContent==="NO AUTORIZADA");
 check("IA permanece desactivada",elements.aiStatus.textContent==="DESACTIVADA");
 check("muestra todos los requisitos",service.gates.every(g=>elements.gateList.innerHTML.includes(g.title)));
 ui.checked.project=true;ui.checked.auth=true;ui.render();
 check("marcas actualizan contador",elements.coverage.textContent==="2 / 13");
 check("no publica por marcar",elements.production.textContent==="NO AUTORIZADA");
 Object.assign(ui.checked,all);ui.render();
 check("todas las marcas no desbloquean producción",elements.coverage.textContent==="13 / 13"&&elements.production.textContent==="NO AUTORIZADA");
 check("IA sigue desactivada con todas marcas",elements.aiStatus.textContent==="DESACTIVADA");
 elements.clear.onclick();
 check("reiniciar marcas",elements.coverage.textContent==="0 / 13");
 for(const page of ["prototipo.html","portal-cliente.html","laboratorio-api-v14.html","laboratorio-recuperacion-v15.html"]){
  const text=read(page);
  check("enlace tablero "+page,text.includes('href="./preparacion-backend-v16.html"'));
  const part=text.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
  check("script válido "+page,!!part);
  new Function(part[0].replace(/^<script>/,"").replace(/<\/script>$/,""));
 }
 check("sin llamadas de red",!staticHtml.includes("fetch(")&&!read("shared/mg-readiness-v16-demo.js").includes("fetch("));
 console.log("\n"+total+" pruebas de planificación V16 correctas.");
 return total;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
