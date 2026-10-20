"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
const migration=fs.readFileSync(path.join(root,"supabase/migrations/20261020191612_mg_web_studio_v54_postgres_public_table_sequence_defaults.sql"),"utf8");
const draft=fs.readFileSync(path.join(root,"staging/v54-default-acl-remediation.review.sql.txt"),"utf8");
const doc=fs.readFileSync(path.join(root,"docs/V54-ACL-DEFAULTS-Y-TRAZABILIDAD.md"),"utf8");
const m=JSON.parse(fs.readFileSync(path.join(root,"staging/v54-default-acl.review.json"),"utf8"));
test("la migración V54 contiene solo los dos REVOKE autorizados",()=>{
  const statements=migration.replace(/^--.*$/gm,"").split(";").map(s=>s.trim()).filter(Boolean);
  assert.equal(statements.length,2);
  assert.match(migration,/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE ALL ON TABLES FROM anon, authenticated;/);
  assert.match(migration,/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public\s+REVOKE ALL ON SEQUENCES FROM anon, authenticated;/);
  assert.doesNotMatch(migration.replace(/^--.*$/gm,""),/supabase_admin|FUNCTIONS|CASCADE|GRANT/i);
});
test("el archivo review permanece inerte y apunta a la migración canónica",()=>{
  for(const line of draft.split(/\r?\n/)) if(/ALTER DEFAULT PRIVILEGES/i.test(line)) assert.match(line,/^--/);
  assert.match(draft,/20261020191612_mg_web_studio_v54_postgres_public_table_sequence_defaults.sql/);
});
test("el manifiesto registra el cambio y los límites verificados",()=>{
  assert.equal(m.migration.version,"20261020191612");
  assert.equal(m.status.ddlApplied,true);
  assert.equal(m.status.production,"NO_GO");
  assert.equal(m.status.deployment,false);
  assert.equal(m.databaseObservation.postgresPublic.tables.anon,false);
  assert.equal(m.databaseObservation.postgresPublic.sequences.authenticated,false);
  assert.equal(m.databaseObservation.postgresPublic.tables.service_role,true);
  assert.equal(m.databaseObservation.supabaseAdminPublic,"UNCHANGED");
  assert.equal(m.databaseObservation.postgresPublic.functions,"UNCHANGED");
  assert.equal(m.databaseObservation.rowsAcrossCheckedRelations,0);
});
test("la trazabilidad conserva ACL existentes y lista pendientes V45/restore",()=>{
  assert.match(doc,/grants de las 12 tablas MG/);
  assert.match(doc,/0 filas cada una/);
  assert.equal(m.databaseObservation.existingTableGrants,"UNCHANGED_AUTHENTICATED_SELECT_AND_SERVICE_ROLE_OPERATIONAL");
  assert.equal(m.v45Trace.canonicalMigrationInRepo,false);
  assert.equal(m.status.backupRestoreTest,"PENDING");
  assert.deepEqual(m.pending.includes("real backup/restore"),true);
});
