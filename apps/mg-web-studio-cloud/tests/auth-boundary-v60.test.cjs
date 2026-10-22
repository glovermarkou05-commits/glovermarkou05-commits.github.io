'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthBoundary } = require('../server/auth-boundary.cjs');
const valid = { authorization: 'Bearer sample.token.signature', body: {} };
const identity = { verified: true, subject: 'actor-a', role: 'unneeded' };

test('requires an explicit verifier; no permissive default', () => {
  assert.throws(() => createAuthBoundary(), TypeError);
});
test('missing credentials never call verifier', async () => {
  const auth = createAuthBoundary({ verifyAccessToken: () => { throw new Error('must not run'); } });
  assert.deepEqual(await auth(), { ok: false, status: 401, code: 'UNAUTHENTICATED' });
});
test('rejects malformed, duplicate, oversized and non-string authorization', async () => {
  let calls = 0;
  const auth = createAuthBoundary({ verifyAccessToken: () => { calls++; return identity; } });
  for (const authorization of ['Basic abc', 'Bearer ', 'Bearer a, Bearer b', 'Bearer a\nb',
    'Bearer ' + 'x'.repeat(8192), ['Bearer a'], null, 'Bearer a b']) {
    assert.equal((await auth({ authorization })).status, 401);
  }
  assert.equal(calls, 0);
});
test('passes only token to server verifier and copies only subject', async () => {
  const auth = createAuthBoundary({ verifyAccessToken: async (...args) => {
    assert.deepEqual(args, ['sample.token.signature']); return identity;
  } });
  const result = await auth(valid);
  assert.deepEqual(result, { ok: true, actor: { id: 'actor-a' } });
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.actor));
});
test('provider exceptions produce a generic response without secrets', async () => {
  const auth = createAuthBoundary({ verifyAccessToken: () => { throw Error('SECRET'); } });
  assert.deepEqual(await auth(valid), { ok: false, status: 401, code: 'UNAUTHENTICATED' });
});
test('rejects incomplete or unverified provider results', async () => {
  for (const answer of [null, {}, { verified: false, subject: 'a' },
    { verified: true, subject: '' }, { verified: true, subject: ' ' },
    { verified: true, subject: 123 }, { verified: true, subject: 'x'.repeat(257) }]) {
    const auth = createAuthBoundary({ verifyAccessToken: () => answer });
    assert.equal((await auth(valid)).status, 401);
  }
});
test('rejects all reserved identity/authority fields from clients', async () => {
  const auth = createAuthBoundary({ verifyAccessToken: () => identity });
  for (const key of ['actorId','userId','role','roles','scope','scopes','mfa','aal',
    'trustedSession','session','sessionId']) {
    assert.equal((await auth({ ...valid, body: { [key]: 'forged' } })).status, 400);
  }
});
test('rejects non-JSON objects and inherited body properties', async () => {
  const auth = createAuthBoundary({ verifyAccessToken: () => identity });
  for (const body of [null, [], 'text', new Date(), Object.create({ role: 'admin' })]) {
    assert.equal((await auth({ ...valid, body })).status, 400);
  }
});
test('authenticates before reporting body validation errors', async () => {
  const auth = createAuthBoundary({ verifyAccessToken: () => null });
  assert.equal((await auth({ ...valid, body: { role: 'admin' } })).status, 401);
});
test('revalidates each call instead of caching an actor or replay permission', async () => {
  let active = true;
  const auth = createAuthBoundary({ verifyAccessToken: () => active ? identity : null });
  assert.equal((await auth(valid)).ok, true);
  active = false;
  assert.equal((await auth(valid)).status, 401);
});
test('organization selector never becomes trusted actor or authorization', async () => {
  const auth = createAuthBoundary({ verifyAccessToken: () => identity });
  assert.deepEqual(await auth({ ...valid, body: { organizationId: 'foreign', siteId: 'other' } }),
    { ok: true, actor: { id: 'actor-a' } });
});
test('parallel requests retain their separately verified identities', async () => {
  const auth = createAuthBoundary({ verifyAccessToken: async token => ({ verified: true, subject: token }) });
  const results = await Promise.all(['a','b'].map(token => auth({ authorization: 'Bearer ' + token })));
  assert.deepEqual(results.map(r => r.actor.id), ['a', 'b']);
});
