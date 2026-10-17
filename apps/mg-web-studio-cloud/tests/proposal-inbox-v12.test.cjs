"use strict";
/* node apps/mg-web-studio-cloud/tests/proposal-inbox-v12.test.cjs
 * Suite sin dependencias, sin red, sin emails ni bases reales.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
const win={};
for(const f of ["shared/mg-ai-web-assistant-demo.js","shared/mg-proposal-exchange-demo.js","shared/mg-proposal-inbox-demo.js"])
 new Function("window",read(f))(win);
const dir={
 organizations:[{id:"c1",name:"Café Horizonte",plan:"Crece"},{id:"c2",name:"Papelería Nube",plan:"Start"}],
 sites:[{id:"s1",clientId:"c1"},{id:"s3",clientId:"c1"},{id:"s2",clientId:"c2"}],
 members:[
 {id:"m1",userId:"owner1",clientId:"c1",role:"CLIENT_OWNER",status:"Activo (demo)",scope:"all",siteIds:[]},
 {id:"m2",userId:"editor1",clientId:"c1",role:"CLIENT_EDITOR",status:"Activo (demo)",scope:"selected",siteIds:["s1"]},
 {id:"m3",userId:"viewer1",clientId:"c1",role:"CLIENT_VIEWER",status:"Activo (demo)",scope:"selected",siteIds:["s1"]},
 {id:"m4",userId:"owner2",clientId:"c2",role:"CLIENT_OWNER",status:"Activo (demo)",scope:"all",siteIds:[]},
 {id:"m5",userId:"editor3",clientId:"c1",role:"CLIENT_EDITOR",status:"Activo (demo)",scope:"selected",siteIds:["s3"]},
 {id:"m6",userId:"retired1",clientId:"c1",role:"CLIENT_EDITOR",status:"Revocado",scope:"selected",siteIds:["s1"]}
 ],
 staff:[{userId:"super1",role:"SUPERADMIN",active:true},{userId:"other",role:"AUDITOR",active:true}]
};
const who={
 agency:{kind:"staff",userId:"super1",aal:"aal2"},
 agencyWeak:{kind:"staff",userId:"super1",aal:"aal1"},
 auditor:{kind:"staff",userId:"other",aal:"aal2"},
 owner1:{kind:"client",userId:"owner1"},editor1:{kind:"client",userId:"editor1"},
 viewer1:{kind:"client",userId:"viewer1"},owner2:{kind:"client",userId:"owner2"},
 editor3:{kind:"client",userId:"editor3"},revoked:{kind:"client",userId:"retired1"},
 unknown:{kind:"client",userId:"unknown"}
};
const generator=win.MGAIWebAssistant,exchange=win.MGWebProposalExchange;
const inbox=win.MGWebProposalInbox.createDemoInbox({directory:()=>dir,exchange});
const sample=(plan,brand="Café Horizonte")=>generator.createProposal({plan,brand,type:"restaurante",style:"natural",goal:"contacto",offering:"cafetería y meriendas de especialidad",audience:"familias y estudiantes"}).proposal;
let count=0;const check=(label,ok)=>{assert.ok(ok,label);count++;console.log("✓",label)};
async function main(){
 check("módulo V12 en memoria",inbox.mode==="one-page-volatile");
 check("draft café",inbox.initDraft("c1","s1").ok);
 check("draft sitio alterno",inbox.initDraft("c1","s3").ok);
 check("draft papelería",inbox.initDraft("c2","s2").ok);
 check("draft duplicado denegado",!inbox.initDraft("c1","s1").ok);
 check("sin tenant desconocido",!inbox.initDraft("c5","s5").ok);
 check("propietario lee draft",inbox.getDraft(who.owner1,"c1","s1").ok);
 check("editor no lee otro sitio del mismo tenant",!inbox.getDraft(who.editor1,"c1","s3").ok);
 check("editor sitio s3 no lee s1",!inbox.getDraft(who.editor3,"c1","s1").ok);
 check("propietario distinto tenant denegado",!inbox.getDraft(who.owner2,"c1","s1").ok);
 check("revocado no lee",!inbox.getDraft(who.revoked,"c1","s1").ok);
 check("super sin MFA bloqueado",!inbox.createProposal(who.agencyWeak,{clientId:"c1",siteId:"s1",proposal:sample("Crece")}).ok);
 check("auditor no crea",!inbox.createProposal(who.auditor,{clientId:"c1",siteId:"s1",proposal:sample("Crece")}).ok);
 check("cliente no crea como agencia",!inbox.createProposal(who.owner1,{clientId:"c1",siteId:"s1",proposal:sample("Crece")}).ok);
 check("plan equivocado rechazado",!inbox.createProposal(who.agency,{clientId:"c1",siteId:"s1",proposal:sample("Start")}).ok);
 const created=inbox.createProposal(who.agency,{clientId:"c1",siteId:"s1",proposal:sample("Crece")});
 check("agencia crea propuesta",created.ok);
 const pid=created.data.id;
 check("versión 1",created.data.revision===1&&created.data.status==="Borrador");
 check("otra propuesta abierta bloqueada",!inbox.createProposal(who.agency,{clientId:"c1",siteId:"s1",proposal:sample("Crece")}).ok);
 check("cliente c1 ve propuesta",inbox.listProposals(who.owner1).data.length===1);
 check("editor ve su propuesta",inbox.listProposals(who.editor1).data.length===1);
 check("visor ve su propuesta",inbox.listProposals(who.viewer1).data.length===1);
 check("editor otro sitio no ve propuesta",inbox.listProposals(who.editor3).data.length===0);
 check("cliente B no ve propuesta",inbox.listProposals(who.owner2).data.length===0);
 check("revocado no ve propuesta",inbox.listProposals(who.revoked).data.length===0);
 check("SUPERADMIN sin MFA no lista",!inbox.listProposals(who.agencyWeak).ok);
 check("agencia lista propuesta",inbox.listProposals(who.agency).data.length===1);
 check("agencia envía propuesta",inbox.submit(who.agency,pid,1).ok);
 check("estado enviado",inbox.getProposal(who.owner1,pid).data.status==="En revisión");
 check("reenvío bloqueado",!inbox.submit(who.agency,pid,1).ok);
 check("cuenta propietario 1",inbox.listNotifications(who.owner1).data.unread===1);
 check("cuenta editor 1",inbox.listNotifications(who.editor1).data.unread===1);
 check("cuenta visor 1",inbox.listNotifications(who.viewer1).data.unread===1);
 check("editor en otro sitio sin avisos",inbox.listNotifications(who.editor3).data.unread===0);
 check("propietario B sin avisos",inbox.listNotifications(who.owner2).data.unread===0);
 check("notificación admin sin MFA denegada",!inbox.listNotifications(who.agencyWeak).ok);
 const note=inbox.listNotifications(who.owner1).data.items[0];
 check("otra persona no marca lectura",!inbox.markRead(who.editor1,note.id).ok);
 check("marca lectura propietario",inbox.markRead(who.owner1,note.id).ok);
 check("disminuye contador del propietario",inbox.listNotifications(who.owner1).data.unread===0);
 check("permanece contador editor",inbox.listNotifications(who.editor1).data.unread===1);
 check("viewer no puede aprobar",!inbox.review(who.viewer1,pid,{decision:"approved",expectedRevision:1,note:""}).ok);
 check("editor no puede aprobar",!inbox.review(who.editor1,pid,{decision:"approved",expectedRevision:1,note:""}).ok);
 check("editor puede pedir cambios con nota",inbox.review(who.editor1,pid,{decision:"changes",expectedRevision:1,note:"Modificar los textos de la portada."}).ok);
 check("agencia recibe aviso de cambios",inbox.listNotifications(who.agency).data.unread===1);
 check("cambios bloquean aplicación",!inbox.applyToDraft(who.owner1,pid,{expectedRevision:1,expectedDraftVersion:1}).ok);
 check("sin decisiones repetidas",!inbox.review(who.owner1,pid,{decision:"approved",expectedRevision:1,note:""}).ok);
 check("cliente no puede revisar como agencia",!inbox.revise(who.owner1,pid,{expectedRevision:1,proposal:sample("Crece")}).ok);
 check("revisión anterior errónea bloqueada",!inbox.revise(who.agency,pid,{expectedRevision:2,proposal:sample("Crece")}).ok);
 check("agencia crea v2",inbox.revise(who.agency,pid,{expectedRevision:1,proposal:sample("Crece","Café Horizonte Renovado")}).ok);
 check("v2 número",inbox.getProposal(who.agency,pid).data.revision===2);
 check("no acepta respuesta v1",!inbox.review(who.owner1,pid,{decision:"approved",expectedRevision:1,note:""}).ok);
 check("envía revisión v2",inbox.submit(who.agency,pid,2).ok);
 check("rechazo sin comentario bloqueado",!inbox.review(who.owner1,pid,{decision:"rejected",expectedRevision:2,note:"No"}).ok);
 check("nota HTML bloqueada",!inbox.review(who.owner1,pid,{decision:"changes",expectedRevision:2,note:"<b>texto inválido</b>"}).ok);
 check("propietario rechaza v2",inbox.review(who.owner1,pid,{decision:"rejected",expectedRevision:2,note:"La propuesta no cumple requisitos ficticios."}).ok);
 check("agencia crea v3",inbox.revise(who.agency,pid,{expectedRevision:2,proposal:sample("Crece","Café Horizonte Final")}).ok);
 check("envía v3",inbox.submit(who.agency,pid,3).ok);
 check("aprueba rol OWNER",inbox.review(who.owner1,pid,{decision:"approved",expectedRevision:3,note:""}).ok);
 check("status aprobado",inbox.getProposal(who.agency,pid).data.status==="Aprobada");
 check("aprobar no publica",inbox.getDraft(who.owner1,"c1","s1").data.publishedReleaseCount===0);
 check("VIEWER no aplica",!inbox.applyToDraft(who.viewer1,pid,{expectedRevision:3,expectedDraftVersion:1}).ok);
 check("cliente B no aplica",!inbox.applyToDraft(who.owner2,pid,{expectedRevision:3,expectedDraftVersion:1}).ok);
 check("versión antigua no aplica",!inbox.applyToDraft(who.owner1,pid,{expectedRevision:2,expectedDraftVersion:1}).ok);
 check("borrador versión errónea bloqueado",!inbox.applyToDraft(who.owner1,pid,{expectedRevision:3,expectedDraftVersion:2}).ok);
 check("editor autorizado aplica",inbox.applyToDraft(who.editor1,pid,{expectedRevision:3,expectedDraftVersion:1}).ok);
 check("páginas creadas",inbox.getDraft(who.owner1,"c1","s1").data.pages.length===3);
 check("versión del borrador incrementó",inbox.getDraft(who.owner1,"c1","s1").data.version===2);
 check("no publicaciones reales",inbox.getDraft(who.owner1,"c1","s1").data.publishedReleaseCount===0);
 check("aplicación repetida bloqueada",!inbox.applyToDraft(who.editor1,pid,{expectedRevision:3,expectedDraftVersion:1}).ok);
 check("historial conserva decisiones",inbox.getProposal(who.agency,pid).data.history.some(x=>x.event==="changes")&&inbox.getProposal(who.agency,pid).data.history.some(x=>x.event==="rejected"));
 check("historial de 3 revisiones",inbox.getProposal(who.agency,pid).data.history.some(x=>x.revision===3));
 check("sin avisos cross tenant para B",inbox.listNotifications(who.owner2).data.unread===0);
 const owner2Create=inbox.createProposal(who.agency,{clientId:"c2",siteId:"s2",proposal:sample("Start","Papelería Nube")});
 check("agencia crea propuesta para B",owner2Create.ok);
 check("agencia envía al cliente B",inbox.submit(who.agency,owner2Create.data.id,1).ok);
 check("cliente B recibe su aviso",inbox.listNotifications(who.owner2).data.unread===1);
 check("cliente A no ve propuesta B",inbox.listProposals(who.owner1).data.every(p=>p.clientId==="c1"));
 check("cliente B solo ve propuesta B",inbox.listProposals(who.owner2).data.every(p=>p.clientId==="c2"));
 check("plan Start sin limitar el de Crece",inbox.getDraft(who.owner2,"c2","s2").data.pages.length===1);
 const snapshot=inbox.getProposal(who.agency,pid).data;snapshot.status="Manipulado";
 check("respuestas retornadas son copias",inbox.getProposal(who.agency,pid).data.status==="Aplicada al borrador");
 dir.members.find(m=>m.userId==="owner2").status="Revocado";
 check("revocación bloquea avisos",!inbox.listNotifications(who.owner2).data.items.length);
 check("revocación impide responder",!inbox.review(who.owner2,owner2Create.data.id,{decision:"approved",expectedRevision:1,note:""}).ok);
 check("ningún endpoint",!read("shared/mg-proposal-inbox-demo.js").includes("fetch("));
 console.log("\n"+count+" comprobaciones correctas de bandeja central V12.");
 return count;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
