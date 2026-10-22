'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequestBudget } = require('../server/request-budget-v66.cjs');
function req(address = '127.0.0.1', additions = {}) {
  return { socket: { remoteAddress: address }, rawHeaders: ['Authorization','Bearer PRIVATE'],
    headers: {'x-forwarded-for':'198.51.100.6'}, url: '/?token=private', ...additions };
}
function res() {
  return { destroyed: false, writableEnded:false, headersSent:false, writes:0,
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
    end(body) { this.writes++; this.body = body; this.writableEnded = true; } };
}
function make(opts = {}) {
  let t = 0, called = 0;
  const events=[];
  const guard=createRequestBudget({serve:async()=>{called++;return 200;},
    now:()=>t, observe: e=>events.push(e),...opts});
  return { guard,events, getCalled:()=>called, setTime:n=>{t=n;} };
}
function deferred() {let resolve, reject;const promise=new Promise((a,b)=>{resolve=a; reject=b;});return {promise,resolve,reject};}

test('requires explicit transport; rejects invalid bounded numeric policies', () => {
  assert.throws(()=>createRequestBudget(),TypeError);
  assert.throws(()=>createRequestBudget({serve:{}}),TypeError);
  const combinations=[{maxConcurrent:0},{maxConcurrent:513},{maxRequestsPerPeer:0},
    {maxRequestsPerPeer:10001},{windowMs:999},{windowMs:3600001},
    {maxPeers:0},{maxPeers:4097},{now:22},{observe:55},{maxPeers:2.5}];
  for (const x of combinations) assert.throws(()=>createRequestBudget({serve:async()=>200,...x}),TypeError);
});
test('factory construction never calls transport, emits event or creates socket', () => {
  let served=0, logged=0;
  const guard=createRequestBudget({serve:()=>{served++;return 200;},observe:()=>logged++});
  assert.equal(typeof guard,'function');assert.equal(served,0);assert.equal(logged,0);
});
test('first request passes through unchanged', async () => {
  const r=req(), o=res();let received;
  const guard=createRequestBudget({serve:async (a,b)=>{received=[a,b];return 200;}});
  assert.equal(await guard(r,o),200);assert.deepEqual(received,[r,o]);assert.equal(o.writes,0);
});
test('rate limit rejects same direct socket peer on next attempt', async () => {
  const f=make({maxRequestsPerPeer:2});
  assert.equal(await f.guard(req(),res()),200);assert.equal(await f.guard(req(),res()),200);
  const o=res();assert.equal(await f.guard(req(),o),429);
  assert.equal(f.getCalled(),2);
  assert.deepEqual(JSON.parse(o.body),{ok:false,code:'RATE_LIMITED',requestId:'unavailable'});
  assert.equal(o.headers['Cache-Control'],'no-store');assert.equal(o.headers.Connection,'close');
  assert.equal(o.headers['Retry-After'],'60');assert.equal(o.writes,1);
});
test('window reset enables a request at boundary without positive cache', async () => {
  const f=make({maxRequestsPerPeer:1,windowMs:1000});
  assert.equal(await f.guard(req(),res()),200);
  f.setTime(999);assert.equal(await f.guard(req(),res()),429);
  f.setTime(1000);assert.equal(await f.guard(req(),res()),200);
  assert.equal(f.getCalled(),2);
});
test('distinct direct peer addresses use independent budgets', async () => {
  const f=make({maxRequestsPerPeer:1});
  assert.equal(await f.guard(req('127.0.0.1'),res()),200);
  assert.equal(await f.guard(req('127.0.0.2'),res()),200);
  assert.equal(await f.guard(req('127.0.0.1'),res()),429);
});
test('forged X-Forwarded-For header never changes admission identity', async () => {
  const f=make({maxRequestsPerPeer:1});
  assert.equal(await f.guard(req('127.0.0.1'),res()),200);
  const r=req('127.0.0.1',{headers:{'x-forwarded-for':'203.0.113.253'}});
  assert.equal(await f.guard(r,res()),429);assert.equal(f.getCalled(),1);
});
test('invalid or missing address goes to shared unknown bucket', async () => {
  const f=make({maxRequestsPerPeer:1});
  assert.equal(await f.guard(req('fake-client-name'),res()),200);
  assert.equal(await f.guard(req(undefined,{socket:{}}),res()),429);
  assert.equal(f.getCalled(),1);
});
test('IPv6 peers are supported without forwarding headers', async () => {
  const f=make({maxRequestsPerPeer:1});
  assert.equal(await f.guard(req('::1'),res()),200);
  assert.equal(await f.guard(req('2001:db8::1'),res()),200);
  assert.equal(await f.guard(req('::1'),res()),429);
});
test('capacity refuses new peer when bounded table full', async () => {
  const f=make({maxPeers:1});
  assert.equal(await f.guard(req('127.0.0.1'),res()),200);
  const o=res();assert.equal(await f.guard(req('127.0.0.2'),o),503);
  assert.equal(JSON.parse(o.body).code,'RETRY_LATER');assert.equal(f.getCalled(),1);
});
test('stale peer can be pruned after window boundary', async () => {
  const f=make({maxPeers:1,windowMs:1000});
  assert.equal(await f.guard(req('127.0.0.1'),res()),200);
  f.setTime(1001);assert.equal(await f.guard(req('127.0.0.2'),res()),200);
});
test('in-flight peer cannot be pruned even if window has expired', async () => {
  const job=deferred();let t=0;
  const guard=createRequestBudget({serve:()=>job.promise,now:()=>t,maxPeers:1,windowMs:1000});
  const running=guard(req('127.0.0.1'),res());
  t=2000;
  assert.equal(await guard(req('127.0.0.2'),res()),503);
  job.resolve(200);assert.equal(await running,200);
  assert.equal(await guard(req('127.0.0.2'),res()),200);
});
test('global concurrency limit declines request before reaching transport', async () => {
  const job=deferred();let entered=0;
  const guard=createRequestBudget({serve:()=>{entered++;return job.promise;},maxConcurrent:1});
  const first=guard(req(),res());const o=res();
  assert.equal(await guard(req('127.0.0.2'),o),503);
  assert.equal(JSON.parse(o.body).code,'RETRY_LATER');assert.equal(entered,1);
  job.resolve(200);assert.equal(await first,200);
  assert.equal(await guard(req(),res()),200);assert.equal(entered,2);
});
test('global concurrency cap takes precedence over peer rate count', async () => {
  const job=deferred();let t=0, entries=0;
  const guard=createRequestBudget({serve:()=>{entries++;return entries===1?job.promise:200;},
    maxConcurrent:1,maxRequestsPerPeer:1,now:()=>t});
  const first=guard(req('127.0.0.1'),res());
  assert.equal(await guard(req('127.0.0.2'),res()),503);
  job.resolve(200);await first;
  assert.equal(await guard(req('127.0.0.2'),res()),200);
});
test('rate count consumed for rejected response from downstream transport', async () => {
  const f=make({maxRequestsPerPeer:1,serve:async()=>401});
  assert.equal(await f.guard(req(),res()),401);
  assert.equal(await f.guard(req(),res()),429);
});
test('serve exceptions become safe generic 503; release concurrency', async () => {
  let count=0;const guard=createRequestBudget({maxConcurrent:1,maxRequestsPerPeer:3,
    serve:async()=>{count++;if(count===1)throw Error('PRIVATE_TOKEN');return 200;}});
  const o=res();assert.equal(await guard(req(),o),503);
  assert.ok(!o.body.includes('PRIVATE_TOKEN'));
  assert.equal(await guard(req(),res()),200);
});
test('bad/throwing monotonic clock declines safely before transport', async () => {
  for (const now of [()=>NaN,()=>Infinity,()=>-4,()=>{throw Error('SECRET');}]) {
    const guard=createRequestBudget({serve:()=>{throw Error('must not run');},now});
    const o=res();assert.equal(await guard(req(),o),503);
    assert.equal(JSON.parse(o.body).code,'RETRY_LATER');
  }
});
test('logger receives only closed schema; secret values cannot leak', async () => {
  const events=[];
  const guard=createRequestBudget({maxRequestsPerPeer:1,observe:e=>events.push(e),serve:async()=>401});
  await guard(req(),res());await guard(req(),res());
  assert.ok(events.length>=3);
  for(const event of events){
    assert.deepEqual(Object.keys(event).sort(),['durationBucketMs','event','status']);
    assert.ok(Object.isFrozen(event));
    assert.ok(!JSON.stringify(event).includes('PRIVATE'));
    assert.ok(!JSON.stringify(event).includes('127.0.0.1'));
  }
});
test('logger exceptions cannot fail an authorized request or deny response', async () => {
  const guard=createRequestBudget({maxRequestsPerPeer:1,serve:async()=>200,
    observe:()=>{throw Error('logging offline');}});
  assert.equal(await guard(req(),res()),200);
  assert.equal(await guard(req(),res()),429);
});
test('no response double-write after client already finished', async () => {
  const guard=createRequestBudget({maxRequestsPerPeer:1,serve:async()=>200});
  await guard(req(),res());
  const o=res();o.writableEnded=true;
  assert.equal(await guard(req(),o),429);assert.equal(o.writes,0);
});
test('duration telemetry uses coarse safe buckets', async () => {
  let clock=0;const events=[];
  const guard=createRequestBudget({serve:async()=>{clock+=1200;return 204;},now:()=>clock,observe:e=>events.push(e)});
  assert.equal(await guard(req(),res()),204);
  const completed=events.find(e=>e.event==='completed');
  assert.equal(completed.durationBucketMs,1000);assert.equal(completed.status,204);
});
test('process-local counters do not affect separate guards', async () => {
  const a=make({maxRequestsPerPeer:1}),b=make({maxRequestsPerPeer:1});
  assert.equal(await a.guard(req(),res()),200);assert.equal(await a.guard(req(),res()),429);
  assert.equal(await b.guard(req(),res()),200);
});
test('socket getter that throws is treated as unknown without leaking', async () => {
  const x=req();Object.defineProperty(x,'socket',{get(){throw Error('INTERNAL_SECRET');}});
  const guard=createRequestBudget({serve:async()=>200,maxRequestsPerPeer:1});
  assert.equal(await guard(x,res()),200);
  assert.equal(await guard(x,res()),429);
});
