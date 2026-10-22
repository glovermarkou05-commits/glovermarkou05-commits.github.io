'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPgTenantRepository } = require('../server/pg-tenant-repository.cjs');
const { createAuthBoundary } = require('../server/auth-boundary.cjs');
const { createTenantAuthorizer } = require('../server/tenant-authorization.cjs');
const id = Object.freeze({
  org: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  other: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  user: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  outsider: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  site: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
});
function fixture() {
  const state = { role: 'CLIENT_EDITOR', active: true, scoped: true, fail: false, calls: [] };
  const query = async ({ text, values }) => {
    state.calls.push({ text, values });
    if (state.fail) throw Error('TOP_SECRET_CONNECTION_STRING');
    if (text.includes('mg_organizations')) {
      return { rows: values[0] === id.org ? [{ id: id.org, status: 'active' }] : [] };
    }
    if (text.includes('mg_sites')) {
      return { rows: values[0] === id.site ? [{ id: id.site, organizationId: id.org, status: 'draft' }] : [] };
    }
    if (text.includes('mg_memberships')) {
      return { rows: values[0] === id.user && values[1] === id.org
        ? [{ userId: id.user, organizationId: id.org, role: state.role, status: state.active ? 'active' : 'revoked' }] : [] };
    }
    if (text.includes('mg_membership_site_scopes')) {
      return { rows: state.scoped && values[0] === id.user && values[1] === id.org && values[2] === id.site
        ? [{ userId: id.user, organizationId: id.org, siteId: id.site }] : [] };
    }
    throw Error('UNEXPECTED_SQL');
  };
  const repository = createPgTenantRepository({ query });
  const authenticate = createAuthBoundary({ verifyAccessToken: async token => ({
    verified: true, subject: token === 'valid' ? id.user : id.outsider
  }) });
  const authorize = createTenantAuthorizer({ authenticate, repository });
  const req = { authorization: 'Bearer valid', organizationId: id.org, siteId: id.site, action: 'read' };
  return { authorize, req, state };
}
test('V60 + V61 + V62 allows scoped editor read', async () => {
  const f = fixture();
  const r = await f.authorize(f.req);
  assert.equal(r.ok, true);
  assert.deepEqual(r.context, { userId: id.user, organizationId: id.org, siteId: id.site, role: 'CLIENT_EDITOR' });
  assert.equal(f.state.calls.length, 4);
});
test('missing bearer credential causes no database query', async () => {
  const f = fixture();
  assert.deepEqual(await f.authorize({ ...f.req, authorization: null }), { ok: false, status: 401, code: 'UNAUTHENTICATED' });
  assert.equal(f.state.calls.length, 0);
});
test('forged owner from browser is rejected prior to any query', async () => {
  const f = fixture();
  assert.equal((await f.authorize({ ...f.req, body: { role: 'CLIENT_OWNER' } })).status, 400);
  assert.equal(f.state.calls.length, 0);
});
test('cross-tenant request hides record without leaking existence', async () => {
  const f = fixture();
  assert.deepEqual(await f.authorize({ ...f.req, organizationId: id.other }), { ok: false, status: 404, code: 'RESOURCE_UNAVAILABLE' });
});
test('editor write allowed, publishing denied (403)', async () => {
  const f = fixture();
  assert.equal((await f.authorize({ ...f.req, action: 'edit' })).ok, true);
  assert.equal((await f.authorize({ ...f.req, action: 'publish' })).status, 403);
});
test('revoked membership takes effect at the next V62 query', async () => {
  const f = fixture();
  assert.equal((await f.authorize(f.req)).ok, true);
  f.state.active = false;
  assert.deepEqual(await f.authorize(f.req), { ok: false, status: 404, code: 'RESOURCE_UNAVAILABLE' });
});
test('scope removal blocks same still-authenticated editor', async () => {
  const f = fixture();
  assert.equal((await f.authorize(f.req)).ok, true);
  f.state.scoped = false;
  assert.equal((await f.authorize(f.req)).status, 404);
});
test('query failures are translated to generic 503 without exposing secrets', async () => {
  const f = fixture();
  f.state.fail = true;
  const response = await f.authorize(f.req);
  assert.deepEqual(response, { ok: false, status: 503, code: 'RETRY_LATER' });
  assert.ok(!JSON.stringify(response).includes('SECRET'));
});
test('different authenticated subject cannot borrow another subject membership', async () => {
  const f = fixture();
  assert.equal((await f.authorize({ ...f.req, authorization: 'Bearer outsider' })).status, 404);
});
