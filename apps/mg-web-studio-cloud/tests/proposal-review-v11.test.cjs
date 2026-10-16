"use strict";
/* node apps/mg-web-studio-cloud/tests/proposal-review-v11.test.cjs
   No red, no cuentas ni IA reales. Pruebas de un intercambio MANUAL ficticio.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const base=path.join(__dirname,".."),read=p=>fs.readFileSync(path.join(base,p),"utf8");
const win={};for(const p of ["shared/mg-ai-web-assistant-demo.js",
 "shared/mg-proposal-exchange-demo.js","shared/mg-proposal-review-demo.js"]){
 new Function("window",read(p))(win);
}
const generator=win.MGAIWebAssistant,exchange=win.MGWebProposalExchange,review=win.MGWebProposalReview;
const info={brand:"Café Horizonte",type:"restaurante",style:"natural",goal:"contacto",
 offering:"café de especialidad, postres y meriendas",audience:"familias y estudiantes"};
let count=0;function check(label,result){assert.ok(result,label);count++;console.log("✓",label);}
function panel(p,kind){
 const html=read(p);const match=html.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
 assert.ok(match,"No aparece el script principal en "+p);
 let js=match[0].replace(/^<script>/,"").replace(/<\/script>$/,"").trim(),tail="\nrender();\n})();";
 assert.ok(js.endsWith(tail),"Cierre de módulo inesperado");
 const expose=kind==="agency"?
 "return {state,prepareAgencyAI,exportAgencyAIPackage,registerAgencyReview,agencyAIPage,render};":
 "return {site,organizations,receiveAIProposalPackage,decideClientProposal,applyAIProposal,aiProposalByOrg,aiWizardPage,org:x=>activeOrg=x,role:x=>activeRole=x,tab:x=>tab=x,render};";
 js=js.slice(0,-tail.length)+"\n"+expose+"\n})();";
 const elements={};
 const dom={getElementById(id){return elements[id]||(elements[id]={innerHTML:"",textContent:"",dataset:{},style:{},value:"",
 querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},classList:{remove(){},toggle(){}}})}};
 const app=new Function("document","window","confirm","prompt","alert","return "+js)(dom,
 {...win,location:{search:""}},()=>true,()=>null,()=>{});
 return {app,elements,html};
}
async function main(){
 check("módulo V11 disponible",review.version==="11.0-demo");
 const generated=generator.createProposal({...info,plan:"Crece"});
 check("plantilla válida",generated.ok);
 const m=review.proposalMetadata(generated.proposal,1);
 check("metadatos con número de revisión",m.ok&&m.review.revision===1);
 check("checksum no es firma",m.review.mode==="local-checksum-not-signature");
 check("revisión cero no válida",!review.proposalMetadata(generated.proposal,0).ok);
 const target={clientId:"c1",siteId:"s1",plan:"Crece"};
 const normalized=exchange.createPackage({...target,proposal:generated.proposal});
 check("base V10 para revisión",normalized.ok);
 const metadata=review.proposalMetadata(normalized.packet.proposal,1);
 const packet=JSON.stringify({...normalized.packet,review:metadata.review});
 check("lectura metadatos V11",review.readProposalMetadata(packet,normalized.packet.proposal).ok);
 check("legado V10 exige revisión",review.readProposalMetadata(normalized.json,normalized.packet.proposal).review.legacy);
 const altered=JSON.parse(packet);altered.review.fingerprint="deadbeef";
 check("checksum incorrecto detectado",!review.readProposalMetadata(JSON.stringify(altered),normalized.packet.proposal).ok);
 const response=review.packReview({target,revision:1,proposal:normalized.packet.proposal,decision:"approved",note:""});
 check("dictamen aprobatorio",response.ok);
 check("dictamen identificable",response.packet.format==="mg-web-studio-review/v11-demo-1");
 check("parsear decisión",review.readReview(response.json,{target,revision:1,proposal:normalized.packet.proposal}).ok);
 check("revisión equivocada rechazada",!review.readReview(response.json,{target,revision:2,proposal:normalized.packet.proposal}).ok);
 check("sitio distinto rechazado",!review.readReview(response.json,{target:{...target,siteId:"s2"},revision:1,proposal:normalized.packet.proposal}).ok);
 check("plan distinto rechazado",!review.readReview(response.json,{target:{...target,plan:"Pro"},revision:1,proposal:normalized.packet.proposal}).ok);
 check("nota requerida para cambios",!review.packReview({target,revision:1,proposal:normalized.packet.proposal,decision:"changes",note:"corto"}).ok);
 check("nota requerida para rechazo",!review.packReview({target,revision:1,proposal:normalized.packet.proposal,decision:"rejected",note:""}).ok);
 check("HTML en nota bloqueado",!review.packReview({target,revision:1,proposal:normalized.packet.proposal,decision:"changes",note:"<script>inventado</script>"}).ok);
 check("decisión inexistente bloqueada",!review.packReview({target,revision:1,proposal:normalized.packet.proposal,decision:"published",note:""}).ok);
 check("datos demasiado extensos",!review.readReview("X".repeat(5100),{target,revision:1,proposal:normalized.packet.proposal}).ok);
 const agency=panel("prototipo.html","agency"),client=panel("portal-cliente.html","client");
 check("agencia prepara v1",agency.app.prepareAgencyAI({...info,siteId:"s1"}).ok);
 check("agencia inicia rev1",agency.app.state.aiProposals.s1.revision===1);
 const first=agency.app.exportAgencyAIPackage("s1");
 check("agencia envía manualmente",first.ok);
 check("marcó enviada demo",agency.app.state.aiProposals.s1.status==="Enviada a revisión");
 check("paquete adjunta revisión v1",first.packet.review.revision===1);
 check("cliente recibe v1",client.app.receiveAIProposalPackage(first.json).ok);
 check("importación no aplica",client.app.site().pages.length===1);
 check("no permite aplicar pendiente",!client.app.applyAIProposal().ok);
 client.app.role("CLIENT_VIEWER");
 check("visor no aprueba",!client.app.decideClientProposal("approved","").ok);
 client.app.role("CLIENT_EDITOR");
 check("editor no aprueba",!client.app.decideClientProposal("approved","").ok);
 check("editor pide cambios",client.app.decideClientProposal("changes","Actualizar los textos y títulos de ejemplo").ok);
 check("editor no puede cambiar decisión",!client.app.decideClientProposal("approved","").ok);
 check("solicitud de cambios impide aplicar",!client.app.applyAIProposal().ok);
 check("agencia importa cambios",agency.app.registerAgencyReview("s1",client.app.aiProposalByOrg.c1.review.responseJson).ok);
 check("agencia marca cambios",agency.app.state.aiProposals.s1.status==="Cambios solicitados (demo)");
 check("misma respuesta no se duplica",!agency.app.registerAgencyReview("s1",client.app.aiProposalByOrg.c1.review.responseJson).ok);
 check("no reenvía respuesta cerrada",!agency.app.exportAgencyAIPackage("s1").ok);
 check("agencia crea revisión v2",agency.app.prepareAgencyAI({...info,brand:"Café Horizonte 2",siteId:"s1"}).ok);
 check("revision anterior no se reutiliza",agency.app.state.aiProposals.s1.revision===2);
 const second=agency.app.exportAgencyAIPackage("s1");
 check("cliente recibe revisión 2",client.app.receiveAIProposalPackage(second.json).ok);
 client.app.role("CLIENT_OWNER");
 check("cliente rechaza con motivo",client.app.decideClientProposal("rejected","No cumple con las necesidades de esta demostración.").ok);
 check("rechazo impide aplicar",!client.app.applyAIProposal().ok);
 check("agencia registra rechazo",agency.app.registerAgencyReview("s1",client.app.aiProposalByOrg.c1.review.responseJson).ok);
 check("agencia conserva historial",agency.app.state.aiProposals.s1.history.length===2);
 check("rechazada, no publicada",agency.app.state.sites.find(s=>s.id==="s1").status==="Borrador");
 check("agencia prepara revisión v3",agency.app.prepareAgencyAI({...info,brand:"Café Horizonte 3",siteId:"s1"}).ok);
 const third=agency.app.exportAgencyAIPackage("s1");
 check("rev3 exportada",third.packet.review.revision===3);
 check("revisión obsoleta se rechaza",!agency.app.registerAgencyReview("s1",review.packReview({
  target,revision:1,proposal:normalized.packet.proposal,decision:"approved",note:""}).json).ok);
 check("cliente recibe revisión v3",client.app.receiveAIProposalPackage(third.json).ok);
 check("cliente aprueba v3",client.app.decideClientProposal("approved","").ok);
 const approval=client.app.aiProposalByOrg.c1.review.responseJson;
 check("agencia registra aprobación",agency.app.registerAgencyReview("s1",approval).ok);
 check("agencia muestra aprobada",agency.app.state.aiProposals.s1.status==="Aprobada (demo)");
 check("sin publicación ni cambios físicos",agency.app.state.sites[0].status==="Borrador");
 check("cliente aplica tras aprobar",client.app.applyAIProposal().ok);
 check("creó páginas secundarias",client.app.site().pages.length===3);
 check("sin publicaciones reales",client.app.site().releases.length===0);
 check("reenvío posterior de aprobada impedido",!agency.app.exportAgencyAIPackage("s1").ok);
 client.app.org("c2");
 check("empresa B rechaza paquete A",!client.app.receiveAIProposalPackage(third.json).ok);
 check("empresa B no alterada",client.app.site().pages.length===1);
 check("SUPERADMIN muestra estado de revisión",agency.app.agencyAIPage().includes("Aprobada (demo)"));
 check("portal muestra formulario para transferencias",client.app.aiWizardPage().includes("aiImportForm"));
 agency.app.state.section="asistente-ia";agency.app.render();
 check("agencia renderiza V11",agency.elements.view.innerHTML.includes("Propuesta"));
 client.app.tab("asistente-ia");client.app.render();
 check("cliente renderiza V11",client.elements.content.innerHTML.includes("MG AI WEB ASSISTANT"));
 check("sin endpoints",!read("shared/mg-proposal-review-demo.js").includes("fetch("));
 console.log("\n"+count+" pruebas V11 correctas.");
 return count;
}
if(require.main===module)main().catch(err=>{console.error(err);process.exitCode=1;});
module.exports={main};
