'use strict';
// V94B: offline/fail-closed contract tests. No SQL, Docker or network executed here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const shell = read('scripts/run-v94-pg17-full-schema-lab.sh');
const role = read('sql/v94-synthetic-global-roles.sql.txt');
const auth = read('sql/v94-synthetic-auth-and-pgtap.sql.txt');
const seed = read('sql/v94-synthetic-seed.sql.txt');
const snap = read('sql/v94-catalog-snapshot.sql.txt');
const v53 = read('tests/v53-rls-runtime.test.sql');
const docker = read('docker/v94-postgres-pgtap.Dockerfile');

test('shell syntax validates offline', () => {
 const r=cp.spawnSync('bash',['-n',path.join(root,'scripts/run-v94-pg17-full-schema-lab.sh')],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('refuses to execute outside authorized GitHub runner', () => {
 const r=cp.spawnSync('bash',[path.join(root,'scripts/run-v94-pg17-full-schema-lab.sh')],{
  encoding:'utf8',timeout:6000,
  env:{PATH:process.env.PATH||'/usr/bin:/bin',GITHUB_ACTIONS:'false'}
 });
 assert.equal(r.status,2);
 assert.match(r.stderr,/V94 BLOCKED/);
 assert.doesNotMatch(r.stdout,/V94 BACKUP|V94 READY/);
});
test('scope locked to exact branch and repository', () => {
 assert.match(shell,/docs\/mg-web-studio-v94-preflight-20261101/);
 assert.match(shell,/RUNNER_ENVIRONMENT:-/);
 assert.match(shell,/MG_V94_SCOPE:-/);
 assert.match(shell,/glovermarkou05-commits\/glovermarkou05-commits\.github\.io/);
 assert.match(shell,/id -u/);
});
test('exactly two fixed ephemeral names, no public port or TCP listener', () => {
 assert.match(shell,/mg-webstudio-v94-source/);
 assert.match(shell,/mg-webstudio-v94-destination/);
 assert.match(shell,/--network none/);
 assert.match(shell,/HostConfig\.PortBindings/);
 assert.match(shell,/listen_addresses=/);
 assert.match(shell,/--read-only/);
 assert.match(shell,/--tmpfs/);
 assert.match(shell,/--memory 1536m/);
 assert.match(shell,/--cpus 1/);
});
test('each database has finite resources and cleanup enforced', () => {
 assert.match(shell,/--pids-limit 160/);
 assert.match(shell,/trap cleanup EXIT/);
 assert.match(shell,/docker rm -f -v/);
 assert.match(shell,/V94 FAIL: ephemeral cleanup incomplete/);
 assert.match(shell,/rm -f --/);
 assert.doesNotMatch(shell,/upload-artifact|docker volume create|docker compose/);
});
test('roles do not login or bypass RLS, no real Supabase keys', () => {
 for(const name of ['anon','authenticated','service_role']){
  assert.match(role,new RegExp('CREATE ROLE '+name+' NOLOGIN NOINHERIT NOBYPASSRLS'));
 }
 assert.doesNotMatch(role,/PASSWORD|LOGIN\s*;/);
 assert.doesNotMatch(shell,/SUPABASE_URL|SUPABASE_SERVICE_ROLE|DATABASE_URL|PGHOST/);
});
test('minimal synthetic Auth contract includes required V53 columns and function', () => {
 for(const col of ['id uuid','aud text','role text','email text','email_confirmed_at timestamptz',
 'created_at timestamptz','updated_at timestamptz','raw_app_meta_data jsonb','raw_user_meta_data jsonb',
 'is_anonymous boolean']){
   assert.ok(auth.includes(col),'missing '+col);
 }
 assert.match(auth,/CREATE FUNCTION auth\.uid\(\)/);
 assert.match(auth,/GRANT USAGE ON SCHEMA auth TO authenticated/);
 assert.match(auth,/GRANT USAGE ON SCHEMA extensions TO authenticated/);
});
test('pgTAP package and extension present only in synthetic Docker image/SQL', () => {
 assert.match(docker,/FROM postgres:17\.11-bookworm/);
 assert.match(docker,/postgresql-17-pgtap/);
 assert.match(auth,/CREATE EXTENSION pgtap WITH SCHEMA extensions/);
 assert.match(v53,/extensions\.plan\(56\)/);
 assert.match(v53,/ROLLBACK;/);
});
test('backup restore uses independent clusters and fails on mismatch', () => {
 assert.match(shell,/start_pg "\$SOURCE" mg_v94_source/);
 assert.match(shell,/start_pg "\$DEST" mg_v94_dest/);
 assert.match(shell,/pg_dump -Fc/);
 assert.match(shell,/pg_restore -Fc --exit-on-error --single-transaction/);
 assert.match(shell,/--no-owner/);
 assert.match(shell,/cmp -s/);
 assert.match(shell,/schema\/ACL\/owner\/index\/policy snapshots differ/);
});
test('16 tables, 12 policies, 11 indexes; pgTAP 56/56; rollback zero residue', () => {
 assert.match(shell,/expected='16\|12\|11\|1'/);
 assert.match(shell,/tap_count/);
 assert.match(shell,/not ok/);
 assert.match(shell,/tap_count" != 56/);
 assert.match(shell,/after-tap\.snapshot/);
 assert.match(shell,/synthetic Auth rows persisted/);
 assert.match(snap,/FROM pg_policy/);
 assert.match(snap,/FROM pg_constraint/);
});
test('source and fixtures are lab-only, not published or operated on staging', () => {
 assert.match(seed,/v94-lab-fixture/);
 assert.match(shell,/V94 DECISION: NO_GO for production/);
 assert.doesNotMatch(shell,/supabase db push|supabase migration|kubectl|ssh |curl |wget |publish|deploy/);
});
