'use strict';

// V62: PostgreSQL read-only adapter for the V61 server authorization boundary.
// This module creates NO connections, reads NO environment variables and has NO
// privileged default. Inject a server-side query implementation explicitly.
// The provider must enforce TLS, least privilege, timeouts and transport policy.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = value => typeof value === 'string' && UUID.test(value);
const isRecord = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

// Fixed SQL; never interpolate a caller-provided SQL identifier or value.
const SQL = Object.freeze({
  organization: 'SELECT id, status FROM public.mg_organizations WHERE id = $1::uuid LIMIT 2',
  site: 'SELECT id, organization_id AS "organizationId", status FROM public.mg_sites WHERE id = $1::uuid LIMIT 2',
  membership: 'SELECT user_id AS "userId", organization_id AS "organizationId", role, status FROM public.mg_memberships WHERE user_id = $1::uuid AND organization_id = $2::uuid LIMIT 2',
  scope: 'SELECT user_id AS "userId", organization_id AS "organizationId", site_id AS "siteId" FROM public.mg_membership_site_scopes WHERE user_id = $1::uuid AND organization_id = $2::uuid AND site_id = $3::uuid LIMIT 2'
});

const COLUMNS = Object.freeze({
  organization: Object.freeze(['id', 'status']),
  site: Object.freeze(['id', 'organizationId', 'status']),
  membership: Object.freeze(['userId', 'organizationId', 'role', 'status']),
  scope: Object.freeze(['userId', 'organizationId', 'siteId'])
});
const UUID_COLUMNS = Object.freeze(['id', 'userId', 'organizationId', 'siteId']);

function validateRow(row, columns, expected) {
  if (!isRecord(row) || Object.keys(row).length !== columns.length ||
      columns.some(column => !Object.hasOwn(row, column) || typeof row[column] !== 'string')) {
    throw new Error('INVALID_QUERY_RESULT');
  }
  for (const column of UUID_COLUMNS) {
    if (Object.hasOwn(row, column) && !isUuid(row[column])) {
      throw new Error('INVALID_QUERY_RESULT');
    }
  }
  for (const [column, value] of Object.entries(expected)) {
    if (row[column].toLowerCase() !== value.toLowerCase()) {
      throw new Error('INVALID_QUERY_RESULT');
    }
  }
  return Object.freeze(Object.fromEntries(columns.map(column => [column, row[column]])));
}

function createPgTenantRepository({ query } = {}) {
  if (typeof query !== 'function') {
    throw new TypeError('An explicit server-side PostgreSQL query function is required');
  }
  async function fetchSingle(kind, ids, expected) {
    // A bad UUID must not reach Postgres, and must not become an injected SQL string.
    if (!ids.every(isUuid)) return null;
    const result = await query(Object.freeze({ text: SQL[kind], values: Object.freeze([...ids]) }));
    if (!isRecord(result) || !Array.isArray(result.rows) || result.rows.length > 1) {
      throw new Error('INVALID_QUERY_RESULT');
    }
    if (result.rows.length === 0) return null;
    return validateRow(result.rows[0], COLUMNS[kind], expected);
  }
  return Object.freeze({
    getOrganization({ organizationId } = {}) {
      return fetchSingle('organization', [organizationId], { id: organizationId });
    },
    getSite({ siteId } = {}) {
      return fetchSingle('site', [siteId], { id: siteId });
    },
    getMembership({ userId, organizationId } = {}) {
      return fetchSingle('membership', [userId, organizationId], { userId, organizationId });
    },
    getSiteScope({ userId, organizationId, siteId } = {}) {
      return fetchSingle('scope', [userId, organizationId, siteId], { userId, organizationId, siteId });
    }
  });
}

module.exports = { createPgTenantRepository };
