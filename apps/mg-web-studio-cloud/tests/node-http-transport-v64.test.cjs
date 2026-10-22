'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createNodeHttpTransport } = require('../server/node-http-transport-v64.cjs');
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET = `/api/v1/organizations/${ORG}/sites/${SITE}/access`;
function input(changes={}) {
  const req = Object.assign(new EventEmitter(), { method:'GET', url:TARGET,
    rawHeaders:['Authorization','Bearer testing'], rawTrailers:[], complete:false,
    readableEnded:false }, changes);
  return req;
}
function output() {
  return { destroyed:false, writableEnded:false, shouldKeepAlive:true, headers:null,
    status:null, body:null, writes:0, writeHead(code,headers) { this.status=code; this.headers=headers; },
    end(body) { this.writes++; this.body=body; this.writableEnded=true; } };
}
function grant() { return {status:200,headers:{'Content-Type':'application/json'},
  body:JSON.stringify({ok:true,access:'granted',requestId:'v63-id'})}; }
function denial(status,code) { return {status,headers:{},body:JSON.stringify({ok:false,code,requestId:'v63-id'})}; }
function run(transport, req, res=output()) {
  const done=transport(req,res);
  return {req,res,done,finish(){req.complete=true; req.readableEnded=true; req.emit('end');return done;}};
}
function setup(gate=async ()=>grant(), options={}) {
  const seen=[];
  const transport=createNodeHttpTransport({gate:async envelope=>{seen.push(envelope);return gate(envelope);},
    makeRequestId:()=> 'v64-id',...options});
  return {transport,seen};
}
const json=res=>JSON.parse(res.body);

