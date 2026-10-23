'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createOfflineHttpHarness } = require('../server/offline-http-harness-v68.cjs');
const { SYNTHETIC_CASES } = require('../server/offline-http-fixtures-v68.cjs');
const makeCase = (extra = {}) => ({id:'V68_SAMPLE',method:'GET',target:'/a',
  rawHeaders:['Authorization','Bearer dummy'],chunkSizes:[],expectedStatus:200,...extra});
function mockTransport(visit = () => {}) {
  return (req, res) => new Promise(resolve => {
    visit(req);
    const names = req.rawHeaders.filter((_,i)=>i%2===0).map(s=>s.toLowerCase());
    const headers = Object.fromEntries(req.rawHeaders.reduce((pairs, val, i, all)=>{
      if(i%2===0)pairs.push([val.toLowerCase(),all[i+1]]);
      return pairs;
    }, []));
    let status = 200;
    const end = () => {if(!res.writableEnded){res.writeHead(status,{});res.end('{}');}resolve();};
    if (new Set(names).size !== names.length || headers['transfer-encoding'] || headers['content-length'] && headers['content-length'] !== '0') status = 400;
    else if (!headers.authorization) status = 401;
    else if (headers.authorization !== 'Bearer synthetic-v68') status = 401;
    else if (req.method !== 'GET') status = 405;
    else if (req.url.includes('?') || req.url.includes('cccccccc-cccc-4ccc-8ccc-cccccccccccc')) status = 404;
    req.on('data', chunk => { if(chunk.length > 4096) status=413;
      else if(chunk.length && status === 200)status=400; });
    req.once('end', end);
  });
}
test('requires an explicitly injected onRequest handler', () => {
  assert.throws(()=>createOfflineHttpHarness(),TypeError);
  assert.throws(()=>createOfflineHttpHarness({onRequest:1}),TypeError);
});
test('factory creates only test functions and has no socket listener', () => {
  const result=createOfflineHttpHarness({onRequest:mockTransport()});
  assert.deepEqual(Object.keys(result),['runCase','runSuite']);
  assert.ok(Object.isFrozen(result));
  assert.equal('listen' in result,false);
});
test('all 15 curated synthetic fixtures pass against a deterministic mock transport', async()=>{
  const harness=createOfflineHttpHarness({onRequest:mockTransport()});
  const result=await harness.runSuite(SYNTHETIC_CASES);
  assert.equal(result.total,15);assert.equal(result.passed,15);assert.equal(result.failed,0);
  assert.equal(result.evidenceClass,'SYNTHETIC_NODE_EVENTS');
  assert.equal(result.realHttp,false);assert.equal(result.realParser,false);
  assert.equal(result.realAuth,false);assert.equal(result.realDatabase,false);
  assert.equal(result.recoveryVerified,false);assert.equal(result.decision,'NO_GO');
  assert.equal(result.v67OperationalCasesPassed,0);
});
test('fixture ids are unique and bodies use bounded count-only representation',()=>{
  assert.equal(new Set(SYNTHETIC_CASES.map(x=>x.id)).size,15);
  assert.ok(SYNTHETIC_CASES.every(x=>Object.isFrozen(x)&&Object.isFrozen(x.rawHeaders)&&Object.isFrozen(x.chunkSizes)));
  assert.ok(SYNTHETIC_CASES.every(x=>x.chunkSizes.length <= 4 && x.chunkSizes.every(Number.isSafeInteger)));
});
test('simulated response status is recorded without its payload or headers', async()=>{
  const h=createOfflineHttpHarness({onRequest:async(req,res)=>{res.writeHead(200,{Authorization:'SECRETCODE'});res.end('MY_SECRET_PAYLOAD');}});
  const result=await h.runCase(makeCase());
  assert.deepEqual(result,{id:'V68_SAMPLE',expectedStatus:200,observedStatus:200,matched:true,evidenceClass:'SYNTHETIC_NODE_EVENTS',realHttp:false});
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('mismatch does not become PASS or deployment authorization', async()=>{
  const h=createOfflineHttpHarness({onRequest:async(req,res)=>{res.writeHead(403,{});res.end('');}});
  const result=await h.runSuite([makeCase()]);
  assert.equal(result.passed,0);assert.equal(result.failed,1);assert.equal(result.decision,'NO_GO');
  assert.equal(result.results[0].observedStatus,403);assert.equal(result.results[0].matched,false);
});
test('request event stream transfers Buffer lengths without forwarding synthetic headers in result',async()=>{
  let captured;
  const h=createOfflineHttpHarness({onRequest:mockTransport(req=>{captured=req;})});
  const result=await h.runCase(makeCase({rawHeaders:['Authorization','Bearer synthetic-v68'],chunkSizes:[0,1],expectedStatus:400}));
  assert.equal(result.observedStatus,400);
  assert.equal(captured.readableEnded,true);assert.equal(captured.complete,true);
  assert.deepEqual(captured.rawHeaders,['Authorization','Bearer synthetic-v68']);
  assert.ok(!JSON.stringify(result).includes('dummy'));
});
test('peer simulation uses two fixed synthetic loopback addresses',async()=>{
  const peers=[];
  const h=createOfflineHttpHarness({onRequest:mockTransport(req=>peers.push(req.socket.remoteAddress))});
  await h.runSuite([makeCase({id:'V68_PEER_A',expectedStatus:401}),
    makeCase({id:'V68_PEER_B',peer:'loopback-b',expectedStatus:401})]);
  assert.deepEqual(peers,['127.0.0.1','127.0.0.2']);
});
test('caller cannot inject arbitrary IP/peer or source request objects', async()=>{
  const h=createOfflineHttpHarness({onRequest:mockTransport()});
  for(const peer of ['8.8.8.8','evil',{},'127.0.0.1']) {
    await assert.rejects(h.runCase(makeCase({peer})),TypeError);
  }
});
test('unknown keys including privileged fields are forbidden',async()=>{
  const h=createOfflineHttpHarness({onRequest:mockTransport()});
  for(const extra of [{headers:{Authorization:'secret'}},{role:'SUPERADMIN'},
    {actor:'attacker'},{authorization:'Bearer secret'},{secret:'secret'}]){
    await assert.rejects(h.runCase(makeCase(extra)),TypeError);
  }
});
test('missing and badly typed status, method, target or headers fail early',async()=>{
  const h=createOfflineHttpHarness({onRequest:mockTransport()});
  for(const extra of [{expectedStatus:null},{expectedStatus:0},{expectedStatus:999},
    {method:'get'},{method:'TRACE'},{method:{}},{target:null},{target:'x'.repeat(513)},
    {rawHeaders:undefined},{rawHeaders:['A']},{rawHeaders:[42,'x']},{rawHeaders:Array(66).fill('x')},
    {chunkSizes:null},{chunkSizes:[-1]},{chunkSizes:['x']},{chunkSizes:[9000]}]) {
    await assert.rejects(h.runCase(makeCase(extra)),TypeError);
  }
});
test('IDs must be safe, short and uppercase',async()=>{
  const h=createOfflineHttpHarness({onRequest:mockTransport()});
  for(const id of ['', '../BAD','v68_lower','A','A'.repeat(65),'HTTP 01',null,22]){
    await assert.rejects(h.runCase(makeCase({id})),TypeError);
  }
});
test('suite rejects duplicate IDs before any handler invocation',async()=>{
  let called=0;const h=createOfflineHttpHarness({onRequest:()=>{called++;}});
  await assert.rejects(h.runSuite([makeCase(),makeCase()]),/Duplicate/);
  assert.equal(called,0);
});
test('suite validates ALL items before running any item',async()=>{
  let called=0;const h=createOfflineHttpHarness({onRequest:()=>{called++;}});
  await assert.rejects(h.runSuite([makeCase(),makeCase({id:'BAD',method:'TRACE'})]),TypeError);
  assert.equal(called,0);
});
test('suite size cap prevents unbounded memory pressure',async()=>{
  const h=createOfflineHttpHarness({onRequest:mockTransport()});
  await assert.rejects(h.runSuite(Array.from({length:65},(_,i)=>makeCase({id:'CASE_'+String(i).padStart(2,'0')}))),TypeError);
});
test('non-array and invalid suites are rejected',async()=>{
  const h=createOfflineHttpHarness({onRequest:mockTransport()});
  for(const x of [undefined,null,{},42,'test'])await assert.rejects(h.runSuite(x),TypeError);
});
test('handler exceptions never leak errors; result is a mismatched synthetic case',async()=>{
  const h=createOfflineHttpHarness({onRequest:()=>{throw new Error('SECRET_DB_PASSWORD');}});
  const result=await h.runCase(makeCase());
  assert.equal(result.matched,false);assert.equal(result.observedStatus,null);
  assert.ok(!JSON.stringify(result).includes('SECRET_DB_PASSWORD'));
});
test('async handler rejections are sanitized too',async()=>{
  const h=createOfflineHttpHarness({onRequest:async()=>{throw new Error('PRIVATE_JWT');}});
  const result=await h.runCase(makeCase());
  assert.equal(result.matched,false);assert.equal(result.observedStatus,null);
});
test('response without end is never counted as pass',async()=>{
  const h=createOfflineHttpHarness({onRequest:async(req,res)=>res.writeHead(200,{})});
  const result=await h.runCase(makeCase());
  assert.equal(result.observedStatus,200);assert.equal(result.matched,false);
});
test('response written twice is never counted as pass',async()=>{
  const h=createOfflineHttpHarness({onRequest:async(req,res)=>{res.writeHead(200,{});res.end('');res.end('');}});
  const result=await h.runCase(makeCase());
  assert.equal(result.observedStatus,200);assert.equal(result.matched,false);
});
test('result arrays and records are immutable and cannot affect subsequent runs',async()=>{
  const h=createOfflineHttpHarness({onRequest:mockTransport()});
  const a=await h.runSuite([makeCase({expectedStatus:401})]);
  assert.ok(Object.isFrozen(a)&&Object.isFrozen(a.results)&&Object.isFrozen(a.results[0]));
  assert.throws(()=>a.results.push('evil'),TypeError);
  const b=await h.runSuite([makeCase({expectedStatus:401})]);
  assert.equal(b.total,1);
});
test('empty suite is not an authorized release or real-world evidence',async()=>{
  const h=createOfflineHttpHarness({onRequest:mockTransport()});
  const r=await h.runSuite([]);
  assert.equal(r.total,0);assert.equal(r.passed,0);assert.equal(r.decision,'NO_GO');
  assert.equal(r.v67OperationalCasesPassed,0);
});
test('fixture collection contains no real client data, domains or production tokens',()=>{
  const source=JSON.stringify(SYNTHETIC_CASES);
  assert.ok(!source.includes('service_role'));
  assert.ok(!source.includes('sk_live_'));
  assert.ok(!source.includes('DATABASE_URL'));
  assert.ok(!source.includes('marco.garcia@'));
});

test('hanging handler is bounded and marked mismatch without claiming cancellation', async()=>{
  const h=createOfflineHttpHarness({onRequest:()=>new Promise(()=>{}),deadlineMs:10});
  const r=await h.runCase(makeCase());
  assert.equal(r.observedStatus,null);assert.equal(r.matched,false);assert.equal(r.realHttp,false);
});
test('deadlines must be explicitly bounded to laboratory range',()=>{
  for(const deadlineMs of [0,9,5001,NaN,'1000',null]){
    assert.throws(()=>createOfflineHttpHarness({onRequest:()=>{},deadlineMs}),TypeError);
  }
});
