'use strict';
// Static contract and refusal checks only. Actual pg_dump and pg_restore run
// in a separate explicitly scoped GitHub Actions job.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.join(__dirname,'..');
const scriptFile=path.join(root,'scripts/run-v90-pg17-synthetic-restore.sh');
const sh=readFileSync(scriptFile,'utf8');
const snap=readFileSync(path.join(root,'sql/v90-canonical-snapshot.sql'),'utf8');
const roles=readFileSync(path.join(root,'sql/v90-target-roles-only.sql'),'utf8');
const fixtures=readFileSync(path.join(root,'sql/v86-setup-synthetic-tenants.sql'),'utf8');
const verify=readFileSync(path.join(root,'sql/v86-verify-rls.sql'),'utf8');

test('V90 boot script is valid Bash without executing Docker',()=>{
 const r=spawnSync('bash',['-n',scriptFile],{encoding:'utf8',timeout:3000});
 assert.equal(r.status,0,r.stderr);
});
test('V90 fails closed when not in the exact GitHub runner context',()=>{
 const r=spawnSync('bash',[scriptFile],{encoding:'utf8',timeout:3000,
  env:{PATH:process.env.PATH,HOME:process.env.HOME}});
 assert.equal(r.status,2);
 assert.match(r.stderr,/V90 BLOCKED/);
 assert.doesNotMatch(r.stdout,/V90 DUMP/);
});
test('V90 requires exact repo and development branch and restore-only scope',()=>{
 for(const v of ['github-hosted','MG_V90_SYNTHETIC_RESTORE_ONLY',
  'refs/heads/feature/mg-digital-v5-web-services',
  'glovermarkou05-commits/glovermarkou05-commits.github.io'])
  assert.ok(sh.includes(v),v);
});
test('both containers are independently named and not preexisting',()=>{
 for(const v of ['mg-webstudio-v90-source','mg-webstudio-v90-destination',
  'container inspect "$name"','container name collision'])
  assert.ok(sh.includes(v),v);
 assert.doesNotMatch(sh,/supabase_db_bazar_online_4r_local_only/);
});
test('exact official PG17 image and explicit version check',()=>{
 assert.match(sh,/IMAGE='postgres:17-bookworm'/);
 assert.match(sh,/postgres --version/);
 assert.match(sh,/PG_VERSION/);
});
test('network none, no TCP and no public ports in both containers',()=>{
 assert.match(sh,/--network none/);
 assert.match(sh,/postgres -c "listen_addresses="/);
 assert.match(sh,/HostConfig\.PortBindings/);
 assert.match(sh,/HostConfig\.NetworkMode/);
 assert.doesNotMatch(sh,/^\s*--publish\b|^\s*--privileged\b|^\s*--volume\b/m);
});
test('distinct volatile PGDATA with no bind mount or persistent Docker volume',()=>{
 assert.match(sh,/--tmpfs '\/var\/lib\/postgresql\/data:rw,size=671088640'/);
 assert.match(sh,/--read-only/);
 assert.doesNotMatch(sh,/--mount\b|--volumes-from|docker volume create/);
});
test('conservative capped resources per container',()=>{
 for(const v of ['--memory 1024m','--memory-swap 1024m','--cpus 1',
  '--pids-limit 128','--security-opt no-new-privileges'])
  assert.ok(sh.includes(v),v);
});
test('transient random per-container passwords are not printed',()=>{
 assert.match(sh,/openssl rand -hex 32/);
 assert.match(sh,/unset password/);
 assert.doesNotMatch(sh,/echo.*\$password/);
 assert.doesNotMatch(sh,/set -x/);
});
test('only previous V86 completely fictional fixture and V86 RLS assertions',()=>{
 assert.match(sh,/v86-setup-synthetic-tenants\.sql/);
 assert.match(sh,/v86-verify-rls\.sql/);
 for(const v of ["'DEMO-A'","'DEMO-B'","'A-01'","'B-02'"])
  assert.ok(fixtures.includes(v),v);
 assert.match(verify,/V86 COMPLETE: real SQL RLS isolation assertions passed/);
});
test('pg_dump custom-format archive is bounded and validated',()=>{
 assert.match(sh,/pg_dump -Fc/);
 assert.match(sh,/head -c 5 "\$workdir\/source\.dump"/);
 assert.match(sh,/!= PGDMP/);
 assert.match(sh,/dump_bytes > 1048576/);
 assert.match(sh,/sha256sum "\$workdir\/source\.dump"/);
});
test('restore only into distinct empty destination, single transaction',()=>{
 assert.match(sh,/pg_restore -Fc --exit-on-error --single-transaction/);
 assert.match(sh,/--no-owner/);
 assert.match(sh,/-d mg_v90_destination < "\$workdir\/source\.dump"/);
 assert.match(sh,/start_pg "\$SOURCE" mg_v90_source/);
 assert.match(sh,/start_pg "\$DEST" mg_v90_destination/);
});
test('target creates only three fake NOLOGIN roles rather than globals from production',()=>{
 assert.equal((roles.match(/CREATE ROLE mg_v86_/g)||[]).length,3);
 assert.equal((roles.match(/NOLOGIN NOINHERIT NOBYPASSRLS/g)||[]).length,3);
 assert.doesNotMatch(roles,/CREATE USER|CREATE DATABASE|GRANT\s+ALL|PASSWORD/);
});
test('snapshot covers row contents and schema columns and constraints',()=>{
 for(const x of ["'row|'","'column|'","'constraint|'","'table|'"])
  assert.ok(snap.includes(x),x);
 assert.match(snap,/FROM mg_v86\.records ORDER BY id/);
});
test('snapshot covers RLS, policy details, indexes and privileges',()=>{
 for(const x of ['pg_policies','relforcerowsecurity',
  'pg_indexes','has_schema_privilege','has_table_privilege','pg_roles'])
  assert.ok(snap.includes(x),x);
});
test('snapshot covers extensions without claiming nondefault extension restore',()=>{
 assert.match(snap,/pg_extension/);
 assert.match(snap,/'extension\|'/);
 assert.doesNotMatch(snap,/CREATE EXTENSION/);
});
test('source and restored database snapshots must be identical',()=>{
 assert.match(sh,/cmp -s "\$workdir\/source\.snapshot" "\$workdir\/dest\.snapshot"/);
 assert.match(sh,/V90 RESTORE FAIL/);
 assert.match(sh,/V90 RESTORE VERIFIED/);
});
test('real RLS audit must run in both source and restored database',()=>{
 assert.match(sh,/sql "\$SOURCE" mg_v90_source "\$VERIFY"/);
 assert.match(sh,/sql "\$DEST" mg_v90_destination "\$VERIFY"/);
});
test('dump stored only in runner disposable workspace and never uploaded',()=>{
 assert.match(sh,/mktemp -d/);
 assert.match(sh,/RUNNER_TEMP/);
 assert.match(sh,/rm -f -- "\$workdir\/source\.dump"/);
 assert.doesNotMatch(sh,/upload-artifact|scp\b|aws s3|artifact_tool|curl\b/);
});
test('cleanup verifies both containers absent and archive removed even on failure',()=>{
 assert.match(sh,/trap cleanup EXIT/);
 assert.match(sh,/trap 'exit 130' INT/);
 assert.match(sh,/trap 'exit 143' TERM/);
 assert.match(sh,/docker stop -t 5 "\$SOURCE"/);
 assert.match(sh,/docker stop -t 5 "\$DEST"/);
 assert.match(sh,/docker rm -f -v "\$SOURCE"/);
 assert.match(sh,/docker rm -f -v "\$DEST"/);
 assert.match(sh,/V90 CLEANUP VERIFIED/);
});
test('V90 does not pretend encryption, RPO/RTO or formal V67 review',()=>{
 assert.match(sh,/no encrypted backup/);
 assert.match(sh,/NOT RPO\/RTO certification/);
 assert.match(sh,/32 formally pending/);
 assert.match(sh,/NO_GO for production/);
});
test('no external URLs, public listener, local Windows/Docker data or deployment',()=>{
 const combined=sh+snap+roles;
 for(const x of ['supabase.co','https://','http://','BAZAR-ONLINE',
  'postgresql://','kubectl','fly deploy','docker compose','wsl --shutdown']){
  assert.ok(!combined.includes(x),x);
 }
});
