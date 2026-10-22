'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPgTenantRepository } = require('../server/pg-tenant-repository.cjs');

const ids = Object.freeze({
  a: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  b: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  user: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  site: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
});
const rows = Object.freeze({
  organization: { id: ids.a, status: 'active' },
  site: { id: ids.site, organizationId: ids.a, status: 'draft' },
  membership: { userId: ids.user, organizationId: ids.a, role: 'CLIENT_EDITOR', status: 'active' },
  scope: { userId: ids.user, organizationId: ids.a, siteId: ids.site }
});
const queries = [];
function setup(response) {
  const repository = createPgTenantRepository({ query: async config => {
    queries.push(config);
    return typeof response === 'function' ? response(config) : response;
  }});
  return repository;
}
const empty = { rows: [] };
test('requires a query function: no privileged fallback or environment-based connection', () => {
  assert.throws(() => createPgTenantRepository(), /query function/);
  assert.throws(() => createPgTenantRepository({ query: {} }), TypeError);
});
test('repository exposes only four expected readonly lookup methods', () => {
  const repository = setup(empty);
  assert.deepEqual(Object.keys(repository), ['getOrganization', 'getSite', 'getMembership', 'getSiteScope']);
  assert.ok(Object.isFrozen(repository));
});
test('organization lookup uses fixed SELECT with a bound UUID', async () => {
  queries.length = 0;
  const repository = setup({ rows: [rows.organization] });
  const result = await repository.getOrganization({ organizationId: ids.a });
  assert.deepEqual(result, rows.organization);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(queries[0].values, [ids.a]);
  assert.match(queries[0].text, /^SELECT\b/);
  assert.match(queries[0].text, /FROM public\.mg_organizations/);
  assert.match(queries[0].text, /WHERE id = \$1::uuid/);
  assert.match(queries[0].text, /LIMIT 2/);
});
test('site lookup maps exact V45 database columns to V61 contract', async () => {
  queries.length = 0;
  const repository = setup({ rows: [rows.site] });
  assert.deepEqual(await repository.getSite({ siteId: ids.site }), rows.site);
  assert.match(queries[0].text, /organization_id AS "organizationId"/);
  assert.match(queries[0].text, /FROM public\.mg_sites/);
  assert.deepEqual(queries[0].values, [ids.site]);
});
test('membership lookup reads tenant-scoped role and current status with two placeholders', async () => {
  queries.length = 0;
  const repository = setup({ rows: [rows.membership] });
  assert.deepEqual(await repository.getMembership({ userId: ids.user, organizationId: ids.a }), rows.membership);
  assert.match(queries[0].text, /FROM public\.mg_memberships/);
  assert.match(queries[0].text, /user_id = \$1::uuid AND organization_id = \$2::uuid/);
  assert.deepEqual(queries[0].values, [ids.user, ids.a]);
});
test('site scope lookup uses V45 composite key: no invented membershipId or status', async () => {
  queries.length = 0;
  const repository = setup({ rows: [rows.scope] });
  assert.deepEqual(await repository.getSiteScope({ userId: ids.user, organizationId: ids.a, siteId: ids.site }), rows.scope);
  assert.match(queries[0].text, /FROM public\.mg_membership_site_scopes/);
  assert.match(queries[0].text, /site_id = \$3::uuid/);
  assert.doesNotMatch(queries[0].text, /membership_id|status/i);
  assert.deepEqual(queries[0].values, [ids.user, ids.a, ids.site]);
});
test('no lookup embeds any UUID or caller-controlled value into SQL text', async () => {
  queries.length = 0;
  const repository = setup(empty);
  await repository.getOrganization({ organizationId: ids.a });
  await repository.getSite({ siteId: ids.site });
  await repository.getMembership({ userId: ids.user, organizationId: ids.a });
  await repository.getSiteScope({ userId: ids.user, organizationId: ids.a, siteId: ids.site });
  assert.equal(queries.length, 4);
  for (const { text, values } of queries) {
    assert.ok(![...Object.values(ids)].some(id => text.includes(id)));
    assert.ok(values.every(value => Object.values(ids).includes(value)));
  }
});
test('all four queries are SELECT-only and schema qualified', async () => {
  queries.length = 0;
  const repository = setup(empty);
  await repository.getOrganization({ organizationId: ids.a });
  await repository.getSite({ siteId: ids.site });
  await repository.getMembership({ userId: ids.user, organizationId: ids.a });
  await repository.getSiteScope({ userId: ids.user, organizationId: ids.a, siteId: ids.site });
  for (const q of queries) {
    assert.match(q.text.trim(), /^SELECT\b/i);
    assert.doesNotMatch(q.text, /\b(insert|update|delete|drop|alter|create|grant|revoke|execute|set|begin|commit)\b/i);
    assert.match(q.text, /FROM public\.mg_/);
    assert.ok(Object.isFrozen(q) && Object.isFrozen(q.values));
  }
});
test('absent rows return null, never a fabricated membership', async () => {
  const repository = setup(empty);
  assert.equal(await repository.getOrganization({ organizationId: ids.b }), null);
  assert.equal(await repository.getMembership({ userId: ids.user, organizationId: ids.b }), null);
});
test('invalid UUIDs are rejected before query execution', async () => {
  queries.length = 0;
  const repository = setup({ rows: [rows.organization] });
  const bad = ['../../evil', "' OR TRUE --", ids.a + ';DROP TABLE users;', '', null, undefined, 123, {}, 'test'];
  for (const value of bad) {
    assert.equal(await repository.getOrganization({ organizationId: value }), null);
    assert.equal(await repository.getSite({ siteId: value }), null);
    assert.equal(await repository.getMembership({ userId: value, organizationId: ids.a }), null);
    assert.equal(await repository.getSiteScope({ userId: ids.user, organizationId: ids.a, siteId: value }), null);
  }
  assert.equal(queries.length, 0);
});
test('parameter arrays are copied, not mutable external state', async () => {
  queries.length = 0;
  const repository = setup(empty);
  await repository.getMembership({ userId: ids.user, organizationId: ids.a });
  assert.ok(Object.isFrozen(queries[0].values));
  assert.deepEqual(queries[0].values, [ids.user, ids.a]);
});
test('rejects duplicate rows even when database constraints should ensure uniqueness', async () => {
  const repository = setup({ rows: [rows.organization, rows.organization] });
  await assert.rejects(repository.getOrganization({ organizationId: ids.a }), /INVALID_QUERY_RESULT/);
});
test('rejects malformed result shapes and empty rows property', async () => {
  for (const response of [null, [], {}, { rows: null }, { rows: {} }, { rows: 'nope' }]) {
    const repository = setup(response);
    await assert.rejects(repository.getOrganization({ organizationId: ids.a }), /INVALID_QUERY_RESULT/);
  }
});
test('rejects rows with missing, extra or non-string fields', async () => {
  const invalidRows = [{ id: ids.a }, { ...rows.organization, isAdmin: true },
    { id: ids.a, status: 123 }, [rows.organization], Object.create({ id: ids.a }), null];
  for (const row of invalidRows) {
    await assert.rejects(setup({ rows: [row] }).getOrganization({ organizationId: ids.a }), /INVALID_QUERY_RESULT/);
  }
});
test('rejects a row with unexpected org/site/user scope even if query provider misbehaves', async () => {
  const cases = [
    ['getOrganization', { organizationId: ids.a }, { ...rows.organization, id: ids.b }],
    ['getSite', { siteId: ids.site }, { ...rows.site, id: ids.b }],
    ['getMembership', { userId: ids.user, organizationId: ids.a }, { ...rows.membership, organizationId: ids.b }],
    ['getSiteScope', { userId: ids.user, organizationId: ids.a, siteId: ids.site }, { ...rows.scope, userId: ids.b }]
  ];
  for (const [method, args, row] of cases) {
    await assert.rejects(setup({ rows: [row] })[method](args), /INVALID_QUERY_RESULT/);
  }
});
test('rejects malformed UUID values from query results', async () => {
  await assert.rejects(setup({ rows: [{ id: 'bad', status: 'active' }] }).getOrganization({ organizationId: ids.a }), /INVALID_QUERY_RESULT/);
});
test('provider errors propagate for V61 to convert to safe 503, never silently allow', async () => {
  const repository = setup(() => { throw new Error('DB_PRIVATE_SECRET'); });
  await assert.rejects(repository.getOrganization({ organizationId: ids.a }), /DB_PRIVATE_SECRET/);
});
test('repeated calls re-query current membership status instead of using positive cache', async () => {
  queries.length = 0;
  let status = 'active';
  const repository = setup(() => ({ rows: [{ ...rows.membership, status }] }));
  assert.equal((await repository.getMembership({ userId: ids.user, organizationId: ids.a })).status, 'active');
  status = 'revoked';
  assert.equal((await repository.getMembership({ userId: ids.user, organizationId: ids.a })).status, 'revoked');
  assert.equal(queries.length, 2);
});
test('scope removal is observable in the next query', async () => {
  let granted = true;
  const repository = setup(() => ({ rows: granted ? [rows.scope] : [] }));
  assert.ok(await repository.getSiteScope({ userId: ids.user, organizationId: ids.a, siteId: ids.site }));
  granted = false;
  assert.equal(await repository.getSiteScope({ userId: ids.user, organizationId: ids.a, siteId: ids.site }), null);
});
test('parallel requests keep their own SQL parameters', async () => {
  queries.length = 0;
  const repository = setup(async () => { await Promise.resolve(); return empty; });
  await Promise.all([ids.a, ids.b].map(organizationId => repository.getOrganization({ organizationId })));
  assert.equal(queries.length, 2);
  assert.deepEqual(queries.map(q => q.values[0]), [ids.a, ids.b]);
});
test('known valid UUIDs accept case variants without weakening parameterization', async () => {
  const repository = setup({ rows: [{ id: ids.a.toUpperCase(), status: 'active' }] });
  assert.ok(await repository.getOrganization({ organizationId: ids.a }));
});
test('all responses omit unrelated database columns and are frozen', async () => {
  const repository = setup({ rows: [rows.membership] });
  const result = await repository.getMembership({ userId: ids.user, organizationId: ids.a });
  assert.deepEqual(Object.keys(result), ['userId', 'organizationId', 'role', 'status']);
  assert.ok(Object.isFrozen(result));
});
test('no network or SQL is executed at construction', () => {
  let count = 0;
  createPgTenantRepository({ query: () => { count++; return empty; } });
  assert.equal(count, 0);
});
