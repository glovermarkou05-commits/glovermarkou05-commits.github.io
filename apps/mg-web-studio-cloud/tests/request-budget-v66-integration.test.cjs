'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createRequestBudget } = require('../server/request-budget-v66.cjs');
const { createNodeHttpTransport } = require('../server/node-http-transport-v64.cjs');
const { createHttpSiteGate } = require('../server/http-site-gate-v63.cjs');
const { createHttpServerBlueprint } = require('../server/http-server-blueprint-v65.cjs');
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const path = (org=ORG, site=SITE) => `/api/v1/organizations/${org}/sites/${site}/access`;
function fixture({ maxConcurrent=8, maxRequestsPerPeer=30, maxPeers=256, authorize }={}) {
  let reads=0;
  const events=[];
  const gate = createHttpSiteGate({makeRequestId:()=> 'v63-id', authorize:async input => {
    reads++;
    if (authorize) return authorize(input);
    if(input.authorization!=='Bearer ok')return {ok:false,status:401,code:'UNAUTHENTICATED'};
    if(input.organizationId!==ORG||input.siteId!==SITE)return {ok:false,status:404,code:'RESOURCE_UNAVAILABLE'};
    return {ok:true,context:{userId:'simulated',organizationId:ORG,siteId:SITE,role:'CLIENT_VIEWER'}};
  }});
  const transport = createNodeHttpTransport({gate,makeRequestId:()=> 'v64-id'});
  const limited = createRequestBudget({serve:transport,maxConcurrent,maxRequestsPerPeer,maxPeers,
    observe:e=>events.push(e)});
  const blueprint = createHttpServerBlueprint({serve:limited});
  const server=Object.assign(new EventEmitter(),{listening:false,
    setTimeout(ms,fn){this.timeout=ms;this.timeoutHandler=fn;return this;}});
  blueprint.configure(server);
  function request({ ip='127.0.0.1', token='ok', target=path(), method='GET', rawHeaders }={}) {
    const req=Object.assign(new EventEmitter(),{
      method,url:target,rawHeaders:rawHeaders || ['Authorization',`Bearer ${token}`],
      rawTrailers:[],complete:false,readableEnded:false,socket:{remoteAddress:ip}
    });
    const res={destroyed:false,writableEnded:false,headersSent:false, count:0,
      writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},
      end(body){this.body=body;this.count++;this.writableEnded=true;}};
    return {req,res};
  }
  function start(item,chunk) {
    const running=blueprint.onRequest(item.req,item.res);
    if (chunk) item.req.emit('data',chunk);
    item.req.complete = true;
    item.req.readableEnded = true;
    item.req.emit('end');
    return running;
  }
  async function send(item,chunk) {await start(item,chunk);return item.res;}
  return {blueprint,server,events,request,start,send, getReads:()=>reads};
}
const parse = res=>JSON.parse(res.body);

test('V66→V65→V64→V63 authorizes a synthetic viewer with an empty GET', async()=>{
  const f=fixture();const r=await f.send(f.request());
  assert.equal(r.status,200);assert.deepEqual(parse(r),{ok:true,access:'granted',requestId:'v63-id'});
  assert.equal(f.getReads(),1);
});
test('second request from same peer gets 429 without reaching authorization', async()=>{
  const f=fixture({maxRequestsPerPeer:1});
  assert.equal((await f.send(f.request())).status,200);
  const r=await f.send(f.request());
  assert.equal(r.status,429);assert.equal(parse(r).code,'RATE_LIMITED');assert.equal(f.getReads(),1);
  assert.equal(r.headers.Connection,'close');
});
test('different direct socket peer gets an independent allowance', async()=>{
  const f=fixture({maxRequestsPerPeer:1});
  assert.equal((await f.send(f.request({ip:'127.0.0.1'}))).status,200);
  assert.equal((await f.send(f.request({ip:'127.0.0.2'}))).status,200);
  assert.equal(f.getReads(),2);
});
test('untrusted forwarded IP cannot bypass per-peer cap', async()=>{
  const f=fixture({maxRequestsPerPeer:1});
  assert.equal((await f.send(f.request())).status,200);
  const inp=f.request({rawHeaders:['Authorization','Bearer ok','X-Forwarded-For','203.0.113.92']});
  assert.equal((await f.send(inp)).status,429);assert.equal(f.getReads(),1);
});
test('global active limit denies additional request while V63 authorization is blocked', async()=>{
  let resolveOne;
  const f=fixture({maxConcurrent:1,authorize:()=>new Promise(resolve=>{resolveOne=resolve;})});
  const first=f.request();const running=f.start(first);
  await Promise.resolve();await Promise.resolve();await Promise.resolve();
  const second=await f.send(f.request({ip:'127.0.0.2'}));
  assert.equal(second.status,503);assert.equal(parse(second).code,'RETRY_LATER');
  assert.equal(f.getReads(),1);
  resolveOne({ok:true,context:{userId:'u',organizationId:ORG,siteId:SITE,role:'CLIENT_VIEWER'}});
  await running;assert.equal(first.res.status,200);
});
test('V66 retains generic V63 denial for an unauthorized tenant', async()=>{
  const f=fixture();const r=await f.send(f.request({target:path(OTHER)}));
  assert.equal(r.status,404);assert.equal(parse(r).code,'RESOURCE_UNAVAILABLE');
  assert.ok(!r.body.includes(OTHER));
});
test('bad token still fails at V63 and counts toward admission limit', async()=>{
  const f=fixture({maxRequestsPerPeer:1});
  assert.equal((await f.send(f.request({token:'bad'}))).status,401);
  assert.equal((await f.send(f.request({token:'bad'}))).status,429);
  assert.equal(f.getReads(),1);
});
test('duplicate authorization still rejected by V64 before V63', async()=>{
  const f=fixture();const r=await f.send(f.request({rawHeaders:['Authorization','Bearer ok','authorization','Bearer forged']}));
  assert.equal(r.status,400);assert.equal(f.getReads(),0);
});
test('nonempty request body is rejected by V64 and never reaches V63', async()=>{
  const f=fixture();const r=await f.send(f.request(),Buffer.from('x'));
  assert.equal(r.status,400);assert.equal(f.getReads(),0);
});
test('observability never receives bearer token or org, site, path, ip', async()=>{
  const f=fixture({maxRequestsPerPeer:1});
  await f.send(f.request());await f.send(f.request());
  assert.ok(f.events.length >= 3);
  for (const event of f.events) {
    assert.deepEqual(Object.keys(event).sort(),['durationBucketMs','event','status']);
    const line=JSON.stringify(event);
    for (const secret of [ORG,SITE,'127.0.0.1','Bearer','/api/v1','simulated']) assert.ok(!line.includes(secret));
  }
});
test('V65 remains unbound and refuses non-read upgrade requests', async()=>{
  const f=fixture();
  assert.equal(f.server.listening,false);assert.equal(typeof f.server.listen,'undefined');
  let destroyed=0; f.server.emit('upgrade',{}, {destroyed:false,destroy(){destroyed++;}});
  assert.equal(destroyed,1);
  const r=await f.send(f.request({method:'POST'}));assert.equal(r.status,405);assert.equal(f.getReads(),0);
});
