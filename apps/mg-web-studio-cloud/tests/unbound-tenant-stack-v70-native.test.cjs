'use strict';

// V70: Node.js-native, event-driven integration through the ACTUAL V60–V69 modules.
// No http.listen(), network client, Supabase URL, secrets, real DB, or JWT provider.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { assembleUnboundTenantHttpV69 } = require('../server/unbound-tenant-stack-v69.cjs');
const { assessV67Evidence } = require('../server/security-acceptance-v67.cjs');

const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const URL = `/api/v1/organizations/${ORG}/sites/${SITE}/access`;

function makeFixture(overrides = {}) {
  const state = { orgStatus: 'active', siteStatus: 'draft', membershipStatus: 'active',
    role: 'CLIENT_VIEWER', scoped: true, dbError: false, verifierError: false, ...overrides };
  const sql = [];
  let verifications = 0;
  const stack = assembleUnboundTenantHttpV69({
    verifyAccessToken: async token => {
      verifications++;
      if (state.verifierError) throw Error('PRIVATE_AUTH_PROVIDER_KEY');
      return token === 'synthetic' ? {verified:true,subject:ACTOR} :
        {verified:false,subject:ACTOR};
    },
    query: async ({text, values}) => {
      sql.push({text,values});
      if (state.dbError) throw Error('PRIVATE_DATABASE_PASSWORD');
      if (text.includes('mg_organizations')) {
        return {rows: values[0] === ORG ? [{id:ORG,status:state.orgStatus}] : []};
      }
      if (text.includes('mg_sites')) {
        return {rows: values[0] === SITE ? [{id:SITE,organizationId:ORG,status:state.siteStatus}] : []};
      }
      if (text.includes('mg_memberships')) {
        return {rows: values[0] === ACTOR && values[1] === ORG ? [{
          userId:ACTOR,organizationId:ORG,status:state.membershipStatus,role:state.role
        }] : []};
      }
      if (text.includes('mg_membership_site_scopes')) {
        return {rows:state.scoped ? [{userId:ACTOR,organizationId:ORG,siteId:SITE}] : []};
      }
      throw Error('Unexpected synthetic SQL');
    },
    makeRequestId:()=> 'v70-id'
  });
  function makeRequest({ method='GET', target=URL, token='synthetic', ip='127.0.0.1',
    rawHeaders, body } = {}) {
    const req=Object.assign(new EventEmitter(),{ method,url:target,
      rawHeaders:rawHeaders === undefined ? ['Authorization',`Bearer ${token}`] : rawHeaders,
      rawTrailers:[],complete:false,readableEnded:false,socket:{remoteAddress:ip} });
    const res = {destroyed:false,writableEnded:false,headersSent:false,writeCount:0,
      writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},
      end(payload){this.body=payload;this.writeCount++;this.writableEnded=true;}};
    return {req,res,body};
  }
  function start(options) {
    const v = makeRequest(options);
    const running=stack.onRequest(v.req,v.res);
    if (v.body) v.req.emit('data',Buffer.from(v.body));
    v.req.complete=true;
    v.req.readableEnded=true;
    v.req.emit('end');
    return {response:v.res,done:running};
  }
  async function send(options) {
    const v=start(options);
    await v.done;
    return v.response;
  }
  return {state,sql,stack,start,send,getVerifications:()=>verifications};
}
function body(res) { return JSON.parse(res.body); }

