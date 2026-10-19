"use strict";
/* node apps/mg-web-studio-cloud/tests/contracts-v20.test.cjs
 * Evaluación de contratos de demostración; sin servidor ni SQL.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const window={};new Function("window",read("shared/mg-contracts-v20.js"))(window);
const m=window.MGWebContractsV20;
let n=0;
function test(label,yes){assert.ok(yes,label);n++;console.log("✓ "+label);}
const actor=(role,kind="client",aal="aal1",active=true)=>({role,kind,aal,active});
const staff=actor("SUPERADMIN","staff","aal2");
const owner=actor("CLIENT_OWNER"),admin=actor("CLIENT_ADMIN"),editor=actor("CLIENT_EDITOR"),viewer=actor("CLIENT_VIEWER");
const all={level:"all",organizationId:"c1",siteIds:[]};
const selected={level:"selected",organizationId:"c1",siteIds:["s1"]};
const input=(action,status,person,extra={})=>({
 action,status,actor:person,currentRevision:status===null?0:1,
 expectedRevision:status===null?0:1,organizationId:"c1",siteId:"s1",
 scope:person.role==="CLIENT_EDITOR"||person.role==="CLIENT_VIEWER"?selected:all,
 note:"Por favor cambiar el contenido.",currentDraftVersion:1,expectedDraftVersion:1,...extra
});
function main(){
 test("versión V20",m.version==="20.0-review");
 test("sin despliegue",m.mode==="review-only");
 test("slug principal fijo",m.HOME_SLUG==="home");
 test("seis estados",m.STATUSES.length===6);
 test("siete acciones",m.ACTIONS.length===7);
 const slugs=[
 ["",true,"home","/"],["home",true,"home","/"],["contacto",true,"contacto","/contacto"],
 ["servicios-2",true,"servicios-2","/servicios-2"],["pag3",true,"pag3","/pag3"],
 ["Hola",false],["sobre nosotros",false],["a/b",false],["foo--bar",false],
 ["-foo",false],["foo-",false],["home/",false],["robots.txt",false],
 ["área",false],[null,false],["a".repeat(76),false],["a_foo",false]
 ];
 for(const [value,valid,slug,p] of slugs){
  const result=m.normalizedSlug(value);
  test("slug "+String(value).slice(0,24),result.ok===valid&&(!valid||(result.slug===slug&&result.path===p)));
 }
 const paths=[
 ["/",true,"home"],["/contacto",true,"contacto"],["/servicios-2",true,"servicios-2"],
 ["/home",false,"RESERVED_HOME"],["/home/",false],["/contacto/",false],
 ["/nested/path",false],["//",false],["/foo?admin=1",false],["/foo#part",false],
 ["/%2F",false],["/FOO",false],["/a\\b",false],["foo",false],[null,false],
 ["/a--b",false]
 ];
 for(const [value,valid,slugOrCode] of paths){
  const r=m.pathToPage(value);
  test("path "+String(value),r.ok===valid&&(!valid||r.slug===slugOrCode));
 }
 const pages=[{slug:"",title:"Inicio",data:{items:[1]}},{slug:"contacto",title:"Contacto"}];
 const transformed=m.canonicalPages(pages);
 test("normalización de Inicio",transformed.ok&&transformed.pages[0].slug==="home");
 test("preserva contacto",transformed.pages[1].slug==="contacto");
 transformed.pages[0].data.items[0]=7;
 test("no muta originales",pages[0].slug===""&&pages[0].data.items[0]===1);
 const badPages=[
 [[], "INVALID_PAGES"],
 [[{slug:"contacto"}],"MISSING_HOME"],
 [[{slug:""},{slug:"home"}],"DUPLICATE_SLUG"],
 [[{slug:"home"},{slug:"x"},{slug:"x"}],"DUPLICATE_SLUG"],
 [[{title:"sin slug"}],"INVALID_PAGE"],
 [[null],"INVALID_PAGE"],
 [[{slug:"HOME"}],"INVALID_SLUG"],
 [new Array(26).fill({slug:"home"}),"INVALID_PAGES"]
 ];
 for(const [value,code] of badPages)test("páginas inválidas "+code,m.canonicalPages(value).code===code);
 for(const status of m.STATUSES){
  test("estado "+status,m.normalizedState(status).ok&&m.normalizedState(status).status===status);
 }
 test("legacy submitted",m.normalizedState("submitted_for_review").status==="submitted");
 test("legacy applied",m.normalizedState("applied_to_draft").status==="applied");
 test("alias identificado",m.normalizedState("submitted_for_review").wasLegacy===true);
 for(const x of ["unknown","deleted","awaiting",null,23])
  test("estado no válido "+String(x),!m.normalizedState(x).ok);
 const allowed=[
 ["create",null,staff,"draft",1],
 ["submit","draft",staff,"submitted",1],
 ["approve","submitted",owner,"approved",1],
 ["approve","submitted",admin,"approved",1],
 ["changes","submitted",owner,"needs_changes",1],
 ["changes","submitted",editor,"needs_changes",1],
 ["reject","submitted",owner,"rejected",1],
 ["reject","submitted",admin,"rejected",1],
 ["revise","needs_changes",staff,"draft",2],
 ["revise","rejected",staff,"draft",2],
 ["apply","approved",owner,"applied",1],
 ["apply","approved",editor,"applied",1],
 ["apply","approved",admin,"applied",1],
 ["approve","submitted_for_review",owner,"approved",1]
 ];
 for(const [action,status,person,to,revision] of allowed){
  const r=m.contractDecision(input(action,status,person));
  test("transición válida "+action+"/"+status+"/"+person.role,r.ok&&r.state===to&&r.revision===revision);
 }
 test("apply incrementa borrador",m.contractDecision(input("apply","approved",editor)).draftVersion===2);
 test("aprobación nunca implica auth real",m.contractDecision(input("approve","submitted",owner)).authorizationIsReal===false);
 const denied=[
 ["create",null,owner,"FORBIDDEN"],
 ["submit","draft",owner,"FORBIDDEN"],
 ["submit","draft",actor("SUPERADMIN","staff","aal1"),"MFA_REQUIRED"],
 ["approve","submitted",staff,"FORBIDDEN"],
 ["approve","submitted",editor,"FORBIDDEN"],
 ["approve","submitted",viewer,"FORBIDDEN"],
 ["changes","submitted",viewer,"FORBIDDEN"],
 ["reject","submitted",editor,"FORBIDDEN"],
 ["apply","approved",viewer,"FORBIDDEN"],
 ["revise","needs_changes",owner,"FORBIDDEN"],
 ["approve","draft",owner,"INVALID_TRANSITION"],
 ["approve","approved",owner,"INVALID_TRANSITION"],
 ["apply","applied",owner,"INVALID_TRANSITION"],
 ["submit","submitted",staff,"INVALID_TRANSITION"],
 ["revise","approved",staff,"INVALID_TRANSITION"],
 ["apply","rejected",editor,"INVALID_TRANSITION"]
 ];
 for(const [action,status,person,error] of denied){
  test("denegado "+action+"/"+status+"/"+person.role,
   m.contractDecision(input(action,status,person)).code===error);
 }
 const variants=[
 ["otro tenant",{scope:{...all,organizationId:"c2"}},"SCOPE_DENIED"],
 ["otro sitio",{siteId:"s2",scope:selected},"SCOPE_DENIED"],
 ["editor scope all",{scope:all},"SCOPE_DENIED"],
 ["cuenta revocada",{actor:actor("CLIENT_EDITOR","client","aal1",false)},"FORBIDDEN"],
 ["revisión antigua",{expectedRevision:0},"STALE_REVISION"],
 ["borrador antiguo",{expectedDraftVersion:2},"STALE_DRAFT"]
 ];
 for(const [name,extra,code] of variants){
  const result=m.contractDecision(input("apply","approved",editor,extra));
  test(name,result.code===code);
 }
 test("observación corta rechazada",m.contractDecision(input("changes","submitted",editor,{note:"corta"})).code==="INVALID_NOTE");
 test("observación de 500 caracteres",m.contractDecision(input("changes","submitted",editor,{note:"a".repeat(500)})).ok);
 test("observación de 501 rechazada",!m.contractDecision(input("changes","submitted",editor,{note:"a".repeat(501)})).ok);
 test("acción inventada denegada",m.contractDecision(input("delete","draft",owner)).code==="INVALID_ACTION");
 test("entrada ausente denegada",m.contractDecision(null).code==="INVALID_ACTION");
 test("SQL V13 sigue legacy",read("db/v13-propuestas-scopes.review.sql").includes("submitted_for_review"));
 test("SQL V1 sigue no vacío",read("db/schema_core.review.sql").includes("slug text not null check"));
 test("demo aún usa slug vacío",read("tests/transactional-api-v14.test.cjs").includes('slug:""'));
 const sql=read("db/v20-contratos-propuestos.review.sql");
 test("archivo SQL solo comentarios",sql.split("\n").every(line=>!line.trim()||line.trim().startsWith("--")));
 test("SQL explica slug home",sql.includes("slug='home'"));
 test("SQL propone estados",sql.includes("'submitted'")&&sql.includes("'applied'"));
 test("SQL NO EJECUTAR",sql.includes("NO EJECUTAR"));
 test("módulo sin red",!read("shared/mg-contracts-v20.js").includes("fetch("));
 console.log("\n"+n+" verificaciones V20 en memoria correctas.");
 return n;
}
if(require.main===module)main();
module.exports={main};
