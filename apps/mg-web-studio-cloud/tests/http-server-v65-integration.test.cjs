'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createHttpServerBlueprint } = require('../server/http-server-blueprint-v65.cjs');
const { createNodeHttpTransport } = require('../server/node-http-transport-v64.cjs');
const { createHttpSiteGate } = require('../server/http-site-gate-v63.cjs');
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const url = (org=ORG,site=SITE) => `/api/v1/organizations/${org}/sites/${site}/access`;
function fixture() {
  let membershipActive = true;
  let authorized = 0;
  const gate = createHttpSiteGate({
    makeRequestId: () => 'v63-req',
    authorize: async ({authorization,organizationId,siteId,action}) => {
      authorized++;
      if(authorization !== 'Bearer valid') return {ok:false,status:401,code:'UNAUTHENTICATED'};
      if(organizationId !== ORG || siteId !== SITE || !membershipActive) {
        return {ok:false,status:404,code:'RESOURCE_UNAVAILABLE'};
      }
      assert.equal(action, 'read');
      return {ok:true,context:{userId:'synthetic',organizationId:ORG,siteId:SITE,role:'CLIENT_VIEWER'}};
    }
  });
  const serve = createNodeHttpTransport({gate, makeRequestId:()=> 'v64-req'});
  const blueprint = createHttpServerBlueprint({serve});
  const server = Object.assign(new EventEmitter(),{listening:false,
    setTimeout(ms,fn){this.timeout=ms;this.timeoutHandler=fn;return this;}});
  blueprint.configure(server);
  function request(overrides={}) {
    const req = Object.assign(new EventEmitter(),{
      method:'GET', url:url(), rawHeaders:['Authorization','Bearer valid'],
      rawTrailers:[],complete:false,readableEnded:false
    },overrides);
    const res = {destroyed:false,writableEnded:false,headersSent:false, writes:0,
      writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},
      end(body){this.body=body;this.writes++;this.writableEnded=true;}};
    return {req,res};
  }
  async function send(input,chunk) {
    const running = blueprint.onRequest(input.req,input.res);
    if(chunk) input.req.emit('data',chunk);
    input.req.complete = true;
    input.req.readableEnded = true;
    input.req.emit('end');
    await running;
    return input.res;
  }
  return {blueprint, server, request, send, getAuthorized:()=>authorized,
    revoke:()=>{membershipActive=false;}};
}
const parsed = r => JSON.parse(r.body);
test('V65->V64->V63 returns read access for synthetic authorized viewer', async () => {
  const f=fixture();const result=await f.send(f.request());
  assert.equal(result.status,200);
  assert.deepEqual(parsed(result),{ok:true,access:'granted',requestId:'v63-req'});
  assert.equal(f.getAuthorized(),1);
  assert.equal(result.headers['Cache-Control'],'no-store');
});
test('V65->V64->V63 denies missing credentials before authority', async () => {
  const f=fixture();const result=await f.send(f.request({rawHeaders:[]}));
  assert.equal(result.status,401);assert.equal(f.getAuthorized(),0);
});
test('V65->V64->V63 denies two Authorization headers before authority', async () => {
  const f=fixture();const result=await f.send(f.request({rawHeaders:['Authorization','Bearer valid','authorization','Bearer fake']}));
  assert.equal(result.status,400);assert.equal(f.getAuthorized(),0);
});
test('V65->V64->V63 denies foreign tenant without disclosing its identifiers', async () => {
  const f=fixture();const result=await f.send(f.request({url:url(OTHER)}));
  assert.equal(result.status,404);assert.equal(f.getAuthorized(),1);
  assert.ok(!result.body.includes(OTHER));
});
test('V65->V64->V63 re-checks permission after synthetic revocation', async () => {
  const f=fixture();assert.equal((await f.send(f.request())).status,200);
  f.revoke(); assert.equal((await f.send(f.request())).status,404);
  assert.equal(f.getAuthorized(),2);
});
test('V65->V64->V63 never accepts a nonempty GET body', async () => {
  const f=fixture();const result=await f.send(f.request(),Buffer.from('private data'));
  assert.equal(result.status,400);assert.equal(f.getAuthorized(),0);
});
test('V65->V64->V63 rejects POST without executing read authority', async () => {
  const f=fixture();const result=await f.send(f.request({method:'POST'}));
  assert.equal(result.status,405);assert.equal(f.getAuthorized(),0);
});
test('V65 server event rejects WebSocket and 100-continue before V64', () => {
  const f=fixture();let destroyed=0;
  f.server.emit('upgrade', {},{destroyed:false,destroy(){destroyed++;}});
  assert.equal(destroyed,1);
  const input=f.request();f.server.emit('checkContinue',input.req,input.res);
  assert.equal(input.res.status,417);assert.equal(f.getAuthorized(),0);
});
test('V65 blueprint factory and mocks do not listen or bind ports', () => {
  const f=fixture();assert.equal(f.server.listening,false);
  assert.equal(typeof f.server.listen,'undefined');
  assert.equal(f.server.listenerCount('upgrade'),1);
});