test('requires gate, generator and bounded settings; no implicit server',()=>{
  assert.throws(()=>createNodeHttpTransport(),TypeError);
  assert.throws(()=>createNodeHttpTransport({gate:22}),TypeError);
  for(const opts of [{deadlineMs:0},{deadlineMs:30001},{maxBodyBytes:0},
    {maxBodyBytes:9000},{deadlineMs:1.5},{makeRequestId:null}]) {
    assert.throws(()=>createNodeHttpTransport({gate:async()=>grant(),...opts}),TypeError);
  }
});
test('construction never starts server, socket or calls gate',()=>{
  let n=0;const t=createNodeHttpTransport({gate:()=>{n++;return grant();}});
  assert.equal(typeof t,'function');assert.equal(n,0);
});
test('complete GET with raw Authorization enters V63 gate and emits sanitized response',async()=>{
  const f=setup();const p=run(f.transport,input());assert.equal(await p.finish(),200);
  assert.equal(p.res.status,200);assert.deepEqual(json(p.res),{ok:true,access:'granted',requestId:'v63-id'});
  assert.equal(p.res.shouldKeepAlive,false);assert.equal(p.res.headers.Connection,'close');
  assert.equal(p.res.headers['Cache-Control'],'no-store');
  assert.equal(f.seen.length,1);assert.deepEqual(f.seen[0].rawHeaders,['Authorization','Bearer testing']);
  assert.ok(Object.isFrozen(f.seen[0])&&Object.isFrozen(f.seen[0].rawHeaders));
  assert.equal(f.seen[0].bodyBytes.length,0);
});
test('V63 denial is preserved with bounded safe headers',async()=>{
  const f=setup(async()=>denial(404,'RESOURCE_UNAVAILABLE'));
  const p=run(f.transport,input());assert.equal(await p.finish(),404);
  assert.equal(json(p.res).code,'RESOURCE_UNAVAILABLE');
});
test('no complete header source cannot fall back to normalized headers',async()=>{
  const f=setup();const req=input({rawHeaders:undefined,headers:{authorization:'Bearer testing'}});
  const p=run(f.transport,req);assert.equal(await p.done,400);assert.equal(f.seen.length,0);
});
test('duplicate Authorization case variants are rejected before any body reads',async()=>{
  const f=setup();const req=input({rawHeaders:['Authorization','Bearer first','authorization','Bearer second']});
  const p=run(f.transport,req);assert.equal(await p.done,400);assert.equal(f.seen.length,0);
  assert.equal(req.listenerCount('data'),0);
});
test('duplicated Content-Length is denied before gate',async()=>{
  const f=setup();const p=run(f.transport,input({rawHeaders:['Content-Length','0','content-length','0']}));
  assert.equal(await p.done,400);assert.equal(f.seen.length,0);
});
test('forbidden framing and upgraded connection are rejected',async()=>{
  for(const name of ['Transfer-Encoding','Cookie','Expect','Proxy-Authorization','Trailer','Upgrade']){
    const f=setup();const p=run(f.transport,input({rawHeaders:['Authorization','Bearer x',name,'value']}));
    assert.equal(await p.done,400);assert.equal(f.seen.length,0);
  }
});
test('malformed raw headers, control chars, odd length denied',async()=>{
  for(const rawHeaders of [[], ['Authorization'], ['Auth orization','x'],
    ['Authorization','Bearer hi\r\nInjected'], ['Authorization','\0'],null,{}]){
    const f=setup();const p=run(f.transport,input({rawHeaders}));
    if(Array.isArray(rawHeaders)&&rawHeaders.length===0){p.finish();assert.equal(await p.done,200);}
    else{assert.equal(await p.done,400);assert.equal(f.seen.length,0);}
  }
});
test('aggregate raw headers >16KiB rejected as 431',async()=>{
  const f=setup();const p=run(f.transport,input({rawHeaders:['Authorization','Bearer x','X-1','x'.repeat(8192),'X-2','x'.repeat(8192)]}));
  assert.equal(await p.done,431);assert.equal(f.seen.length,0);
});
test('excess header entries rejected without invoking gate',async()=>{
  const f=setup();const raw=[];for(let i=0;i<34;i++)raw.push('X-'+i,'value');
  const p=run(f.transport,input({rawHeaders:raw}));assert.equal(await p.done,400);assert.equal(f.seen.length,0);
});
test('nonzero declared Content-Length is denied before stream consumption',async()=>{
  const f=setup();const p=run(f.transport,input({rawHeaders:['Content-Length','1']}));
  assert.equal(await p.done,400);assert.equal(f.seen.length,0);
});
test('a nonempty small body is rejected immediately with no buffer aggregation',async()=>{
  const f=setup();const p=run(f.transport,input());p.req.emit('data',Buffer.from('x'));
  assert.equal(await p.done,400);assert.equal(f.seen.length,0);assert.equal(p.res.writes,1);
});
test('oversized single body chunk rejected 413 without allocating a second buffer',async()=>{
  const f=setup();const p=run(f.transport,input());p.req.emit('data',Buffer.alloc(5000));
  assert.equal(await p.done,413);assert.equal(f.seen.length,0);assert.equal(json(p.res).code,'BODY_TOO_LARGE');
});
test('non-Buffer chunks rejected without reading arbitrary objects',async()=>{
  const f=setup();const p=run(f.transport,input());p.req.emit('data','secret');
  assert.equal(await p.done,400);assert.equal(f.seen.length,0);
});
test('time limit rejects silent incomplete request without calling gate',async()=>{
  const f=setup(undefined,{deadlineMs:25});const p=run(f.transport,input());
  assert.equal(await p.done,408);assert.equal(json(p.res).code,'REQUEST_TIMEOUT');
  assert.equal(f.seen.length,0);
});
test('timeout of slow gate fails 503, ignores a late successful result',async()=>{
  let finishGate;
  const f=setup(()=>new Promise(resolve=>{finishGate=resolve;}),{deadlineMs:25});
  const p=run(f.transport,input());p.finish();
  assert.equal(await p.done,503);const before=p.res.writes;
  finishGate(grant());await new Promise(resolve=>setImmediate(resolve));
  assert.equal(p.res.writes,before);assert.equal(json(p.res).code,'RETRY_LATER');
});
test('rejected gate promise becomes generic 503 without leaking error messages',async()=>{
  const f=setup(async()=>{throw Error('PRIVATE_DB_PASSWORD');});
  const p=run(f.transport,input());assert.equal(await p.finish(),503);
  assert.ok(!p.res.body.includes('PRIVATE_DB_PASSWORD'));
});
test('incomplete stream end cannot authorize request',async()=>{
  const f=setup();const p=run(f.transport,input());p.req.emit('end');
  assert.equal(await p.done,400);assert.equal(f.seen.length,0);
});
test('trailers are denied even when request is complete',async()=>{
  const f=setup();const p=run(f.transport,input({rawTrailers:['X-Injection','test']}));
  assert.equal(await p.finish(),400);assert.equal(f.seen.length,0);
});
test('disconnect before end never attempts to write to lost client',async()=>{
  const f=setup();const p=run(f.transport,input());p.req.emit('close');
  assert.equal(await p.done,null);assert.equal(p.res.writes,0);assert.equal(f.seen.length,0);
});
test('request error is sanitized; detached listeners cannot write again',async()=>{
  const f=setup();const p=run(f.transport,input());p.req.emit('error',new Error('SQL_SECRET'));
  assert.equal(await p.done,400);assert.equal(p.res.writes,1);
  p.req.emit('data',Buffer.from('bad'));assert.equal(p.res.writes,1);
});
test('unknown gate status, malformed response or private extra JSON return generic 500',async()=>{
  for(const response of [null,{}, {status:202,body:'{}',headers:{}},
    {status:200,body:'not json',headers:{}},
    {status:200,body:JSON.stringify({ok:true,access:'granted',requestId:'v63-id',password:'secret'}),headers:{}},
    {status:401,body:JSON.stringify({ok:false,code:'PRIVATE',requestId:'v63-id'}),headers:{}}]){
    const f=setup(async()=>response);const p=run(f.transport,input());
    assert.equal(await p.finish(),500);assert.equal(json(p.res).code,'INTERNAL_ERROR');
  }
});
test('nonresponsive or malformed request yields a generic rejection not a thrown exception',async()=>{
  const f=setup();const p=run(f.transport,{});
  assert.equal(await p.done,400);assert.equal(f.seen.length,0);
});
test('requests are isolated and do not leak results between clients',async()=>{
  const f=setup(async()=>grant());const a=run(f.transport,input()), b=run(f.transport,input());
  assert.deepEqual(await Promise.all([a.finish(),b.finish()]),[200,200]);
  assert.equal(f.seen.length,2);assert.equal(a.res.writes,1);assert.equal(b.res.writes,1);
});
test('no physical socket binding is performed by transport module',()=>{
  const f=setup();assert.equal(typeof f.transport,'function');assert.equal(f.seen.length,0);
});

test('late request error after an early header denial is consumed safely', async()=>{
  const f=setup();const req=input({rawHeaders:['Authorization','Bearer x','authorization','Bearer y']});
  const p=run(f.transport,req);
  assert.equal(await p.done,400);
  assert.doesNotThrow(()=>req.emit('error',new Error('late stream error')));
  assert.equal(p.res.writes,1);
});
