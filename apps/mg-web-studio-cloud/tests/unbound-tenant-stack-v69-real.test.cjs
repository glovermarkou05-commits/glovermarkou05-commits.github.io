'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { assembleUnboundTenantHttpV69 } = require('../server/unbound-tenant-stack-v69.cjs');
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FOREIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function makeFixture() {
  let active = true, scoped = true, sqlCalls = 0, verified = 0;
  const stack = assembleUnboundTenantHttpV69({
    verifyAccessToken: async token => {
      verified++;
      return token === 'synthetic' ? {verified:true,subject:ACTOR} : null;
    },
    query: async ({text,values}) => {
      sqlCalls++;
      assert.match(text, /^SELECT\b/);
      assert.ok(values.every(x => typeof x === 'string'));
      if (text.includes('mg_organizations')) return {rows:[{id:ORG,status:'active'}]};
      if (text.includes('mg_sites')) return {rows:[{id:SITE,organizationId:ORG,status:'draft'}]};
      if (text.includes('mg_memberships')) return {rows:[{userId:ACTOR,organizationId:ORG,role:'CLIENT_VIEWER',status:active?'active':'revoked'}]};
      if (text.includes('mg_membership_site_scopes')) return {rows:scoped?[{userId:ACTOR,organizationId:ORG,siteId:SITE}]:[]};
      throw Error('Unexpected simulated SQL');
    },
    makeRequestId: () => 'v69-id'
  });
  async function send({token='synthetic',method='GET',org=ORG,site=SITE,rawHeaders}={}) {
    const req=Object.assign(new EventEmitter(),{
      method,url:`/api/v1/organizations/${org}/sites/${site}/access`,
      rawHeaders:rawHeaders || ['Authorization',`Bearer ${token}`], rawTrailers:[],
      complete:false,readableEnded:false,socket:{remoteAddress:'127.0.0.1'}
    });
    const res={destroyed:false,writableEnded:false,headersSent:false,writeCount:0,
      writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},
      end(body){this.body=body;this.writeCount++;this.writableEnded=true;}};
    const processing=stack.onRequest(req,res);
    req.complete=true;req.readableEnded=true;req.emit('end');
    await processing;
    return res;
  }
  return {stack,send,getSql:()=>sqlCalls,getVerified:()=>verified,
    revoke:()=>{active=false;},removeScope:()=>{scoped=false;}};
}
test('real V60-V66 modules: a synthetic viewer receives read-only 200', async()=>{
  const f=makeFixture();const result=await f.send();
  assert.equal(result.status,200);
  assert.deepEqual(JSON.parse(result.body),{ok:true,access:'granted',requestId:'v69-id'});
  assert.equal(f.getSql(),4);assert.equal(result.writeCount,1);
});
test('real chain rejects expired or invalid token before any SQL',async()=>{
  const f=makeFixture();const r=await f.send({token:'invalid'});
  assert.equal(r.status,401);assert.equal(f.getSql(),0);
});
test('real chain rejects case-mixed Authorization duplicates before JWT',async()=>{
  const f=makeFixture();const r=await f.send({rawHeaders:['Authorization','Bearer synthetic','authorization','Bearer synthetic']});
  assert.equal(r.status,400);assert.equal(f.getVerified(),0);assert.equal(f.getSql(),0);
});
test('real chain hides foreign tenant without exposing identifier',async()=>{
  const f=makeFixture();const r=await f.send({org:FOREIGN});
  assert.equal(r.status,404);assert.ok(!r.body.includes(FOREIGN));
});
test('real chain rechecks revoked membership in subsequent request',async()=>{
  const f=makeFixture();assert.equal((await f.send()).status,200);
  f.revoke();assert.equal((await f.send()).status,404);
});
test('real chain rechecks lost viewer scope',async()=>{
  const f=makeFixture();assert.equal((await f.send()).status,200);
  f.removeScope();assert.equal((await f.send()).status,404);
});
test('real chain denies POST and remains unbound',async()=>{
  const f=makeFixture();const r=await f.send({method:'POST'});
  assert.equal(r.status,405);assert.equal(f.getSql(),0);
  assert.equal(f.stack.readiness.decision,'NO_GO');
  assert.equal(typeof f.stack.listen,'undefined');
});
