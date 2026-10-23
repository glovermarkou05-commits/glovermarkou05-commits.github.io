'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { existsSync } = require('node:fs');
const GUARD = resolve(__dirname, '../server/native-network-guard-v70.cjs');
const { createPlan, REGRESSION_SUITES } = require('../scripts/run-v70-native-regressions.cjs');
function native(code, guarded = true) {
  return spawnSync(process.execPath, [...(guarded ? ['--require',GUARD] : []), '-e', code],
    {encoding:'utf8', timeout:3000, shell:false});
}
test('V70 guard is a native Node preloader, not a listener', () => {
  const p=native(`console.log(require(${JSON.stringify(GUARD)}).active)`);
  assert.equal(p.status,0);
  assert.equal(p.stdout.trim(),'true');
  assert.ok(!p.stderr.includes('listen'));
});
test('net.Server.listen is refused before any port binds',()=>{
  const r=native('require("node:net").createServer().listen(0)');
  assert.notEqual(r.status,0); assert.match(r.stderr,/V70 isolated Node tests/);
});
test('net.Socket.connect is refused before network access',()=>{
  const r=native('require("node:net").connect(12345,"127.0.0.1")');
  assert.notEqual(r.status,0); assert.match(r.stderr,/V70 isolated Node tests/);
});
test('HTTP client requests are refused without dialing',()=>{
  const r=native('require("node:http").get("http://127.0.0.1")');
  assert.notEqual(r.status,0);assert.match(r.stderr,/V70 isolated Node tests/);
});
test('UDP socket creation is refused',()=>{
  const r=native('require("node:dgram").createSocket("udp4")');
  assert.notEqual(r.status,0);assert.match(r.stderr,/V70 isolated Node tests/);
});
test('TLS connect is refused',()=>{
  const r=native('require("node:tls").connect(443,"example.org")');
  assert.notEqual(r.status,0);assert.match(r.stderr,/V70 isolated Node tests/);
});
test('http2.connect is refused',()=>{
  const r=native('require("node:http2").connect("https://example.org")');
  assert.notEqual(r.status,0);assert.match(r.stderr,/V70 isolated Node tests/);
});
test('constructing an unbound HTTP server is still supported',()=>{
  const r=native('const h=require("node:http").createServer();console.log(h.listening)');
  assert.equal(r.status,0);assert.equal(r.stdout.trim(),'false');
});
test('reloading guard does not bypass or duplicate policy',()=>{
  const code=`const a=require(${JSON.stringify(GUARD)}); const b=require(${JSON.stringify(GUARD)}); console.log(a===b, a.code)`;
  const q=native(code);
  assert.equal(q.status,0);assert.equal(q.stdout.trim(),'true V70_NETWORK_FORBIDDEN');
});
test('runner references canonical known regression suite names',()=>{
  assert.equal(REGRESSION_SUITES.length,7);
  assert.ok(REGRESSION_SUITES.every(x=>/^tests\/[a-z0-9-]+\.test\.cjs$/.test(x)));
});
test('runner plan discloses missing files but grants no publication',()=>{
  const plan=createPlan();
  assert.equal(plan.readiness,'NO_GO');
  assert.equal(plan.networkAuthorized,false);assert.equal(plan.databaseAuthorized,false);
  assert.equal(plan.deploymentAuthorized,false);
  assert.deepEqual(plan.args.slice(0,3),['--require',GUARD,'--test']);
  assert.ok(plan.missing.every(x=>!existsSync(x)));
});
test('runner refuses caller-selected project roots',()=>{
  assert.throws(()=>createPlan({root:'/tmp/another-repository'}),TypeError);
});
test('CLI refuses accidental execution with no explicit flag',()=>{
  const r=spawnSync(process.execPath,[resolve(__dirname,'../scripts/run-v70-native-regressions.cjs')],
    {encoding:'utf8',timeout:2000});
  assert.equal(r.status,2);assert.match(r.stderr,/Usage:/);
});
test('CLI check blocks a missing checkout instead of declaring PASS',()=>{
  const r=spawnSync(process.execPath,[resolve(__dirname,'../scripts/run-v70-native-regressions.cjs'),'--check'],
    {encoding:'utf8',timeout:2000});
  assert.equal(r.status,2);
  const report=JSON.parse(r.stdout);
  assert.equal(report.missingSuites,7);assert.equal(report.readiness,'NO_GO');
});
