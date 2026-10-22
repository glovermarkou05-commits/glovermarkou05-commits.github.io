'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthBoundary } = require('../server/auth-boundary.cjs');
const { createTenantAuthorizer } = require('../server/tenant-authorization.cjs');
const { createPgTenantRepository } = require('../server/pg-tenant-repository.cjs');
const { createHttpSiteGate } = require('../server/http-site-gate-v63.cjs');
const ids = {
  org: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  foreign: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  site: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  user: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  outsider: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
};
function fixture() {
  const state = { authorized: true, scoped: true, fail: false, role: 'CLIENT_EDITOR', sqlCalls: [], authCalls: 0 };
  const query = async ({ text, values }) => {
    state.sqlCalls.push({ text, values });
    if (state.fail) throw Error('VERY_SECRET_DATABASE_URL');
    if (text.includes('mg_organizations')) return {rows:values[0]===ids.org ? [{id:ids.org,status:'active'}] : []};
    if (text.includes('mg_sites')) return {rows:values[0]===ids.site ? [{id:ids.site,organizationId:ids.org,status:'draft'}] : []};
    if (text.includes('mg_memberships')) return {rows:values[0]===ids.user && values[1]===ids.org
      ? [{userId:ids.user,organizationId:ids.org,role:state.role,status:state.authorized?'active':'revoked'}] : []};
    if (text.includes('mg_membership_site_scopes')) return {rows:state.scoped ? [{userId:ids.user,organizationId:ids.org,siteId:ids.site}] : []};
    throw Error('unexpected SQL');
  };
  const repository = createPgTenantRepository({query});
  const authenticate = createAuthBoundary({ verifyAccessToken: async token => {
    state.authCalls++;
    if (token === 'expired') return {verified:false,subject:ids.user};
    return { verified:true, subject: token === 'valid' ? ids.user : ids.outsider };
  }});
  const authorize = createTenantAuthorizer({authenticate,repository});
  let seq = 0;
  const handle = createHttpSiteGate({authorize,makeRequestId:()=>`rid-${++seq}`});
  const envelope = (token='valid', organizationId=ids.org, siteId=ids.site) => ({
    method:'GET',target:`/api/v1/organizations/${organizationId}/sites/${siteId}/access`,
    rawHeaders:['Authorization',`Bearer ${token}`],bodyBytes:Buffer.alloc(0)
  });
  return {state,handle,envelope};
}
const body = r => JSON.parse(r.body);
test('V60-V63: valid scoped editor can read, only public access marker is returned', async () => {
  const f=fixture();const res=await f.handle(f.envelope());
  assert.equal(res.status,200);
  assert.deepEqual(body(res),{ok:true,access:'granted',requestId:'rid-1'});
  assert.equal(f.state.sqlCalls.length,4);
  assert.equal(f.state.authCalls,1);
  assert.ok(!res.body.includes(ids.user));
});
test('V60-V63: missing bearer and duplicate authorization block before auth and SQL', async () => {
  const f=fixture();const r=f.envelope();r.rawHeaders=[];
  assert.equal((await f.handle(r)).status,401);
  r.rawHeaders=['Authorization','Bearer valid','authorization','Bearer valid'];
  assert.equal((await f.handle(r)).status,400);
  assert.equal(f.state.authCalls,0);assert.equal(f.state.sqlCalls.length,0);
});
test('V60-V63: expired token cannot trigger tenant reads', async () => {
  const f=fixture();const res=await f.handle(f.envelope('expired'));
  assert.equal(res.status,401);assert.equal(f.state.sqlCalls.length,0);
});
test('V60-V63: another actor never borrows the membership', async () => {
  const f=fixture();const res=await f.handle(f.envelope('outsider'));
  assert.equal(res.status,404);assert.equal(body(res).code,'RESOURCE_UNAVAILABLE');
});
test('V60-V63: foreign organization and site are hidden', async () => {
  const f=fixture();
  assert.equal((await f.handle(f.envelope('valid',ids.foreign))).status,404);
  assert.equal((await f.handle(f.envelope('valid',ids.org,ids.foreign))).status,404);
});
test('V60-V63: membership revocation is checked again per request', async () => {
  const f=fixture();assert.equal((await f.handle(f.envelope())).status,200);
  f.state.authorized=false;
  assert.equal((await f.handle(f.envelope())).status,404);
});
test('V60-V63: scope revocation is checked again per request', async () => {
  const f=fixture();assert.equal((await f.handle(f.envelope())).status,200);
  f.state.scoped=false;
  assert.equal((await f.handle(f.envelope())).status,404);
});
test('V60-V63: non-GET never calls verifier or DB', async () => {
  const f=fixture();const r=f.envelope();r.method='POST';r.bodyBytes=Buffer.from('{}');
  assert.equal((await f.handle(r)).status,400);
  r.bodyBytes=Buffer.alloc(0);
  assert.equal((await f.handle(r)).status,405);
  assert.equal(f.state.authCalls,0);assert.equal(f.state.sqlCalls.length,0);
});
test('V60-V63: database errors stay generic', async () => {
  const f=fixture();f.state.fail=true;const res=await f.handle(f.envelope());
  assert.equal(res.status,503);assert.ok(!res.body.includes('VERY_SECRET_DATABASE_URL'));
});
test('V60-V63: no browser supplied role or action can publish via this read-only route', async () => {
  const f=fixture();const r=f.envelope();r.role='CLIENT_OWNER';r.action='publish';
  r.rawHeaders.push('X-Role','CLIENT_OWNER');
  const res=await f.handle(r);assert.equal(res.status,200);
  assert.ok(f.state.sqlCalls.every(q=>/^SELECT\b/.test(q.text)));
  assert.equal(f.state.sqlCalls.length,4);
});
