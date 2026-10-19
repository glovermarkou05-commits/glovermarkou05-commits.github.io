"use strict";
/* node apps/mg-web-studio-cloud/tests/resilience-v15-ui.test.cjs
 * Comprobaciones DOM simuladas; no es QA real en navegador.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const window={};
for(const file of ["shared/mg-ai-web-assistant-demo.js","shared/mg-proposal-exchange-demo.js",
 "shared/mg-transactional-api-v14-demo.js","shared/mg-v15-recovery-demo.js"])
 new Function("window",read(file))(window);
let passed=0;const check=(title,val)=>{assert.ok(val,title);passed++;console.log("✓ "+title)};
function stub(){return {innerHTML:"",textContent:"",value:"",disabled:false,dataset:{},style:{},
 querySelectorAll:()=>[],addEventListener(){},focus(){},select(){}};}
async function main(){
 const html=read("laboratorio-recuperacion-v15.html");
 const match=html.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
 check("script local presente",!!match);
 let code=match[0].replace(/^<script>/,"").replace(/<\/script>$/,"").trim();
 const end="\nreset();\n})();";
 check("arranque de laboratorio V15",code.endsWith(end));
 code=code.slice(0,-end.length)+"\nreset(); return {directory,sessions,newAPI,call,refresh};\n})();";
 const elements={},document={getElementById(id){return elements[id]||(elements[id]=stub())},
 querySelectorAll:()=>[],createElement:()=>stub()};
 elements.reader=stub();elements.reader.value="owner";
 const ui=new Function("document","window","return "+code)(document,window);
 const click=async(name)=>{assert.equal(typeof elements[name].onclick,"function","button "+name);await elements[name].onclick();};
 check("sin propuesta al inicio",elements.proposalState.textContent==="Sin crear");
 check("borrador inicia v1",String(elements.draftVersion.textContent)==="1");
 check("sin checkpoint",elements.checkpointState.textContent==="No creado");
 await click("create");
 check("propuesta creada",elements.proposalState.textContent==="draft (v1)");
 check("creación sin eventos",elements.eventCount.textContent===0);
 await click("failSend");
 check("fallo visible 503",elements.feedback.textContent.includes("503"));
 check("no cambia status en fallo",elements.proposalState.textContent==="draft (v1)");
 check("outbox no se modifica al fallar",elements.eventCount.textContent===0);
 await click("retrySend");
 check("reintento exitoso 200",elements.feedback.textContent.includes("200"));
 check("propuesta enviada",elements.proposalState.textContent==="submitted (v1)");
 check("outbox contiene evento",elements.eventCount.textContent===1);
 await click("approve");
 check("aprobada",elements.proposalState.textContent==="approved (v1)");
 check("dos eventos",elements.eventCount.textContent===2);
 await click("saveCheckpoint");
 check("checkpoint guardado",elements.checkpointState.textContent==="Creado");
 check("resumen checkpoint presente",elements.checkpointDetails.value.includes("checksum"));
 await click("apply");
 check("borrador versión dos",String(elements.draftVersion.textContent)==="2");
 check("propuesta aplicada",elements.proposalState.textContent==="applied (v1)");
 check("tercer evento",elements.eventCount.textContent===3);
 await click("restore");
 check("checkpoint restaura estado aprobado",elements.proposalState.textContent==="approved (v1)");
 check("checkpoint restaura versión 1",String(elements.draftVersion.textContent)==="1");
 check("outbox vuelve a dos",elements.eventCount.textContent===2);
 await click("readEvents");
 check("cursor local avanza",elements.cursorLabel.textContent!=="Cursor: 0");
 check("muestra eventos",elements.events.innerHTML.includes("Evento #"));
 check("lectura de eventos sin usar red",!html.includes("fetch("));
 await click("readEvents");
 check("cursor sin más eventos",elements.events.innerHTML.includes("No hay nuevos eventos"));
 elements.reader.value="other";
 await click("resetCursor");
 await click("readEvents");
 check("otro negocio bloqueado por API",elements.feedback.textContent.includes("403"));
 elements.reader.value="viewer";
 await click("resetCursor");
 await click("readEvents");
 check("viewer recibe metadatos",elements.events.innerHTML.includes("Evento #"));
 await click("reset");
 check("reinicio limpia propuesta",elements.proposalState.textContent==="Sin crear");
 check("reinicio limpia checkpoint",elements.checkpointState.textContent==="No creado");
 check("reinicio limpia eventos",elements.eventCount.textContent===0);
 for(const file of ["prototipo.html","portal-cliente.html","laboratorio-api-v14.html"]){
  const content=read(file);
  check("enlace a V15 en "+file,content.includes('href="./laboratorio-recuperacion-v15.html"'));
  const script=content.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
  check("script principal de "+file,!!script);
  new Function(script[0].replace(/^<script>/,"").replace(/<\/script>$/,""));
  check("sintaxis de "+file,true);
 }
 console.log("\n"+passed+" pruebas de UI V15 correctas en DOM simulado.");
 return passed;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
