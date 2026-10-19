"use strict";
/* V18 PRE-FLIGHT: READ FILES ONLY.
 * No network calls, no shell, no database, no service activation.
 * Run: node apps/mg-web-studio-cloud/staging/v18-preflight.cjs
 */
const fs=require("node:fs"),path=require("node:path");
const project=path.join(__dirname,"..");
const text=file=>fs.readFileSync(path.join(project,file),"utf8");
const runtime={};
new Function("window",text("shared/mg-staging-package-v18.js"))(runtime);
const gate=runtime.MGStagingPackageV18;
const manifest=JSON.parse(text("staging/v18-manifest.review.json"));
const env=JSON.parse(text("staging/v18-env-names.review.json"));
const procedure=JSON.parse(text("staging/v18-procedure.review.json"));
const reviews=Object.fromEntries(gate.expectedSQL.map(name=>[name,text(name)]));
const result=gate.inspect(manifest,env,procedure,reviews);
const output=gate.redactReport(result);
if(require.main===module){
 console.log(output);
 console.log("Autorización real: NO. Solo se verificó el formato de archivos locales.");
 if(!result.valid)process.exitCode=1;
}
module.exports={result,output};
