"use strict";
/* node apps/mg-web-studio-cloud/tests/staging-readiness-v17.test.cjs
 * ÚNICAMENTE reglas y casos hipotéticos. No autoriza gastos o despliegues.
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
const sandbox={};new Function("window",read("shared/mg-staging-readiness-v17.js"))(sandbox);
const gate=sandbox.MGStageGateV17;
let pass=0;function ok(name,v){assert.ok(v,name);pass++;console.log("✓ "+name);}
function assertCount(name,n,a,b){ok(name,Number.isSafeInteger(n)&&n>=a&&n<=b);}
function allRecords(items){return Object.fromEntries(items.map(r=>[r.id,{status:"simulated_checked",evidence:"Evidencia ficticia de laboratorio (no real)."}]));}
function main(){
 ok("motor V17",gate.version==="17.0-review");
 ok("los tres estados de demo",gate.statuses.join(",")==="pending,documented,simulated_checked");
 ok("30+ requisitos",gate.requirements.length>=30);
 ok("IDs únicos",new Set(gate.requirements.map(r=>r.id)).size===gate.requirements.length);
 ok("sin registro duplicado de categorías",Object.keys(gate.categories).length===6);
 ok("al menos 10 bloqueos críticos de staging",gate.requirements.filter(r=>r.gate==="stage"&&r.critical).length>=10);
 ok("producción separada de staging",gate.requirements.filter(r=>r.gate==="production").length>=10);
 ok("sin activar IA externa",gate.requirements.some(r=>r.id==="ai_billing"&&r.gate==="stage"));
 ok("approval staging critical",gate.requirements.find(r=>r.id==="approval").critical);
 ok("RLS real crítico",gate.requirements.find(r=>r.id==="rls_test").critical);
 ok("backups obligatorios para staging",gate.requirements.find(r=>r.id==="recovery_plan").critical);
 ok("staging aislado",gate.requirements.find(r=>r.id==="independent_project").critical);
 const baseline=gate.evaluate();
 ok("baseline válido",baseline.valid);
 ok("estado no autorizado",baseline.actualAuthorization===false);
 ok("sin staging desplegado",baseline.actualStagingDeployed===false);
 ok("sin producción publicada",baseline.actualProductionPublished===false);
 ok("total coincide",baseline.summary.total===gate.requirements.length);
 ok("todo pendiente",baseline.summary.pending===baseline.summary.total);
 ok("ninguna evidencia simulada",baseline.summary.simulated_checked===0);
 ok("staging no listo de inicio",baseline.stage.hypothetical===false);
 ok("producción no lista de inicio",baseline.production.hypothetical===false);
 ok("bloqueos lista",baseline.blockers.length>0);
 ok("cuenta por gate",baseline.stage.count+baseline.production.count===baseline.summary.total);
 for(const k of Object.keys(gate.categories)){
  ok("categoría "+k,gate.requirements.some(x=>x.category===k));
 }
 const documented={};
 for(const r of gate.requirements)documented[r.id]={status:"documented",evidence:"Se redactó un plan de ejemplo, no se instaló nada."};
 const doc=gate.evaluate(documented);
 ok("todos documentados",doc.summary.documented===gate.requirements.length);
 ok("documentación no abre staging",!doc.stage.hypothetical);
 ok("documentación no abre producción",!doc.production.hypothetical);
 ok("documentación no es autorización",!doc.actualAuthorization);
 const stageRecs=allRecords(gate.requirements.filter(r=>r.gate==="stage"));
 const stage=gate.evaluate(stageRecs);
 ok("stage completo hipotético",stage.stage.hypothetical);
 ok("producción bloqueada",!stage.production.hypothetical);
 ok("stage 0 pendientes",stage.stage.pending===0);
 ok("no hay autorización automática con etapa completa",stage.actualAuthorization===false);
 ok("no habilita Supabase",stage.actualStagingDeployed===false);
 ok("quedan requisitos de producción",stage.production.pending>0);
 const all=allRecords(gate.requirements);
 const full=gate.evaluate(all);
 ok("todos verificados ficticiamente",full.summary.simulated_checked===full.summary.total);
 ok("hipótesis de staging completa",full.stage.hypothetical);
 ok("hipótesis de producción completa",full.production.hypothetical);
 ok("pero no hay autorización real",full.actualAuthorization===false);
 ok("pero no se publicó",full.actualProductionPublished===false);
 ok("no hay bloqueos hipotéticos",full.blockers.length===0);
 const missing=JSON.parse(JSON.stringify(all));missing.approval.status="pending";missing.approval.evidence="";
 const unapproved=gate.evaluate(missing);
 ok("sin aprobación ficticia bloquea staging",!unapproved.stage.hypothetical);
 ok("sin aprobación ficticia bloquea producción",!unapproved.production.hypothetical);
 ok("identifica approval",unapproved.stage.blockers.some(x=>x.id==="approval"));
 const noSecurity=JSON.parse(JSON.stringify(all));noSecurity.rls_test.status="documented";
 ok("RLS solo documentado bloquea staging",!gate.evaluate(noSecurity).stage.hypothetical);
 const noBackup=JSON.parse(JSON.stringify(all));noBackup.recovery_plan.status="pending";
 ok("falta backup bloquea staging",!gate.evaluate(noBackup).stage.hypothetical);
 const noBudget=JSON.parse(JSON.stringify(all));noBudget.budget.status="documented";
 ok("presupuesto sin verificar bloquea staging",!gate.evaluate(noBudget).stage.hypothetical);
 const noProduction=JSON.parse(JSON.stringify(all));noProduction.security_review.status="pending";
 ok("auditoría no realizada bloquea producción",!gate.evaluate(noProduction).production.hypothetical);
 const errorStatus=gate.evaluate({approval:{status:"hacked",evidence:"Comentario de ejemplo"}});
 ok("rechaza estado desconocido",!errorStatus.valid);
 ok("estado desconocido no cuenta",errorStatus.summary.pending===baseline.summary.total);
 ok("registra error",errorStatus.errors.length===1);
 ok("rechaza ID de requisito ajeno",!gate.evaluate({made_up:{status:"simulated_checked",evidence:"Inventado."}}).valid);
 ok("sin evidencia de cinco letras bloquea",!gate.evaluate({approval:{status:"simulated_checked",evidence:"A"}}).valid);
 ok("sin evidencia no cuenta",gate.evaluate({approval:{status:"simulated_checked",evidence:""}}).summary.simulated_checked===0);
 ok("bloquea HTML de campo",!gate.evaluate({approval:{status:"documented",evidence:"<img src=x>"}}).valid);
 ok("bloquea control characters",!gate.evaluate({approval:{status:"documented",evidence:"Texto\nprivado"}}).valid);
 ok("bloquea demasiados caracteres",!gate.evaluate({approval:{status:"documented",evidence:"a".repeat(351)}}).valid);
 ok("acepta comentario válido",gate.evaluate({approval:{status:"documented",evidence:"Evidencia solo de prueba"}}).valid);
 ok("sin registros externos",gate.evaluate(null).valid);
 const budgets=[
 ["unselected",null],["free",0],["pro_new",25],["pro_extra",10]
 ];
 for(const [kind,price] of budgets){
  const r=gate.budget(kind);
  ok("escenario "+kind+" admitido",r.ok&&r.minimumMonthlyUsd===price);
  ok("escenario "+kind+" es estimado",r.estimateOnly===true);
  ok("fuente de precio "+kind,r.source==="https://supabase.com/pricing");
  ok("extras no cubiertos "+kind,r.exclusions.length>=2);
 }
 ok("rechaza plan no reconocido",!gate.budget("enterprise_unverified").ok);
 ok("escenario gratis sin backup automático",gate.budget("free").detail.includes("backups automáticos"));
 ok("escenario pro nuevo 25 base",gate.budget("pro_new").minimumMonthlyUsd===25);
 ok("micro adicional es costo incremental",gate.budget("pro_extra").minimumMonthlyUsd===10);
 ok("presupuesto no cifra complementos",gate.budget("pro_new").exclusions.some(x=>x.includes("IA")));
 const metrics=gate.evaluate(stageRecs);
 metrics.stage.pending=999;
 ok("resultados detached",gate.evaluate(stageRecs).stage.pending===0);
 const templates=require("node:fs").readFileSync(path.join(__dirname,"..","prototipo.html"),"utf8");
 const portal=require("node:fs").readFileSync(path.join(__dirname,"..","portal-cliente.html"),"utf8");
 ok("admin de demo preservado",templates.includes("inboxDemoLaunch"));
 ok("portal demo preservado",portal.includes("inboxDemoLaunch"));
 const source=read("shared/mg-staging-readiness-v17.js");
 ok("no fetch",!source.includes("fetch("));
 ok("no storage automática",!source.includes("localStorage")&&!source.includes("sessionStorage"));
 ok("no creación remota",!source.includes("new WebSocket"));
 console.log("\n"+pass+" tests V17 del motor de preparación correctos. Son exclusivamente simulaciones.");
 return pass;
}
if(require.main===module)main();
module.exports={main};
