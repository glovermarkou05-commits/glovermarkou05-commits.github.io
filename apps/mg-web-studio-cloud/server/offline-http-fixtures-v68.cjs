'use strict';

// Fixtures are normalized Node event inputs, NOT raw HTTP packet examples.
// Only synthetic placeholder tokens are allowed in these checked-in examples.
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROOT = `/api/v1/organizations/${ORG}/sites/${SITE}/access`;
const TOKEN = 'Bearer synthetic-v68';
function item(id, status, changes = {}) {
  const row = { id, expectedStatus: status, method: 'GET', target: ROOT,
    rawHeaders: ['Authorization', TOKEN], chunkSizes: [], ...changes };
  Object.freeze(row.rawHeaders); Object.freeze(row.chunkSizes);
  return Object.freeze(row);
}
const SYNTHETIC_CASES = Object.freeze([
  item('V68_VALID_READ', 200),
  item('V68_NO_AUTH', 401, { rawHeaders: [] }),
  item('V68_DUPLICATE_AUTH', 400, { rawHeaders: ['Authorization', TOKEN, 'authorization', TOKEN] }),
  item('V68_DUPLICATE_LENGTH', 400, { rawHeaders: ['Authorization', TOKEN, 'Content-Length', '0', 'content-length', '0'] }),
  item('V68_FORBIDDEN_TRANSFER', 400, { rawHeaders: ['Authorization', TOKEN, 'Transfer-Encoding', 'chunked'] }),
  item('V68_POST_DENIED', 405, { method: 'POST' }),
  item('V68_WRONG_PATH', 404, { target: ROOT + '?extra=1' }),
  item('V68_SMALL_BODY', 400, { chunkSizes: [1] }),
  item('V68_LARGE_BODY', 413, { chunkSizes: [5000] }),
  item('V68_NONZERO_LENGTH', 400, { rawHeaders: ['Authorization', TOKEN, 'Content-Length', '1'] }),
  item('V68_BAD_TOKEN', 401, { rawHeaders: ['Authorization', 'Bearer invalid-synthetic'] }),
  item('V68_FOREIGN_ORG', 404, { target: ROOT.replace(ORG, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') }),
  item('V68_FORGED_ROLE', 200, { rawHeaders: ['Authorization', TOKEN, 'X-Role', 'CLIENT_OWNER'] }),
  item('V68_FORGED_FORWARDED_IP', 200, { rawHeaders: ['Authorization', TOKEN, 'X-Forwarded-For', '203.0.113.1'] }),
  item('V68_SECOND_PEER', 200, { peer: 'loopback-b' })
]);
module.exports = { SYNTHETIC_CASES };
