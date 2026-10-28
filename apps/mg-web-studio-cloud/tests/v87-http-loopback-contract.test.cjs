'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const file=path.join(__dirname,'../scripts/run-v87-real-http-loopback.cjs');
const src=fs.readFileSync(file,'utf8');
const {approvedContext}=require('../scripts/run-v87-real-http-loopback.cjs');
const authorized=()=>({
 GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',
 RUNNER_OS:'Linux',
 GITHUB_REPOSITORY:'glovermarkou05-commits/glovermarkou05-commits.github.io',
 GITHUB_REF:'refs/heads/feature/mg-digital-v5-web-services',
 MG_V87_SCOPE:'MG_V87_LOOPBACK_ONLY'
});
test('V87 real runner has valid Node syntax',()=>{
 const r=cp.spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);
});
test('V87 fails closed on local/off-scope invocation before binding',()=>{
 const r=cp.spawnSync(process.execPath,[file],{
  encoding:'utf8',timeout:2500,env:{PATH:process.env.PATH}});
 assert.equal(r.status,2,r.stderr);
 assert.match(r.stderr,/V87 BLOCKED/);
 assert.doesNotMatch(r.stdout,/SERVER:/);
});
test('V87 requires exact repo, branch, GitHub-hosted Linux, explicit authorization',()=>{
 assert.equal(approvedContext(authorized()),true);
 for(const [key,value] of Object.entries(authorized())){
  const context=authorized();
  context[key]=value+'wrong';
  assert.equal(approvedContext(context),false,key);
 }
});
test('V87 does not accept arbitrary tokens, hostnames, runner or port',()=>{
 assert.match(src,/HOST='127.0.0.1'/);
 assert.match(src,/port:0,exclusive:true/);
 assert.match(src,/address\.address===HOST/);
 assert.match(src,/address\.family==='IPv4'/);
 assert.match(src,/syntheticV87Only/);
 assert.doesNotMatch(src,/process\.env\.(?:PORT|HOST|DATABASE_URL|SUPABASE_URL)/);
});
test('V87 integrates original V63 V64 V65 V66 V69 code, not a mock server',()=>{
 assert.match(src,/assembleUnboundTenantHttpV69/);
 assert.match(src,/createServer\(stack\.serverOptions,stack\.onRequest\)/);
 assert.match(src,/stack\.configureUnboundServer\(server\)/);
 assert.match(src,/server\.headersTimeout===5000/);
 assert.match(src,/server\.maxRequestsPerSocket===1/);
});
test('V87 test input is synthetic and query stub never invokes database',()=>{
 assert.match(src,/verifyAccessToken:fixture\.verifyAccessToken/);
 assert.match(src,/query:fixture\.query/);
 assert.match(src,/FROM public\.mg_organizations/);
 assert.match(src,/synthetic in-memory only/);
 assert.doesNotMatch(src,/\b(?:pg\.Client|Pool|postgresql:\/\/|pg_restore|docker run|supabase-js)\b/);
});
test('V87 has fixed bounded socket response sizes and deadlines',()=>{
 assert.match(src,/MAX_BYTES=24\*1024/);
 assert.match(src,/EXIT_TIMEOUT=25000/);
 assert.match(src,/socket\.setTimeout\(timeoutMs/);
 assert.match(src,/server\.close\(resolve\)/);
 assert.match(src,/timeoutMs:8000/);
});
test('V87 covers HTTP-01 to HTTP-14 with explicit partial proxy case',()=>{
 const ids=[...src.matchAll(/await check\('(HTTP-[^']+)'/g)].map(x=>x[1]);
 assert.equal(ids.length,21);
 for(let i=1;i<=14;i++){
  const prefix='HTTP-'+String(i).padStart(2,'0');
  assert.ok(ids.some(x=>x===prefix||x.startsWith(prefix+'-')),prefix);
 }
 assert.ok(ids.includes('HTTP-14-PARTIAL'));
 assert.match(src,/no actual trusted reverse-proxy validation/);
});
test('V87 avoids load tests, restore and real authentication',()=>{
 assert.doesNotMatch(src,/^\s*(?:pg_dump|pg_restore|psql|curl https:|docker compose|wrk|ab|hey)\b/m);
 assert.match(src,/realAuth:false,realDatabase:false/);
 assert.match(src,/loadTests:false/);
 assert.match(src,/formalV67Verified:0/);
});
test('V87 never stores real request packets or identity in reported results',()=>{
 assert.match(src,/results\.push\(\{id,observedStatus:r\.status/);
 assert.match(src,/!r\.body\.includes\(AUTH\)/);
 assert.match(src,/!r\.body\.includes\(ACTOR\)/);
 assert.match(src,/!r\.body\.includes\('node:internal'\)/);
});
