"use strict";
/* node apps/mg-web-studio-cloud/tests/ai-web-assistant-demo.test.cjs */
const assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const source=read("shared/mg-ai-web-assistant-demo.js");
const win={};new Function("window",source)(win);
const gen=win.MGAIWebAssistant;
let passed=0;
function check(label,condition){assert.ok(condition,label);passed++;console.log("✓ "+label);}
const input={brand:"Papelería Nube",type:"tienda",style:"creativo",goal:"vender",plan:"Crece",
 audience:"estudiantes y familias",offering:"papelería, útiles escolares y artículos de arte"};
function panel(file,kind){
 const html=read(file),match=html.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
 assert.ok(match,"Script ausente "+file);
 let js=match[0].replace(/^<script>/,"").replace(/<\/script>$/,"").trim();
 const tail="\nrender();\n})();";assert.ok(js.endsWith(tail),"Cierre no reconocido");
 const exposed=kind==="portal"?
  "return {site,organizations,render,createAIProposal,applyAIProposal,aiWizardPage,aiProposalByOrg,org:x=>activeOrg=x,role:x=>activeRole=x,tab:x=>tab=x,checkBeforePublish};":
  "return {state,render,prepareAgencyAI,agencyAIPage};";
 js=js.slice(0,-tail.length)+"\n"+exposed+"\n})();";
 const elements={};
 const dom={getElementById(id){return elements[id]||(elements[id]={innerHTML:"",textContent:"",dataset:{},style:{},
 value:"",querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},classList:{remove(){},toggle(){}}})}};
 const app=new Function("document","window","confirm","alert","prompt","return "+js)
 (dom,{MGAIWebAssistant:gen,location:{search:""}},()=>true,()=>{},()=>{});
 return {app,elements,html};
}
async function main(){
 check("generador de reglas, no IA real",gen.mode==="template-simulation");
 check("no solicita endpoints",!source.includes("fetch(")&&!source.includes("XMLHttpRequest"));
 for(const x of [["Start",1],["Crece",3],["Pro",5]]){
  const proposal=gen.createProposal(Object.assign({},input,{plan:x[0]}));
  check("genera plan "+x[0],proposal.ok);
  check("número páginas "+x[0],proposal.proposal.pages.length===x[1]);
  check("SEO listo "+x[0],proposal.proposal.pages.every(z=>!!z.seo.title&&!!z.seo.description));
 }
 check("rechaza HTML",!gen.createProposal(Object.assign({},input,{brand:"<script>alert(1)</script>"})).ok);
 check("rechaza plan ajeno",!gen.createProposal(Object.assign({},input,{plan:"Enterprise"})).ok);
 check("rechaza sector desconocido",!gen.createProposal(Object.assign({},input,{type:"desconocido"})).ok);
 check("rechaza oferta vacía",!gen.createProposal(Object.assign({},input,{offering:"x"})).ok);
 const port=panel("portal-cliente.html","portal");
 const adm=panel("prototipo.html","admin");
 check("pantalla emprendedor disponible",port.app.aiWizardPage().includes("MG AI WEB ASSISTANT"));
 const name=port.app.site().pages[0].draft.title;
 check("generar en emprendedor",port.app.createAIProposal(input).ok);
 check("aún no modifica borrador",port.app.site().pages[0].draft.title===name);
 check("no publica al generar",port.app.site().releases.length===0);
 const applied=port.app.applyAIProposal();
 check("aprueba borrador",applied.ok);
 check("crea dos nuevas páginas en Crece",port.app.site().pages.length===3&&applied.pagesCreated===2);
 check("tiene SEO",port.app.site().pages[0].draft.seo.title.includes("Papelería Nube"));
 check("sin publicaciones al aplicar",port.app.site().releases.length===0);
 check("preflight válido",port.app.checkBeforePublish().ready);
 check("sin duplicar aplicación",!port.app.applyAIProposal().ok);
 port.app.role("CLIENT_VIEWER");
 check("viewer puede previsualizar",port.app.createAIProposal(input).ok);
 check("viewer no puede aplicar",!port.app.applyAIProposal().ok);
 port.app.role("CLIENT_OWNER");
 check("nueva propuesta",port.app.createAIProposal(input).ok);
 port.app.site().pages[0].draftRevision++;
 check("versión desactualizada bloqueada",!port.app.applyAIProposal().ok);
 port.app.org("c2");
 check("propuesta Start en cliente distinto",port.app.createAIProposal(input).ok&&port.app.aiProposalByOrg.c2.proposal.pages.length===1);
 check("memorias de propuesta separadas",!!port.app.aiProposalByOrg.c1&&!!port.app.aiProposalByOrg.c2);
 check("aplicación sin modificar c1",port.app.applyAIProposal().ok&&port.app.organizations.find(x=>x.id==="c1").site.pages.length===3);
 check("solo Inicio plan Start",port.app.site().pages.length===1);
 check("Start preflight listo",port.app.checkBeforePublish().ready);
 for(const name of ["inicio","asistente-ia","paginas","visual","revision","vista"]){
  port.app.tab(name);port.app.render();
  check("render emprendedor "+name,port.elements.content.innerHTML.length>200);
 }
 check("asistente SUPERADMIN",adm.app.agencyAIPage().includes("MG AI WEB ASSISTANT"));
 check("propuesta de agencia",adm.app.prepareAgencyAI(Object.assign({},input,{siteId:"s1"})).ok);
 check("agencia guarda revisión local",!!adm.app.state.aiProposals.s1);
 check("sin publicar desde SUPERADMIN",adm.app.state.sites.find(x=>x.id==="s1").status==="Borrador");
 check("otra propuesta de agencia",adm.app.prepareAgencyAI(Object.assign({},input,{siteId:"s2"})).ok);
 check("segundo cliente con plan Start",adm.app.state.aiProposals.s2.proposal.pages.length===1);
 check("propuestas por sitio",Object.keys(adm.app.state.aiProposals).length===2);
 check("rechaza sitio no asociado",!adm.app.prepareAgencyAI(Object.assign({},input,{siteId:"missing"})).ok);
 adm.app.state.section="asistente-ia";adm.app.render();
 check("render SUPERADMIN",adm.elements.view.innerHTML.includes("Propuesta"));
 console.log("\n"+passed+" pruebas del asistente V9 correctas.");
 return passed;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
