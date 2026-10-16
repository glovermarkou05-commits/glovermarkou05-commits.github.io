"use strict";
/* node apps/mg-web-studio-cloud/tests/proposal-exchange-v10.test.cjs
   Demostración exclusivamente local: sin servidores, costos ni APIs.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(base,p),"utf8");
const globalDemo={};new Function("window",read("shared/mg-ai-web-assistant-demo.js"))(globalDemo);
new Function("window",read("shared/mg-proposal-exchange-demo.js"))(globalDemo);
new Function("window",read("shared/mg-proposal-review-demo.js"))(globalDemo);
const generator=globalDemo.MGAIWebAssistant,exchange=globalDemo.MGWebProposalExchange;
const example={brand:"Café Horizonte",type:"restaurante",style:"natural",goal:"contacto",plan:"Crece",
 offering:"café de especialidad, postres y meriendas",audience:"familias, estudiantes y profesionales"};
const packet=exchange.createPackage({clientId:"c1",siteId:"s1",plan:"Crece",proposal:generator.createProposal(example).proposal});
const target={clientId:"c1",siteId:"s1",plan:"Crece"};
let passed=0;
function check(title,value){assert.ok(value,title);passed++;console.log("✓",title);}
function panel(file,which){
 const html=read(file),match=html.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
 assert.ok(match,"Script no encontrado");
 let js=match[0].replace(/^<script>/,"").replace(/<\/script>$/,"").trim();
 const tail="\nrender();\n})();";assert.ok(js.endsWith(tail),"Footer inesperado");
 const extra=which==="admin"?
 "return {state,prepareAgencyAI,exportAgencyAIPackage,agencyAIPage,render};":
 "return {site,organizations,receiveAIProposalPackage,decideClientProposal,applyAIProposal,aiProposalByOrg,role:x=>activeRole=x,org:x=>activeOrg=x,tab:x=>tab=x,aiWizardPage,render};";
 js=js.slice(0,-tail.length)+"\n"+extra+"\n})();";
 const elements={};const dom={getElementById(id){return elements[id]||(elements[id]={innerHTML:"",textContent:"",dataset:{},style:{},value:"",querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},classList:{remove(){},toggle(){}}})}};
 const app=new Function("document","window","confirm","alert","prompt","return "+js)(dom,
 {MGAIWebAssistant:generator,MGWebProposalExchange:exchange,MGWebProposalReview:globalDemo.MGWebProposalReview,location:{search:""}},()=>true,()=>{},()=>{});
 return {app,elements};
}
async function main(){
 check("paquete válido",packet.ok);
 check("formato registrado",packet.packet.format==="mg-web-studio-proposal/v10-demo-1");
 check("marca demo manual",exchange.mode==="manual-demo");
 check("no hay credenciales",!packet.json.includes("access_token")&&!packet.json.includes("password"));
 check("JSON parse válido",exchange.parsePackage(packet.json,target).ok);
 check("separación cliente",!exchange.parsePackage(packet.json,{clientId:"c2",siteId:"s2",plan:"Crece"}).ok);
 check("separación sitio",!exchange.parsePackage(packet.json,{clientId:"c1",siteId:"s2",plan:"Crece"}).ok);
 check("plan no coincide",!exchange.parsePackage(packet.json,{clientId:"c1",siteId:"s1",plan:"Pro"}).ok);
 check("texto no JSON denegado",!exchange.parsePackage("{bad",target).ok);
 check("tamaño excesivo",!exchange.parsePackage("x".repeat(41000),target).ok);
 check("paquete sin formato",!exchange.parsePackage(JSON.stringify({...packet.packet,format:"unknown"}),target).ok);
 check("deniega etiqueta HTML",!exchange.parsePackage(JSON.stringify({...packet.packet,proposal:{...packet.packet.proposal,
  pages:packet.packet.proposal.pages.map((page,i)=>i? page:{...page,title:"<script>alert(1)</script>"})}}),target).ok);
 check("deniega tipo de bloque desconocido",!exchange.parsePackage(JSON.stringify({...packet.packet,proposal:{
 ...packet.packet.proposal,pages:packet.packet.proposal.pages.map((page,i)=>i?page:{...page,blocks:[{type:"iframe",title:"Contenido",body:"Texto ejemplo",visible:true}]})}}),target).ok);
 check("deniega ruta repetida",!exchange.parsePackage(JSON.stringify({...packet.packet,proposal:{
 ...packet.packet.proposal,pages:[...packet.packet.proposal.pages.slice(0,2),
 {...packet.packet.proposal.pages[2],slug:"servicios"}]}}),target).ok);
 check("deniega URL malformada de página",!exchange.parsePackage(JSON.stringify({...packet.packet,proposal:{
 ...packet.packet.proposal,pages:packet.packet.proposal.pages.map((page,i)=>i===1?{...page,slug:"../admin"}:page)}}),target).ok);
 const untrusted=JSON.stringify({...packet.packet,proposal:{...packet.packet.proposal,
  pages:packet.packet.proposal.pages.map((page,i)=>i? page:{...page,blocks:page.blocks.map((b,j)=>j?
   b:{...b,image:"https://bad.example/file.png",extraKey:"secret-data"})})}});
 const normalized=exchange.parsePackage(untrusted,target);
 check("saneamiento de campos ignorados",normalized.ok&&normalized.data.proposal.pages[0].blocks[0].image===""&&!Object.hasOwn(normalized.data.proposal.pages[0].blocks[0],"extraKey"));
 for(const plan of ["Start","Crece","Pro"]){
  const pr=generator.createProposal({...example,plan});
  const pk=exchange.createPackage({clientId:"c1",siteId:"s1",plan,proposal:pr.proposal});
  check("exporta plan "+plan,pk.ok);
  check("importa plan "+plan,exchange.parsePackage(pk.json,{clientId:"c1",siteId:"s1",plan}).ok);
 }
 const admin=panel("prototipo.html","admin"),client=panel("portal-cliente.html","client");
 check("agencia produce propuesta",admin.app.prepareAgencyAI({...example,siteId:"s1"}).ok);
 const exported=admin.app.exportAgencyAIPackage("s1");
 check("agencia prepara transferencia",exported.ok);
 check("sin cambios en estado de sitio",admin.app.state.sites.find(s=>s.id==="s1").status==="Borrador");
 check("panel agencia muestra botón exportar",admin.app.agencyAIPage().includes("data-export-agency-ai"));
 check("panel cliente muestra form de importación",client.app.aiWizardPage().includes("id=\"aiImportForm\""));
 check("cliente valida transferencia",client.app.receiveAIProposalPackage(exported.json).ok);
 check("todavía sin modificar borrador",client.app.site().pages.length===1);
 check("tres páginas pendientes",client.app.aiProposalByOrg.c1.proposal.pages.length===3);
 check("requiere aprobación antes de aplicar",!client.app.applyAIProposal().ok);
 check("cliente aprueba la revisión",client.app.decideClientProposal("approved","").ok);
 check("acepta en borrador",client.app.applyAIProposal().ok);
 check("añadió dos páginas",client.app.site().pages.length===3);
 check("sin publicación ni release",client.app.site().releases.length===0);
 check("reimportación tras aplicación",client.app.receiveAIProposalPackage(exported.json).ok);
 const title=client.app.site().pages[0].draft.title;
 check("nueva aprobación explícita de revisión V10",client.app.decideClientProposal("approved","").ok);
 check("colisión de slug detectada",!client.app.applyAIProposal().ok);
 check("sin cambios parciales tras colisión",client.app.site().pages[0].draft.title===title);
 client.app.role("CLIENT_VIEWER");
 check("viewer no puede aprobar",!client.app.decideClientProposal("approved","").ok);
 check("viewer no aplica",!client.app.applyAIProposal().ok);
 client.app.role("CLIENT_OWNER");client.app.org("c2");
 check("cliente B no importa de A",!client.app.receiveAIProposalPackage(exported.json).ok);
 check("cliente B sin cambios",client.app.site().pages.length===1);
 check("cliente B tiene paquete propio",admin.app.prepareAgencyAI({...example,siteId:"s2"}).ok);
 const packet2=admin.app.exportAgencyAIPackage("s2");
 check("paquete B es Start",packet2.ok&&packet2.packet.proposal.pages.length===1);
 check("cliente B recibe paquete B",client.app.receiveAIProposalPackage(packet2.json).ok);
 check("B aprueba su propuesta",client.app.decideClientProposal("approved","").ok);
 check("cliente B aplica Inicio",client.app.applyAIProposal().ok&&client.app.site().pages.length===1);
 check("cliente A conserva tres páginas",client.app.organizations.find(x=>x.id==="c1").site.pages.length===3);
 client.app.tab("asistente-ia");client.app.render();
 check("render después de transferencia",client.elements.content.innerHTML.includes("aiImportForm"));
 admin.app.state.clients.find(x=>x.id==="c1").plan="Pro";
 check("cambio de plan bloquea exportación obsoleta",!admin.app.exportAgencyAIPackage("s1").ok);
 check("scripts sin fetch",!read("shared/mg-proposal-exchange-demo.js").includes("fetch("));
 console.log("\n"+passed+" pruebas V10 de paquete de propuesta correctas.");
 return passed;
}
if(require.main===module)main().catch(err=>{console.error(err);process.exitCode=1;});
module.exports={main};
