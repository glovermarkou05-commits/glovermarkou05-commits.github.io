"use strict";
/* node apps/mg-web-studio-cloud/tests/proposal-inbox-v12-ui.test.cjs
 * Smoke DOM simulado, no equivale a navegador real.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const scripts=["shared/mg-proposal-exchange-demo.js","shared/mg-ai-web-assistant-demo.js",
 "shared/mg-proposal-inbox-demo.js"];
const world={};for(const file of scripts)new Function("window",read(file))(world);
let passed=0;
function check(label,value){assert.ok(value,label);passed++;console.log("✓",label);}
function stub(){return {innerHTML:"",textContent:"",value:"",dataset:{},style:{},disabled:false,
 querySelectorAll:()=>[],addEventListener(){},elements:{brand:{value:""},offering:{value:""}}};}
async function main(){
 const page=read("bandeja-propuestas-demo.html");
 const main=page.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
 check("inline script V12",!!main);
 let code=main[0].replace(/^<script>/,"").replace(/<\/script>$/,"").trim();
 const end="\nrender();\n})();";
 check("script final estable",code.endsWith(end));
 code=code.slice(0,-end.length)+"\nrender();return {inbox,dir,actors,render,actor};\n})();";
 const els={};const document={getElementById(id){return els[id]||(els[id]=stub())},
  querySelectorAll:()=>[],createElement:()=>stub()};
 els.actor=stub();els.actor.value="super";
 els.statusFilter=stub();els.statusFilter.value="";
 els.siteId=stub();els.siteId.value="s1";
 els.agencyForm=stub();
 const app=new Function("document","window","confirm","FormData","return "+code)(document,world,
  ()=>true,()=>({entries:()=>[]}));
 check("módulo disponible",app.inbox.version==="12.0-demo");
 check("arranque sin propuestas",els.proposalCount.textContent===0);
 check("panel de agencia visible",els.agencyCreateArea.style.display==="");
 check("hay dos negocios de ejemplo",app.dir.organizations.length===2);
 const source=world.MGAIWebAssistant.createProposal({brand:"Café Horizonte",type:"restaurante",
  style:"natural",goal:"contacto",offering:"cafetería, postres y meriendas",
  audience:"familias y estudiantes",plan:"Crece"});
 check("generador local válido",source.ok);
 const created=app.inbox.createProposal(app.actors.super,{clientId:"c1",siteId:"s1",proposal:source.proposal});
 check("crear en la bandeja",created.ok);
 app.render();
 check("contador propuestas 1",els.proposalCount.textContent===1);
 check("lista contiene cliente",els.proposalList.innerHTML.includes("Café Horizonte"));
 check("enviar a revisión",app.inbox.submit(app.actors.super,created.data.id,1).ok);
 els.actor.value="owner1";els.actor.onchange();
 check("propietario ve propuesta",els.proposalCount.textContent===1);
 check("propietario recibe aviso",els.unreadCount.textContent===1);
 check("cliente no ve formulario de agencia",els.agencyCreateArea.style.display==="none");
 els.actor.value="owner2";els.actor.onchange();
 check("otro negocio no ve propuesta",els.proposalCount.textContent===0);
 check("otro negocio no ve avisos",els.unreadCount.textContent===0);
 els.actor.value="owner1";els.actor.onchange();
 check("mensaje de notificación visible",els.notificationList.innerHTML.includes("Marcar leída"));
 const notice=app.inbox.listNotifications(app.actors.owner1).data.items[0];
 check("marcar leída",app.inbox.markRead(app.actors.owner1,notice.id).ok);
 app.render();check("contador se actualiza",els.unreadCount.textContent===0);
 check("aprobar propuesta",app.inbox.review(app.actors.owner1,created.data.id,
  {decision:"approved",note:"",expectedRevision:1}).ok);
 app.render();check("estado aprobado visible",els.proposalList.innerHTML.includes("Aprobada"));
 check("aún sin publicación",app.inbox.getDraft(app.actors.owner1,"c1","s1").data.publishedReleaseCount===0);
 check("notificaciones de agencia",app.inbox.listNotifications(app.actors.super).data.unread===1);
 check("sin solicitudes de red",!read("shared/mg-proposal-inbox-demo.js").includes("fetch("));
 const admin=read("prototipo.html"),client=read("portal-cliente.html");
 check("SUPERADMIN enlaza laboratorio",admin.includes('href="./bandeja-propuestas-demo.html"'));
 check("cliente enlaza laboratorio",client.includes('href="./bandeja-propuestas-demo.html"'));
 for(const [name,html] of [["SUPERADMIN",admin],["emprendedor",client]]){
  const script=html.match(/<script>\n\(function\(\)\{[\s\S]*?<\/script>/);
  check("script "+name+" presente",!!script);
  new Function(script[0].replace(/^<script>/,"").replace(/<\/script>$/,""));
  check("script "+name+" sintaxis OK",true);
 }
 console.log("\n"+passed+" verificaciones de interfaz V12 correctas en DOM simulado.");
 return passed;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
