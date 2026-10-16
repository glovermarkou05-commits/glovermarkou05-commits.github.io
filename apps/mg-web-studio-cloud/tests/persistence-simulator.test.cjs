"use strict";
/* node apps/mg-web-studio-cloud/tests/persistence-simulator.test.cjs
   Sin npm, Supabase ni operaciones de red. Datos completamente ficticios. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../shared/mg-persistence-simulator.js"),"utf8");
const context={window:{}};vm.runInNewContext(source,context,{filename:"mg-persistence-simulator.js",timeout:2000});
const moduleApi=context.window.MGWebStudioPersistence;
async function main(){
 let count=0;
 function check(name,condition){assert.equal(Boolean(condition),true,name);count++;process.stdout.write("✓ "+name+"\n");}
 const directory={
  organizations:[{id:"c1",name:"Café Horizonte"},{id:"c2",name:"Papelería Nube"}],
  sites:[{id:"s1",clientId:"c1"},{id:"s2",clientId:"c2"}],
  members:[
   {id:"owner1",clientId:"c1",status:"Activo (demo)",role:"CLIENT_OWNER",scope:"all",siteIds:[]},
   {id:"editor1",clientId:"c1",status:"Activo (demo)",role:"CLIENT_EDITOR",scope:"selected",siteIds:["s1"]},
   {id:"viewer1",clientId:"c1",status:"Activo (demo)",role:"CLIENT_VIEWER",scope:"selected",siteIds:["s1"]},
   {id:"owner2",clientId:"c2",status:"Activo (demo)",role:"CLIENT_OWNER",scope:"all",siteIds:[]},
   {id:"revoked2",clientId:"c2",status:"Revocado",role:"CLIENT_VIEWER",scope:"selected",siteIds:["s2"]}
  ]
 };
 const doc1={pages:[{id:"home",title:"Página Café"}],shared:{brand:"Café Horizonte",products:[{id:"p1",name:"Café",price:2.5}]}};
 const doc2={pages:[{id:"home",title:"Papelería"}],shared:{brand:"Papelería Nube",products:[]}};
 const repo=moduleApi.createRepository({directory:()=>directory,initialDocuments:[
  {clientId:"c1",siteId:"s1",draft:doc1},{clientId:"c2",siteId:"s2",draft:doc2}
 ]});
 const owner={clientId:"c1",siteId:"s1",memberId:"owner1"};
 const editor={clientId:"c1",siteId:"s1",memberId:"editor1"};
 const viewer={clientId:"c1",siteId:"s1",memberId:"viewer1"};
 const other={clientId:"c2",siteId:"s2",memberId:"owner2"};
 check("modo volátil",repo.mode==="volatile-demo");
 check("versión de módulo",moduleApi.version==="1.0.0");
 check("lectura inicial", (await repo.readSite(owner)).version===1);
 check("tenant B inicial distinto", (await repo.readSite(other)).draft.shared.brand==="Papelería Nube");
 check("editor puede leer", (await repo.readSite(editor)).ok);
 check("viewer puede leer", (await repo.readSite(viewer)).ok);
 check("sin sesión ficticia bloqueado", !(await repo.readSite({clientId:"c1",siteId:"s1",memberId:"unknown"})).ok);
 check("sin miembro bloqueado", !(await repo.readSite({clientId:"c1",siteId:"s1"})).ok);
 check("cross tenant bloqueado", !(await repo.readSite({clientId:"c2",siteId:"s1",memberId:"owner2"})).ok);
 check("owner c1 no puede leer c2", !(await repo.readSite({...other,memberId:"owner1"})).ok);
 check("revoque antes lectura", !(await repo.readSite({...other,memberId:"revoked2"})).ok);
 let a=await repo.readSite(owner);a.draft.shared.brand="Mutación externa";
 check("copias defensivas en readSite",(await repo.readSite(owner)).draft.shared.brand==="Café Horizonte");
 check("viewer no puede editar", !(await repo.saveDraft({context:viewer,expectedVersion:1,draft:doc1,operationId:"viewer-test-01"})).ok);
 check("editor no puede publicar", !(await repo.publishSite({context:editor,expectedVersion:1,operationId:"editor-pub-01"})).ok);
 const invalid={pages:[{id:"home",title:"X"}],shared:{}};
 check("borrador inválido rechazado", (await repo.saveDraft({context:editor,expectedVersion:1,draft:invalid,operationId:"invalid-doc-01"})).status===422);
 check("clave operación corta bloqueada", (await repo.saveDraft({context:editor,expectedVersion:1,draft:doc1,operationId:"x"})).status===400);
 const changes=[];const sub=repo.subscribe(owner,event=>changes.push(event));
 check("suscripción autorizada",sub.ok);
 const deniedSub=repo.subscribe({...other,memberId:"owner1"},()=>{});
 check("suscripción cruzada denegada",!deniedSub.ok);
 const draft={pages:[{id:"home",title:"Café actualizado"},{id:"contact",title:"Contáctanos"}],shared:{brand:"Café Horizonte",products:[]}};
 const write=await repo.saveDraft({context:editor,expectedVersion:1,draft,operationId:"write-cafe-01"});
 check("edición inicial válida",write.ok&&write.version===2);
 check("notificación de edición",changes.length===1&&changes[0].kind==="draft"&&changes[0].version===2);
 check("lectura revisada",(await repo.readSite(owner)).draft.pages.length===2);
 const repeat=await repo.saveDraft({context:editor,expectedVersion:1,draft,operationId:"write-cafe-01"});
 check("idempotencia replay",repeat.ok&&repeat.replayed===true&&repeat.version===2);
 check("replay no duplica eventos",changes.length===1);
 const collision=await repo.saveDraft({context:editor,expectedVersion:1,draft:doc1,operationId:"write-cafe-01"});
 check("misma clave distinto contenido: conflicto",collision.status===409&&!collision.ok);
 const stale=await repo.saveDraft({context:editor,expectedVersion:1,draft:doc1,operationId:"write-cafe-02"});
 check("conflicto versión anterior",stale.status===409&&stale.currentVersion===2);
 check("conflicto no sobreescribe", (await repo.readSite(owner)).draft.pages.length===2);
 const published=await repo.publishSite({context:owner,expectedVersion:2,operationId:"publish-cafe-01"});
 check("publicar rol owner",published.ok&&published.version===3&&published.releaseNumber===1);
 check("evento de publicación",changes.length===2&&changes[1].kind==="publish");
 const pubReplay=await repo.publishSite({context:owner,expectedVersion:2,operationId:"publish-cafe-01"});
 check("publicación idempotente",pubReplay.replayed===true&&pubReplay.releaseNumber===1);
 check("un release no duplicado",(await repo.readReleases(owner)).items.length===1);
 const afterPublish=await repo.readSite(owner);
 check("puntero de publicación",afterPublish.releaseNumber===1&&afterPublish.version===3);
 const newDraft={pages:[{id:"home",title:"Café v2"}],shared:{brand:"Café Nuevo",products:[]}};
 check("segundo guardado",(await repo.saveDraft({context:editor,expectedVersion:3,draft:newDraft,operationId:"write-cafe-03"})).version===4);
 check("release anterior inmutable",(await repo.readReleases(owner)).items[0].draft.shared.brand==="Café Horizonte");
 const badPub=await repo.publishSite({context:owner,expectedVersion:3,operationId:"publish-cafe-02"});
 check("publicación obsoleta bloqueada",badPub.status===409);
 check("segundo release",(await repo.publishSite({context:owner,expectedVersion:4,operationId:"publish-cafe-03"})).releaseNumber===2);
 check("copia vieja conservada",(await repo.readReleases(owner)).items[0].draft.pages.length===2);
 check("copia nueva correcta",(await repo.readReleases(owner)).items[1].draft.shared.brand==="Café Nuevo");
 let releaseCopy=(await repo.readReleases(owner)).items;releaseCopy[0].draft.pages[0].title="No real";
 check("releases con copia defensiva",(await repo.readReleases(owner)).items[0].draft.pages[0].title==="Café actualizado");
 check("cambios por cursor",(await repo.readChanges(owner,3)).items.length===2);
 check("cursor inválido",(await repo.readChanges(owner,-1)).status===400);
 check("viewer cambios puede leer",(await repo.readChanges(viewer,0)).ok);
 check("tenant B no recibe cambios c1",(await repo.readChanges(other,0)).items.length===0);
 check("tenant B todavía versión 1",(await repo.readSite(other)).version===1);
 let staleNotices=0;const subEditor=repo.subscribe(editor,()=>staleNotices++);
 check("editor suscrito",subEditor.ok);
 directory.members.find(m=>m.id==="editor1").status="Revocado";
 check("revocación sin edición", !(await repo.saveDraft({context:editor,expectedVersion:5,draft:newDraft,operationId:"write-revoked-01"})).ok);
 check("revocación sin lectura", !(await repo.readSite(editor)).ok);
 check("owner publica tras revocar editor",(await repo.publishSite({context:owner,expectedVersion:5,operationId:"publish-cafe-04"})).ok);
 check("listener revocado no recibe",staleNotices===0);
 const eventsAfter=changes.length;
 sub.unsubscribe();subEditor.unsubscribe();
 check("desuscribir sin error",true);
 check("estado versionado después de publicación",(await repo.readSite(owner)).version===6);
 check("no acceso de viewer a listado ajeno", !(await repo.readReleases({...other,memberId:"viewer1"})).ok);
 check("rechaza home faltante", (await repo.saveDraft({context:owner,expectedVersion:6,draft:{pages:[{id:"contact",title:"Sólo contacto"}],shared:{}},operationId:"bad-home-01"})).status===422);
 check("rechaza dos slugs iguales", (await repo.saveDraft({context:owner,expectedVersion:6,draft:{pages:[{id:"home",title:"Página"},{id:"home",title:"Otra página"}],shared:{}},operationId:"duplicate-01"})).status===422);
 check("no dispara publicación real",typeof repo.publishSite==="function"&&typeof repo.readSite==="function");
 process.stdout.write("\n"+count+" pruebas exitosas del simulador volátil.\n");
 return count;
}
if(require.main===module)main().catch(err=>{console.error(err);process.exitCode=1;});
module.exports={main};