test('V70 native: V60–V69 completes a synthetic allowed read', async()=>{
  const f=makeFixture();const r=await f.send();
  assert.equal(r.status,200);assert.equal(r.writeCount,1);
  assert.deepEqual(body(r),{ok:true,access:'granted',requestId:'v70-id'});
  assert.equal(f.sql.length,4);
  assert.equal(f.getVerifications(),1);
  assert.equal(r.headers['Cache-Control'],'no-store');
});
test('V70 native: bearer missing rejects before JWT and SQL',async()=>{
  const f=makeFixture();const r=await f.send({rawHeaders:[]});
  assert.equal(r.status,401);assert.equal(f.getVerifications(),0);assert.equal(f.sql.length,0);
});
test('V70 native: bad token rejects without SQL',async()=>{
  const f=makeFixture();const r=await f.send({token:'invalid'});
  assert.equal(r.status,401);assert.equal(f.getVerifications(),1);assert.equal(f.sql.length,0);
});
test('V70 native: duplicate mixed-case bearer is rejected before verifier',async()=>{
  const f=makeFixture();const r=await f.send({rawHeaders:['Authorization','Bearer synthetic',
    'authorization','Bearer synthetic']});
  assert.equal(r.status,400);assert.equal(f.getVerifications(),0);assert.equal(f.sql.length,0);
});
test('V70 native: foreign organization is hidden without identity leakage',async()=>{
  const f=makeFixture();const r=await f.send({target:URL.replace(ORG,OTHER)});
  assert.equal(r.status,404);assert.ok(!r.body.includes(OTHER));assert.equal(f.sql.length,1);
});
test('V70 native: foreign site is hidden without querying membership',async()=>{
  const f=makeFixture();const r=await f.send({target:URL.replace(SITE,OTHER)});
  assert.equal(r.status,404);assert.equal(f.sql.length,2);
});
test('V70 native: owner spoofed via X-Role cannot change trusted access',async()=>{
  const f=makeFixture();const r=await f.send({rawHeaders:['Authorization','Bearer synthetic',
    'X-Role','CLIENT_OWNER','X-User-Id',OTHER]});
  assert.equal(r.status,200);assert.equal(f.sql.length,4);
  assert.ok(!r.body.includes('CLIENT_OWNER'));assert.ok(!r.body.includes(ACTOR));
});
test('V70 native: X-Forwarded-For spoof does not bypass direct-peer limit',async()=>{
  const f=makeFixture();const r=await f.send({rawHeaders:['Authorization','Bearer synthetic',
    'X-Forwarded-For','203.0.113.99']});
  assert.equal(r.status,200);
  assert.ok(!r.body.includes('203.0.113.99'));
});
test('V70 native: revoked membership checked again on the next request',async()=>{
  const f=makeFixture();assert.equal((await f.send()).status,200);
  f.state.membershipStatus='revoked';assert.equal((await f.send()).status,404);
});
test('V70 native: removed scope checked again on the next request',async()=>{
  const f=makeFixture();assert.equal((await f.send()).status,200);
  f.state.scoped=false;assert.equal((await f.send()).status,404);
});
test('V70 native: suspended organization denies before querying site',async()=>{
  const f=makeFixture({orgStatus:'suspended'});const r=await f.send();
  assert.equal(r.status,404);assert.equal(f.sql.length,1);
});
test('V70 native: suspended site denies before membership lookup',async()=>{
  const f=makeFixture({siteStatus:'suspended'});const r=await f.send();
  assert.equal(r.status,404);assert.equal(f.sql.length,2);
});
test('V70 native: unknown role is not treated as a valid site role',async()=>{
  const f=makeFixture({role:'SUPERADMIN'});const r=await f.send();
  assert.equal(r.status,404);
});
test('V70 native: real V62 SQL is fixed, read-only and parameterized',async()=>{
  const f=makeFixture();await f.send();
  assert.equal(f.sql.length,4);
  for (const entry of f.sql) {
    assert.match(entry.text,/^SELECT\b/);
    assert.ok(!entry.text.includes('synthetic'));
    assert.ok(entry.values.every(s=>typeof s==='string'));
    assert.doesNotMatch(entry.text,/\b(?:INSERT|UPDATE|DELETE|DROP)\b/i);
  }
  assert.ok(f.sql[0].text.includes('$1::uuid'));
  assert.ok(f.sql[3].text.includes('$3::uuid'));
});
test('V70 native: malformed tenant UUID never reaches repository',async()=>{
  const f=makeFixture();const r=await f.send({target:URL.replace(ORG,'not-a-uuid')});
  assert.equal(r.status,404);assert.equal(f.sql.length,0);
});
test('V70 native: unsupported POST cannot invoke database',async()=>{
  const f=makeFixture();const r=await f.send({method:'POST'});
  assert.equal(r.status,405);assert.equal(f.sql.length,0);
});
test('V70 native: nonempty GET body rejected before DB read',async()=>{
  const f=makeFixture();const r=await f.send({body:'SYNTHETIC_ONLY'});
  assert.equal(r.status,400);assert.equal(f.sql.length,0);
});
test('V70 native: duplicate Content-Length and transfer framing are denied',async()=>{
  const f=makeFixture();
  for (const rawHeaders of [
    ['Authorization','Bearer synthetic','Content-Length','0','content-length','0'],
    ['Authorization','Bearer synthetic','Transfer-Encoding','chunked'],
    ['Authorization','Bearer synthetic','Content-Length','1']
  ]) {
    assert.equal((await f.send({rawHeaders})).status,400);
  }
  assert.equal(f.sql.length,0);assert.equal(f.getVerifications(),0);
});
test('V70 native: query exceptions are sanitized as retryable 503',async()=>{
  const f=makeFixture({dbError:true});const r=await f.send();
  assert.equal(r.status,503);assert.equal(body(r).code,'RETRY_LATER');
  assert.ok(!r.body.includes('PRIVATE_DATABASE_PASSWORD'));
});
test('V70 native: verifier exceptions never expose secrets or run SQL',async()=>{
  const f=makeFixture({verifierError:true});const r=await f.send();
  assert.equal(r.status,401);assert.equal(f.sql.length,0);
  assert.ok(!r.body.includes('PRIVATE_AUTH_PROVIDER_KEY'));
});
test('V70 native: per-peer rate budget denies 31st request without DB work',async()=>{
  const f=makeFixture();
  for (let i=0;i<30;i++) assert.equal((await f.send()).status,200,'request '+i);
  assert.equal(f.sql.length,120);
  const final=await f.send();
  assert.equal(final.status,429);assert.equal(body(final).code,'RATE_LIMITED');
  assert.equal(f.sql.length,120);
  assert.ok(final.headers['Retry-After']);
});
test('V70 native: a distinct direct peer retains an independent allowance',async()=>{
  const f=makeFixture();
  for(let i=0;i<30;i++)assert.equal((await f.send()).status,200);
  assert.equal((await f.send({ip:'127.0.0.2'})).status,200);
});
test('V70 native: client-facing errors and success never echo private values',async()=>{
  const f=makeFixture();const inputs=[{},{token:'private-token'},
    {target:URL.replace(ORG,OTHER)},{method:'POST'}];
  for (const input of inputs) {
    const r=await f.send(input);
    for (const secret of [ACTOR,ORG,SITE,'PRIVATE_DATABASE_PASSWORD','private-token']) {
      assert.ok(!r.body.includes(secret));
    }
  }
});
test('V70 native: server policy creates an unbound Node server only',()=>{
  const f=makeFixture();
  const server=http.createServer(f.stack.serverOptions,f.stack.onRequest);
  f.stack.configureUnboundServer(server);
  assert.equal(server.listening,false);assert.equal(server.maxHeadersCount,32);
  assert.equal(typeof f.stack.listen,'undefined');
  assert.equal(f.stack.serverOptions.insecureHTTPParser,false);
  assert.equal(f.stack.serverOptions.joinDuplicateHeaders,false);
  assert.equal(f.stack.readiness.decision,'NO_GO');
});
test('V70 native: V67 operational checks remain unverified and NO_GO',()=>{
  const status=assessV67Evidence();
  assert.equal(status.total,32);assert.equal(status.pendingIds.length,32);
  assert.equal(status.liveHttpTestedByThisModule,false);
  assert.equal(status.recoveryTestedByThisModule,false);
  assert.equal(status.decision,'NO_GO');
});
