"use strict";
/* V48 policy gate tests. File-only; no database or cloud operations. */
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.join(__dirname,"..");
const policy=JSON.parse(fs.readFileSync(path.join(root,"staging/v48-recovery-policy.review.json"),"utf8"));
const doc=fs.readFileSync(path.join(root,"docs/V48-DECISION-RECUPERACION.md"),"utf8");
test("policy is scoped to recovery decisions on the authorized branch",()=>{
 assert.equal(policy.version,48);
 assert.equal(policy.project,"MG WEB STUDIO CLOUD");
 assert.equal(policy.branch,"feature/mg-digital-v5-web-services");
 assert.equal(policy.scope,"RECOVERY_POLICY_DECISIONS_ONLY_NO_DATABASE_ACTIONS");
});
test("synthetic-only rebuild remains a proposal",()=>{
 assert.equal(policy.strategyProposal,"EMPTY_SYNTHETIC_STAGING_REBUILD");
 assert.equal(policy.strategyApproved,false);
 assert.equal(policy.dataBoundary,"SYNTHETIC_ONLY_UNTIL_A_SEPARATE_POLICY_IS_APPROVED");
});
test("required owner decisions stay explicitly unresolved",()=>{
 for(const key of ["owner","retentionDays","rpoHours","rtoHours","isolatedRestoreTarget","encryptionCustody"])
  assert.equal(policy.policy[key],null,key);
});
test("backup and restore actions are not authorized",()=>{
 for(const key of ["createBackup","verifyBackup","restoreTest"])
  assert.equal(policy.authorizations[key],false,key);
 assert.equal(policy.decision.backupReady,false);
 assert.equal(policy.decision.restoreReady,false);
});
test("PostgreSQL, Supabase installation and production remain blocked",()=>{
 for(const key of ["postgresDdlTest","installV45","applyMigration","production","paidServices","modifyOtherProjects","deleteProject"])
  assert.equal(policy.authorizations[key],false,key);
 for(const key of ["postgresTestReady","installationReady","productionGo"])
  assert.equal(policy.decision[key],false,key);
});
test("each operational gate remains non-passing",()=>{
 assert.equal(policy.gates.length,7);
 assert.ok(policy.gates.every(g=>g.status!=="GO"&&g.status!=="PASS"));
});
test("written decision sheet does not imply completed approval",()=>{
 assert.match(doc,/POLÍTICA PENDIENTE/);
 assert.match(doc,/no se considera aprobación/);
 assert.match(doc,/no se ejecuta SQL/);
});
