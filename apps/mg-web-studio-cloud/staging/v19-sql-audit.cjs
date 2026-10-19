"use strict";
/* V19 REVIEW ONLY. Executes no SQL, HTTP, shell, migrations or provisioning.
 * Run: node apps/mg-web-studio-cloud/staging/v19-sql-audit.cjs
 */
const fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const world={};new Function("window",read("shared/mg-sql-compat-v19.js"))(world);
const validator=world.MGSqlCompatibilityV19;
const sqlReviews=Object.fromEntries(validator.files.map(file=>[file,read(file)]));
const result=validator.assess({
 sqlReviews,
 demoCode:read("tests/transactional-api-v14.test.cjs"),
 manifest:JSON.parse(read("staging/v18-manifest.review.json"))
});
const lines=[
 "MG WEB STUDIO CLOUD · V19 · AUDITORÍA SQL ESTÁTICA · NO GO",
 "Tablas reconocidas: "+result.tables.length,
 "Dependencias fuera de orden: "+result.dependencyViolations,
 "Políticas heredadas retiradas: "+result.retiredPolicyCount,
 "Problemas de compatibilidad confirmados: "+result.counts.blocker,
 "Revisiones pendientes: "+result.counts.review,
 ...result.issues.map(x=>"- "+x.severity.toUpperCase()+" "+x.code+": "+x.detail),
 "Autorización/despliegue: NO. SQL ejecutado: NO. RLS real probado: NO."
];
if(require.main===module){
 console.log(lines.join("\n"));
 // Nonzero denotes unresolved blockers; it never triggers deployment.
 if(result.counts.blocker>0||!result.validInputs)process.exitCode=2;
}
module.exports={result,lines};
