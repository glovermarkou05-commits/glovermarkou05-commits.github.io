'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createTenantAuthorizer } = require('../server/tenant-authorization.cjs');
const { createAuthBoundary } = require('../server/auth-boundary.cjs');
const identity = 'user-a';
const valid = Object.freeze({ authorization: 'Bearer user-a', organizationId: 'org-a', siteId: 'site-a1', action: 'read' });

function fixture() {
  const organizations = [
    { id: 'org-a', status: 'active' }, { id: 'org-b', status: 'active' }
  ];
  const sites = [
    { id: 'site-a1', organizationId: 'org-a', status: 'draft' },
    { id: 'site-a2', organizationId: 'org-a', status: 'review' },
    { id: 'site-b1', organizationId: 'org-b', status: 'draft' }
  ];
  const memberships = [
    { userId: identity, organizationId: 'org-a', status: 'active', role: 'CLIENT_EDITOR' },
    { userId: identity, organizationId: 'org-b', status: 'active', role: 'CLIENT_VIEWER' }
  ];
  const scopes = [
    { userId: identity, organizationId: 'org-a', siteId: 'site-a1' },
    { userId: identity, organizationId: 'org-b', siteId: 'site-b1' }
  ];
  let reads = 0;
  const repository = {
    getOrganization: async ({ organizationId }) => { reads++; return organizations.find(x => x.id === organizationId) || null; },
    getSite: async ({ siteId }) => { reads++; return sites.find(x => x.id === siteId) || null; },
    getMembership: async ({ userId, organizationId }) => { reads++; return memberships.find(x => x.userId === userId && x.organizationId === organizationId) || null; },
    getSiteScope: async ({ userId, organizationId, siteId }) => { reads++; return scopes.find(x => x.userId === userId && x.organizationId === organizationId && x.siteId === siteId) || null; }
  };
  const authenticate = createAuthBoundary({ verifyAccessToken: async token => ({ verified: true, subject: token }) });
  return { organizations, sites, memberships, scopes, repository, authenticate,
    authorize: createTenantAuthorizer({ authenticate, repository }), getReads: () => reads };
}

