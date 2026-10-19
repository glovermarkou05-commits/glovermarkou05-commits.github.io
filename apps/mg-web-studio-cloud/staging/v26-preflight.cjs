"use strict";
/* V26 local PRE-FLIGHT — read-only inventory. No network, subprocess, SQL, deploy,
 * project provisioning, persistence or paid services.
 * Run from repo root: node apps/mg-web-studio-cloud/staging/v26-preflight.cjs
 * Exit 2 = expected NO GO; exit 1 = invalid/unreadable inventory.
 */
const fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const read=name=>fs.readFileSync(path.join(root,name),"utf8");
const w={};
for(const file of ["mg-staging-readiness-v17.js","mg-staging-package-v18.js","mg-sql-compat-v19.js","mg-sql-api-compat-v21.js","mg-readiness-v26.js"])
 new Function("window",read("shared/"+file))(w);
const deps={v17:w.MGStageGateV17,v18:w.MGStagingPackageV18,v19:w.MGSqlCompatibilityV19,v21:w.MGSqlApiCompatV21};
const inputs={
 manifest:JSON.parse(read("staging/v18-manifest.review.json")),
 env:JSON.parse(read("staging/v18-env-names.review.json")),
 procedure:JSON.parse(read("staging/v18-procedure.review.json")),
 sqlReviews:Object.fromEntries(deps.v18.expectedSQL.map(name=>[name,read(name)])),
 v20ContractSource:read("shared/mg-contracts-v20.js"),
 v25WorkflowSource:read("shared/mg-e2e-workflow-v25.js"),
 v14DemoCode:read("tests/transactional-api-v14.test.cjs")
};
const report=w.MGTechnicalReadinessV26.assess(deps,inputs);
const output=w.MGTechnicalReadinessV26.render(report);
if(require.main===module){
 console.log(output);
 // NO GO is EXPECTED, even when the inventory format is valid.
 process.exitCode=report.validInputs?2:1;
}
module.exports={report,output};
