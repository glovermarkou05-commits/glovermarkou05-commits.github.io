'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const script=path.join(__dirname,'../scripts/run-v89-bounded-loopback-load.cjs');
const source=readFileSync(script,'utf8');
const {approvedContext}=require('../scripts/run-v89-bounded-loopback-load.cjs');
const expected=()=>({
 GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',
 GITHUB_REPOSITORY:'glovermarkou05-commits/glovermarkou05-commits.github.io',
 GITHUB_REF:'refs/heads/feature/mg-digital-v5-web-services',
 MG_V89_SCOPE:'MG_V89_SMALL_LOOPBACK_LOAD'
});
test('V89 script Node syntax parses, without listener',()=>{
 const r=spawnSync(process.execPath,['--check',script],{encoding:'utf8',timeout:3000});
 assert.equal(r.status,0,r.stderr);
});
test('V89 refuses to run locally or outside exact GitHub runner context',()=>{
 const r=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:3000,
  env:{PATH:process.env.PATH,HOME:process.env.HOME}});
 assert.equal(r.status,2,r.stderr);
 assert.match(r.stderr,/V89 BLOCKED/);
 assert.doesNotMatch(r.stdout,/V89 RESULT/);
});
test('V89 validates explicit scope AND repository AND branch AND GitHub-hosted runner',()=>{
 assert.equal(approvedContext(expected()),true);
 for(const key of Object.keys(expected())){
  const altered=expected();
  altered[key]='INVALID';
  assert.equal(approvedContext(altered),false,key);
 }
});
test('bind only IPv4 loopback on unpredictable ephemeral port',()=>{
 assert.match(source,/HOST='127\.0\.0\.1'/);
 assert.match(source,/server\.listen\(\{host:HOST,port:0,exclusive:true\}/);
 assert.match(source,/address===HOST&&adr\.family==='IPv4'/);
 assert.doesNotMatch(source,/listen\(\s*[0-9]{3,5}/);
});
test('uses actual V63 V64 V65 V66 code and one HTTP server',()=>{
 for(const module of ['http-site-gate-v63.cjs','node-http-transport-v64.cjs',
  'http-server-blueprint-v65.cjs','request-budget-v66.cjs'])
  assert.ok(source.includes(module),module);
 assert.match(source,/http\.createServer\(blueprint\.options,blueprint\.onRequest\)/);
 assert.match(source,/createRequestBudget/);
 assert.match(source,/blueprint\.configure\(server\)/);
});
test('hard limits of four sockets, two in flight, small peer budgets',()=>{
 for(const line of ['MAX_SOCKETS=4','server.maxConnections=MAX_SOCKETS',
   'maxConcurrent:2','maxRequestsPerPeer:6','maxRequestsPerPeer:3',
   'MAX_RESPONSE_BYTES=2048'])
  assert.ok(source.includes(line),line);
});
test('each outbound request has explicit 127.0.0.1 host and no user-supplied target',()=>{
 assert.match(source,/http\.request\(\{host:HOST,port,path:TARGET,method:'GET'/);
 assert.match(source,/TARGET='\/api\/v1\/organizations\/'/);
 assert.doesNotMatch(source,/https\.request|fetch\(|axios\(|new URL\(process\.env/);
 assert.doesNotMatch(source,/process\.env\.(?:URL|HOST|PORT|TARGET|TOKEN)/);
});
test('only synthetic token and invented UUIDs are used',()=>{
 assert.match(source,/AUTH='Bearer synthetic-v89-only'/);
 assert.match(source,/ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'/);
 assert.match(source,/USER='cccccccc-cccc-4ccc-8ccc-cccccccccccc'/);
 assert.doesNotMatch(source,/postgres|psql|supabase|docker run|pg_restore/i);
});
test('LOAD-01 tests 503 when busy and explicit recovery after release',()=>{
 assert.match(source,/id:'LOAD-01'/);
 assert.match(source,/over\.status===503/);
 assert.match(source,/LOAD01_INFLIGHT_CAP/);
 assert.match(source,/recovery\.status===200/);
 assert.match(source,/LOAD01_RECOVERY_AFTER_RELEASE/);
});
test('LOAD-02 tests repeated request budget 429, Retry-After, and reset',()=>{
 assert.match(source,/maxRequestsPerPeer:3,windowMs:1000/);
 assert.match(source,/blocked\.status===429/);
 assert.match(source,/blocked\.retryAfter==='1'/);
 assert.match(source,/await wait\(1100\)/);
 assert.match(source,/LOAD02_WINDOW_RECOVERY/);
});
test('LOAD-02 uses spoofed forwarding headers to check no bypass',()=>{
 assert.match(source,/'X-Forwarded-For':forwarded/);
 assert.match(source,/LOAD02_HEADER_CANNOT_BYPASS/);
 assert.match(source,/spoofedForwardingNoBypass:true/);
});
test('LOAD-03 tests socket peak and low-volume memory sample only',()=>{
 assert.match(source,/h\.peakSockets<=MAX_SOCKETS/);
 assert.match(source,/rssPeak-rssStart<64\*1024\*1024/);
 assert.match(source,/h\.sockets\.size===0/);
 assert.match(source,/load03FullCapacityCertification:false/);
 assert.match(source,/single short sample; no database jobs/);
});
test('V89 has bounded deadlines, no unbounded generator or flood',()=>{
 assert.match(source,/SCRIPT_DEADLINE_MS=19000/);
 assert.match(source,/req\.setTimeout\(3000/);
 assert.match(source,/wait\(1200\)/);
 assert.match(source,/for\(let i=0;i<3;i\+\+\)/);
 assert.match(source,/probeCount:12/);
 assert.doesNotMatch(source,/while\s*\(\s*true\s*\)/);
});
test('V89 tear-down closes all sockets and verifies server stopped',()=>{
 assert.match(source,/server\.closeAllConnections\(\)/);
 assert.match(source,/server\.close\(resolve\)/);
 assert.match(source,/server\.address\(\)===null/);
 assert.match(source,/finally\s*\{[\s\S]*?await h\.stop\(\)/);
});
test('V89 never counts these small samples as independent V67 approvals',()=>{
 assert.match(source,/formalV67Verified:0/);
 assert.match(source,/formalV67Pending:32/);
 assert.match(source,/decision:'NO_GO'/);
 assert.match(source,/externalNetwork:false/);
 assert.match(source,/realDatabase:false/);
});
test('bounded observations and public error schema avoid leak of request data',()=>{
 assert.match(source,/ensure\(Object\.keys\(parsed\)\.length===3,'PUBLIC_FIELDS'\)/);
 assert.match(source,/!body\.includes\(AUTH\)/);
 assert.match(source,/V89_UNCLASSIFIED_FAILURE/);
 assert.match(source,/only 127\.0\.0\.1/);
});