test('requires independently injected auth and all repository methods', () => {
  assert.throws(() => createTenantAuthorizer(), /authentication/);
  assert.throws(() => createTenantAuthorizer({ authenticate: () => true }), /repository/);
  assert.throws(() => createTenantAuthorizer({ authenticate: () => true, repository: { getSite() {} } }), /repository/);
});
test('unauthenticated requests never read tenant records', async () => {
  const f = fixture();
  const result = await f.authorize({ ...valid, authorization: undefined });
  assert.deepEqual(result, { ok: false, status: 401, code: 'UNAUTHENTICATED' });
  assert.equal(f.getReads(), 0);
});
test('invalid credentials and unverified provider responses are denied', async () => {
  const f = fixture();
  assert.equal((await f.authorize({ ...valid, authorization: 'Basic abc' })).status, 401);
  const rejectAll = createAuthBoundary({ verifyAccessToken: async () => ({ verified: false, subject: identity }) });
  assert.equal((await createTenantAuthorizer({ authenticate: rejectAll, repository: f.repository })(valid)).status, 401);
  assert.equal(f.getReads(), 0);
});
test('forged role, actor and MFA from client body are rejected', async () => {
  const f = fixture();
  for (const key of ['role', 'actorId', 'userId', 'mfa', 'scope', 'trustedSession']) {
    const decision = await f.authorize({ ...valid, body: { [key]: 'privileged' } });
    assert.deepEqual(decision, { ok: false, status: 400, code: 'INVALID_REQUEST' });
  }
  assert.equal(f.getReads(), 0);
});
test('missing, invalid or unknown selectors and actions fail closed', async () => {
  const f = fixture();
  for (const change of [{ organizationId: '../../org-b' }, { siteId: '' },
    { action: 'delete' }, { organizationId: undefined }, { siteId: {} }]) {
    assert.deepEqual(await f.authorize({ ...valid, ...change }),
      { ok: false, status: 400, code: 'INVALID_REQUEST' });
  }
  assert.equal(f.getReads(), 0);
});
test('editor reads and edits only the assigned site', async () => {
  const f = fixture();
  for (const action of ['read', 'edit']) {
    const result = await f.authorize({ ...valid, action });
    assert.equal(result.ok, true);
    assert.deepEqual(result.context, { userId: identity, organizationId: 'org-a', siteId: 'site-a1', role: 'CLIENT_EDITOR' });
    assert.ok(Object.isFrozen(result) && Object.isFrozen(result.context));
  }
  assert.deepEqual(await f.authorize({ ...valid, siteId: 'site-a2' }),
    { ok: false, status: 404, code: 'RESOURCE_UNAVAILABLE' });
});
test('cross-organization site identifier is never accepted', async () => {
  const f = fixture();
  assert.equal((await f.authorize({ ...valid, siteId: 'site-b1' })).status, 404);
  assert.equal((await f.authorize({ ...valid, organizationId: 'org-b', siteId: 'site-a1' })).status, 404);
});
test('same actor gets independent roles in two organizations', async () => {
  const f = fixture();
  assert.equal((await f.authorize({ ...valid, organizationId: 'org-b', siteId: 'site-b1' })).ok, true);
  assert.deepEqual(await f.authorize({ ...valid, organizationId: 'org-b', siteId: 'site-b1', action: 'edit' }),
    { ok: false, status: 403, code: 'FORBIDDEN' });
  assert.equal((await f.authorize({ ...valid, action: 'edit' })).ok, true);
});
test('viewer cannot edit, publish, manage members or billing', async () => {
  const f = fixture();
  for (const action of ['edit', 'publish', 'members', 'billing', 'support']) {
    assert.equal((await f.authorize({ ...valid, organizationId: 'org-b', siteId: 'site-b1', action })).status, 403);
  }
});
test('editor cannot publish or change membership', async () => {
  const f = fixture();
  for (const action of ['publish', 'members', 'billing', 'support']) {
    assert.equal((await f.authorize({ ...valid, action })).status, 403);
  }
});
test('owner and admin permissions match the approved matrix', async () => {
  const f = fixture();
  f.memberships[0].role = 'CLIENT_OWNER';
  for (const action of ['read', 'edit', 'publish', 'members', 'support', 'billing']) {
    assert.equal((await f.authorize({ ...valid, action })).ok, true);
  }
  f.memberships[0].role = 'CLIENT_ADMIN';
  assert.equal((await f.authorize({ ...valid, action: 'publish' })).ok, true);
  assert.equal((await f.authorize({ ...valid, action: 'members' })).ok, true);
  assert.equal((await f.authorize({ ...valid, action: 'support' })).ok, true);
  assert.equal((await f.authorize({ ...valid, action: 'billing' })).status, 403);
});
test('SUPERADMIN is not a tenant role and never inherits tenant access', async () => {
  const f = fixture();
  f.memberships[0].role = 'SUPERADMIN';
  assert.equal((await f.authorize(valid)).status, 404);
});
test('revoking membership takes effect on the next evaluation', async () => {
  const f = fixture();
  assert.equal((await f.authorize(valid)).ok, true);
  f.memberships[0].status = 'revoked';
  assert.deepEqual(await f.authorize(valid), { ok: false, status: 404, code: 'RESOURCE_UNAVAILABLE' });
});
test('removing a site assignment takes effect on the next evaluation', async () => {
  const f = fixture();
  assert.equal((await f.authorize(valid)).ok, true);
  f.scopes.splice(0, 1);
  assert.equal((await f.authorize(valid)).status, 404);
});
test('suspended tenant and suspended site are rejected', async () => {
  const f = fixture();
  f.organizations[0].status = 'suspended';
  assert.equal((await f.authorize(valid)).status, 404);
  f.organizations[0].status = 'active';
  f.sites[0].status = 'suspended';
  assert.equal((await f.authorize(valid)).status, 404);
});
test('missing membership and unknown tenant/site return same generic result', async () => {
  const f = fixture();
  f.memberships.splice(0, 1);
  const a = await f.authorize(valid);
  const b = await f.authorize({ ...valid, organizationId: 'org-unknown' });
  const c = await f.authorize({ ...valid, siteId: 'site-missing' });
  assert.deepEqual(a, b); assert.deepEqual(b, c);
});
test('repository response must match the trusted query parameters', async () => {
  const f = fixture();
  const good = f.repository;
  const overrides = [
    ['getOrganization', { id: 'org-b', status: 'active' }],
    ['getSite', { id: 'site-a1', organizationId: 'org-b', status: 'draft' }],
    ['getMembership', { userId: identity, organizationId: 'org-b', status: 'active', role: 'CLIENT_OWNER' }],
    ['getSiteScope', { userId: identity, organizationId: 'org-b', siteId: 'site-a1' }]
  ];
  for (const [name, value] of overrides) {
    const repository = { ...good, [name]: async () => value };
    const authorize = createTenantAuthorizer({ authenticate: f.authenticate, repository });
    assert.equal((await authorize(valid)).status, 404);
  }
});
test('malformed data records fail closed without throwing', async () => {
  const f = fixture();
  for (const name of ['getOrganization','getSite','getMembership','getSiteScope']) {
    const repo = { ...f.repository, [name]: async () => [ { id: 'wrong' } ] };
    assert.equal((await createTenantAuthorizer({ authenticate: f.authenticate, repository: repo })(valid)).status, 404);
  }
});
test('repository exceptions return 503 without leaking provider errors', async () => {
  const f = fixture();
  const repo = { ...f.repository, getMembership: async () => { throw Error('PRIVATE_DB_PASSWORD'); } };
  const result = await createTenantAuthorizer({ authenticate: f.authenticate, repository: repo })(valid);
  assert.deepEqual(result, { ok: false, status: 503, code: 'RETRY_LATER' });
  assert.ok(!JSON.stringify(result).includes('PASSWORD'));
});
test('authentication exceptions return 401 and do not query repository', async () => {
  const f = fixture();
  const authorize = createTenantAuthorizer({ authenticate: async () => { throw Error('TOKEN_SECRET'); }, repository: f.repository });
  assert.equal((await authorize(valid)).status, 401);
  assert.equal(f.getReads(), 0);
});
test('a forged actor or invalid authentication result is never authorized', async () => {
  const f = fixture();
  for (const bad of [{ ok: true }, { ok: true, actor: { id: '' } }, { ok: true, actor: { id: {} } }]) {
    const authorize = createTenantAuthorizer({ authenticate: async () => bad, repository: f.repository });
    assert.equal((await authorize(valid)).status, 401);
  }
  assert.equal(f.getReads(), 0);
});
test('parallel users cannot share membership or a previous positive decision', async () => {
  const f = fixture();
  const [a, b] = await Promise.all([
    f.authorize({ ...valid, authorization: 'Bearer user-a' }),
    f.authorize({ ...valid, authorization: 'Bearer user-b' })
  ]);
  assert.equal(a.ok, true);
  assert.deepEqual(b, { ok: false, status: 404, code: 'RESOURCE_UNAVAILABLE' });
});
test('site list scope cannot be borrowed from another actor', async () => {
  const f = fixture();
  f.memberships.push({ userId: 'user-b', organizationId: 'org-a', status: 'active', role: 'CLIENT_EDITOR' });
  assert.equal((await f.authorize({ ...valid, authorization: 'Bearer user-b' })).status, 404);
});
test('nonrequest inputs do not crash and cannot bypass authentication', async () => {
  const f = fixture();
  for (const input of [null, 3, [], Object.create({ organizationId: 'org-a' })]) {
    assert.equal((await f.authorize(input)).status, 401);
  }
  assert.equal(f.getReads(), 0);
});
