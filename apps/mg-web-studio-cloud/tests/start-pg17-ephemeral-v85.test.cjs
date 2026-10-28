'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const script=path.join(__dirname,'../scripts/start-pg17-ephemeral-v85.sh');
const source=readFileSync(script,'utf8');

test('V85 shell bootstrap parses successfully without execution',()=>{
 const r=spawnSync('bash',['-n',script],{encoding:'utf8',timeout:3000});
 assert.equal(r.status,0,r.stderr);
});
test('V85 refuses all missing context before calling Docker',()=>{
 const r=spawnSync('bash',[script],{encoding:'utf8',timeout:3000,
  env:{PATH:process.env.PATH,HOME:process.env.HOME}});
 assert.equal(r.status,2);assert.match(r.stderr,/specific approved GitHub-hosted context missing/);
 assert.doesNotMatch(r.stdout,/pull official/);
});
test('V85 uses only GitHub hosted runner and exact repository/ref',()=>{
 for(const x of ["GITHUB_ACTIONS","RUNNER_ENVIRONMENT","github-hosted","RUNNER_OS",
  "glovermarkou05-commits/glovermarkou05-commits.github.io",
  "refs/heads/feature/mg-digital-v5-web-services","MG_V85_SCOPE","MG_V85_POSTGRES_BOOT_ONLY"])
  assert.ok(source.includes(x),x);
});
test('V85 cannot create a public TCP listener or Docker network',()=>{
 assert.match(source,/--network none/);
 assert.match(source,/postgres -c "listen_addresses="/);
 assert.doesNotMatch(source,/^\s*--publish\b/m);
 assert.doesNotMatch(source,/^\s*--privileged\b/m);
 assert.doesNotMatch(source,/^\s*-p\s+[0-9]/m);
});
test('V85 cannot mount project or existing BAZAR disk',()=>{
 for(const forbidden of ['supabase_db_bazar_online_4r_local_only',
  '/var/run/docker.sock','--mount type=bind','--volume','--volumes-from']){
  assert.ok(!source.includes(forbidden),forbidden);
 }
 // docker rm -v is permitted only for removing the disposable lab volume.
 assert.match(source,/docker rm -f -v "\$NAME"/);
 assert.doesNotMatch(source,/^\s*-v\s+[^\n]+/m);
});
test('V85 uses PostgreSQL 17 official boot image without SQL statements',()=>{
 assert.match(source,/IMAGE='postgres:17-bookworm'/);
 assert.match(source,/pg_isready -q -h \/var\/run\/postgresql/);
 assert.match(source,/postgres --version/);
 assert.doesNotMatch(source,/^\s*(?:psql|pg_restore|pg_dump|supabase)\b/m);
 assert.doesNotMatch(source,/docker exec "\$NAME" psql/);
});
test('data and socket directories are disposable tmpfs',()=>{
 assert.match(source,/--tmpfs '\/var\/lib\/postgresql\/data:rw,size=671088640'/);
 assert.match(source,/--tmpfs '\/var\/run\/postgresql:rw,size=33554432'/);
 assert.match(source,/--tmpfs '\/tmp:rw,size=33554432'/);
 assert.match(source,/--read-only/);
});
test('resource caps are finite and conservative',()=>{
 for(const x of ['--memory 1024m','--memory-swap 1024m','--cpus 1',
  '--pids-limit 128','--security-opt no-new-privileges'])
  assert.ok(source.includes(x),x);
});
test('V85 generates random transient password and does not log it',()=>{
 assert.match(source,/openssl rand -hex 32/);
 assert.match(source,/unset password/);
 assert.doesNotMatch(source,/echo.*\$password/);
 assert.doesNotMatch(source,/set -x/);
});
test('V85 has bounded startup and cleans up on both success and failure',()=>{
 assert.match(source,/trap cleanup EXIT/);
 assert.match(source,/trap 'exit 130' INT/);
 assert.match(source,/trap 'exit 143' TERM/);
 assert.match(source,/seq 1 75/);
 assert.match(source,/docker stop -t 5 "\$NAME"/);
 assert.match(source,/docker rm -f -v "\$NAME"/);
 assert.match(source,/V85 CLEANUP VERIFIED/);
});
test('V85 never overwrites an existing container with the same name',()=>{
 assert.match(source,/if docker container inspect "\$NAME"[^]*?V85 BLOCKED: name collision/);
});
test('V85 requires both no port binding and no TCP command',()=>{
 assert.match(source,/HostConfig\.PortBindings/);
 assert.match(source,/Config\.Cmd/);
 assert.match(source,/HostConfig\.NetworkMode/);
 assert.match(source,/Docker isolation policy mismatch/);
});
test('V85 refuses to claim any V67 operational pass or approval',()=>{
 assert.match(source,/V67=0\/32/);
 assert.match(source,/V78 permissions remain pending/);
 assert.match(source,/V85 DECISION: NO_GO/);
});
test('V85 cannot use production deployment or create services in user host',()=>{
 assert.doesNotMatch(source,/^\s*(?:kubectl|helm|systemctl|wsl|podman|npm publish|npx supabase)\b/m);
 assert.doesNotMatch(source,/docker compose/);
 assert.doesNotMatch(source,/docker service create/);
});
