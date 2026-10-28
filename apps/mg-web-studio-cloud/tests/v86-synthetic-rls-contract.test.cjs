'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const base=path.join(__dirname,'..');
const sh=readFileSync(path.join(base,'scripts/run-v86-synthetic-rls.sh'),'utf8');
const setup=readFileSync(path.join(base,'sql/v86-setup-synthetic-tenants.sql'),'utf8');
const sql=readFileSync(path.join(base,'sql/v86-verify-rls.sql'),'utf8');
test('bootstrap shell parses with Bash and refuses local invocation',()=>{
 const check=spawnSync('bash',['-n',path.join(base,'scripts/run-v86-synthetic-rls.sh')],{encoding:'utf8'});
 assert.equal(check.status,0,check.stderr);
 const x=spawnSync('bash',[path.join(base,'scripts/run-v86-synthetic-rls.sh')],{
  encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME}});
 assert.equal(x.status,2);assert.match(x.stderr,/specific GitHub runner/);
});
test('hard-coded approved GitHub branch and scope, not reusable on Windows',()=>{
 for(const s of ['github-hosted','MG_V86_SQL_AND_SYNTHETIC_ONLY',
  'refs/heads/feature/mg-digital-v5-web-services',
  'glovermarkou05-commits/glovermarkou05-commits.github.io'])
 assert.ok(sh.includes(s),s);
});
test('PG17 isolated no TCP no ports or Docker host mounts',()=>{
 for(const s of ['postgres:17-bookworm','--network none',
  'postgres -c "listen_addresses="','HostConfig.NetworkMode',
  'HostConfig.PortBindings','HostConfig.Memory','--read-only',
  '--security-opt no-new-privileges'])
  assert.ok(sh.includes(s),s);
 assert.doesNotMatch(sh,/^\s*--publish|^\s*--privileged|^\s*--volume|^\s*--mount\b/m);
});
test('separate limited CPU memory swap and volatile PGDATA',()=>{
 for(const s of ['--memory 1024m','--memory-swap 1024m','--cpus 1',
  '--pids-limit 128','--tmpfs \'/var/lib/postgresql/data:rw,size=671088640\''])
  assert.ok(sh.includes(s),s);
});
test('only two fixed checked-in SQL files can be run',()=>{
 assert.match(sh,/v86-setup-synthetic-tenants\.sql/);
 assert.match(sh,/v86-verify-rls\.sql/);
 assert.equal((sh.match(/docker exec -i "\$NAME" psql/g)||[]).length,2);
 assert.doesNotMatch(sh,/docker exec "\$NAME" sh -c|docker compose|pg_restore|pg_dump/);
});
test('cleanup always attempts removal and verifies absence',()=>{
 for(const s of ['trap cleanup EXIT','trap \'exit 130\' INT',
  'trap \'exit 143\' TERM','docker rm -f -v "$NAME"',
  'V86 CLEANUP VERIFIED'])assert.ok(sh.includes(s),s);
});
test('transient random password never printed',()=>{
 assert.match(sh,/openssl rand -hex 32/);
 assert.match(sh,/unset password/);
 assert.doesNotMatch(sh,/echo.*\$password|set -x/);
});
test('fixture has two unrelated invented tenant values and four site values',()=>{
 for(const s of ["'DEMO-A'","'DEMO-B'","'A-01'","'A-02'","'B-01'","'B-02'"])
 assert.ok(setup.includes(s),s);
});
test('roles created with no login or bypass RLS',()=>{
 assert.equal((setup.match(/CREATE ROLE mg_v86_/g)||[]).length,3);
 assert.equal((setup.match(/NOLOGIN NOINHERIT NOBYPASSRLS/g)||[]).length,3);
});
test('row-level security is enabled and forced',()=>{
 assert.match(setup,/ENABLE ROW LEVEL SECURITY/);
 assert.match(setup,/FORCE ROW LEVEL SECURITY/);
});
test('two independent explicit policies protect tenant AND site',()=>{
 assert.match(setup,/CREATE POLICY scope_demo_a[\s\S]+tenant_code='DEMO-A' AND site_code='A-01'/);
 assert.match(setup,/CREATE POLICY scope_demo_b[\s\S]+tenant_code='DEMO-B' AND site_code='B-01'/);
 assert.equal((setup.match(/WITH CHECK \(/g)||[]).length,2);
});
test('no global PUBLIC table grant',()=>{
 assert.doesNotMatch(setup,/GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)\s+ON\s+mg_v86\.records\s+TO\s+PUBLIC/i);
 assert.match(setup,/REVOKE ALL ON SCHEMA mg_v86 FROM PUBLIC/);
});
test('guest gets SELECT but no RLS policies and no writes',()=>{
 assert.match(setup,/GRANT SELECT ON mg_v86\.records TO mg_v86_guest/);
 assert.doesNotMatch(setup,/CREATE POLICY[^\n]+TO mg_v86_guest/);
 assert.match(sql,/V86_GUEST_DEFAULT_DENY_FAIL/);
});
test('real SQL tests assert row visibility separately for each tenant',()=>{
 for(const s of ['SET LOCAL ROLE mg_v86_tenant_a','SET LOCAL ROLE mg_v86_tenant_b',
  'V86_A_SCOPE_LEAK','V86_B_SCOPE_LEAK','V86_A_FOREIGN_READ','V86_B_FOREIGN_READ'])
 assert.ok(sql.includes(s),s);
});
test('negative tests reject cross-tenant and cross-site inserts and updates',()=>{
 for(const s of ['V86_A_CROSS_TENANT_INSERT_ALLOWED','V86_A_CROSS_SITE_INSERT_ALLOWED',
  'V86_A_CROSS_TENANT_UPDATE_ALLOWED','V86_B_CROSS_TENANT_INSERT_ALLOWED',
  'V86_B_CROSS_SITE_INSERT_ALLOWED'])
 assert.ok(sql.includes(s),s);
 assert.ok((sql.match(/WHEN insufficient_privilege THEN NULL/g)||[]).length>=5);
});
test('foreign read update delete excluded by RLS',()=>{
 for(const s of ['V86_A_FOREIGN_UPDATE','V86_A_FOREIGN_DELETE','V86_B_FOREIGN_UPDATE'])
 assert.ok(sql.includes(s),s);
});
test('transactional assertions cannot persist test writes',()=>{
 assert.equal((sql.match(/^ROLLBACK;$/gm)||[]).length,3);
 assert.match(sql,/V86_TEST_TRANSACTION_LEAK/);
 assert.match(sql,/V86_ROLLBACK_FAIL/);
});
test('catalog/grants/least-privilege checks run as bootstrap owner',()=>{
 for(const s of ['pg_roles','rolbypassrls','pg_policies','relrowsecurity',
  'relforcerowsecurity','has_table_privilege','V86_GRANTS_FAIL'])
 assert.ok(sql.includes(s),s);
});
test('setup and verification both fail closed on SQL errors',()=>{
 assert.match(setup,/\\set ON_ERROR_STOP on/);
 assert.match(sql,/\\set ON_ERROR_STOP on/);
 assert.equal((sh.match(/-v ON_ERROR_STOP=1/g)||[]).length,2);
});
test('no actual customer data, external database, HTTP, production or restore paths',()=>{
 const all=sh+setup+sql;
 for(const s of ['supabase.co','BAZAR-ONLINE','supabase_db_bazar_online_4r_local_only',
  'postgresql://','api/public/','https://','pg_restore','DROP DATABASE']){
  assert.ok(!all.includes(s),s);
 }
});
test('operational V67 still PENDING and deployment blocked',()=>{
 assert.match(sh,/V67=32 PENDING/);
 assert.match(sh,/V86 DECISION: NO_GO/);
});
