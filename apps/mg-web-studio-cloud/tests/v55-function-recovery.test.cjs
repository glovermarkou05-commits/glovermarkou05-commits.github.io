"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const doc=fs.readFileSync(path.join(root,"docs/V55-AUDITORIA-FUNCIONES-Y-RECUPERACION.md"),"utf8");
const m=JSON.parse(fs.readFileSync(path.join(root,"staging/v55-function-recovery.review.json"),"utf8"));
test("el catálogo de public no contiene funciones accesibles",()=>{
 assert.equal(m.functionAudit.schema,"public");
 assert.equal(m.functionAudit.functionCount,0);
 assert.equal(m.functionAudit.securityDefinerCount,0);
 assert.equal(m.functionAudit.anonExecutableCount,0);
 assert.equal(m.functionAudit.authenticatedExecutableCount,0);
});
test("se documentan los límites del rol sin elevar privilegios",()=>{
 assert.equal(m.roleBoundary.currentUser,"postgres");
 assert.equal(m.roleBoundary.currentUserSuperuser,false);
 assert.equal(m.roleBoundary.currentUserMemberOfSupabaseAdmin,false);
 assert.equal(m.roleBoundary.supabaseAdminDefaults,"UNCHANGED");
 assert.match(doc,/No se intentó cambiar de rol, otorgar membresía/);
});
test("la recuperación permanece pendiente y no activa costos",()=>{
 assert.equal(m.recovery.backupCreated,false);
 assert.equal(m.recovery.restorePerformed,false);
 assert.equal(m.constraints.paidServicesActivated,false);
 assert.equal(m.status.recoveryTest,"PENDING");
 assert.match(doc,/RECOVERY_NOT_TESTED/);
});
test("el registro mantiene producción bloqueada y V54 trazable",()=>{
 assert.equal(m.v54.version,"20261020191612");
 assert.equal(m.status.production,"NO_GO");
 assert.equal(m.constraints.productionTouched,false);
 assert.equal(m.constraints.deployment,false);
 assert.match(doc,/V55 resultado/);
});
