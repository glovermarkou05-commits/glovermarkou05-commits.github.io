'use strict';

// Server-only site gate for the V45 data model. Not an HTTP endpoint, RLS policy,
// token verifier, resource ownership checker, or a replacement for transaction checks.
const ROLES = Object.freeze({
  CLIENT_OWNER: Object.freeze(['read', 'edit', 'publish', 'members', 'support', 'billing']),
  CLIENT_ADMIN: Object.freeze(['read', 'edit', 'publish', 'members', 'support']),
  CLIENT_EDITOR: Object.freeze(['read', 'edit']),
  CLIENT_VIEWER: Object.freeze(['read'])
});
const ACTIONS = new Set(Object.values(ROLES).flat());
const isId = value => typeof value === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value);
const isRecord = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const denied = (status, code) => Object.freeze({ ok: false, status, code });
const hidden = () => denied(404, 'RESOURCE_UNAVAILABLE');

function createTenantAuthorizer({ authenticate, repository } = {}) {
  if (typeof authenticate !== 'function') {
    throw new TypeError('A server authentication boundary is required');
  }
  const methods = ['getOrganization', 'getSite', 'getMembership', 'getSiteScope'];
  if (!repository || methods.some(method => typeof repository[method] !== 'function')) {
    throw new TypeError('A server-only tenant repository is required');
  }

  return async function authorize(request = {}) {
    // Authentication precedes selector validation to avoid pre-auth resource probing.
    const input = isRecord(request) ? request : {};
    let auth;
    try {
      auth = await authenticate({ authorization: input.authorization,
        body: input.body === undefined ? {} : input.body });
    } catch {
      return denied(401, 'UNAUTHENTICATED');
    }
    if (!auth || auth.ok !== true) {
      return auth && auth.status === 400 && auth.code === 'INVALID_REQUEST'
        ? denied(400, 'INVALID_REQUEST') : denied(401, 'UNAUTHENTICATED');
    }
    const userId = auth.actor && auth.actor.id;
    if (typeof userId !== 'string' || !userId.trim() || userId.length > 256) {
      return denied(401, 'UNAUTHENTICATED');
    }
    const { organizationId, siteId, action } = input;
    // The HTTP route, not the request body, must fix the action being evaluated.
    if (!isId(organizationId) || !isId(siteId) || !ACTIONS.has(action)) {
      return denied(400, 'INVALID_REQUEST');
    }
    try {
      // This repository must read committed, current records; no cross-request
      // authorization cache. Its implementation is intentionally not included.
      const organization = await repository.getOrganization({ organizationId });
      if (!isRecord(organization) || organization.id !== organizationId ||
          organization.status !== 'active') return hidden();

      const site = await repository.getSite({ siteId });
      // V45 allows draft/review; suspended must not grant access.
      if (!isRecord(site) || site.id !== siteId ||
          site.organizationId !== organizationId ||
          !['draft', 'review'].includes(site.status)) return hidden();

      const membership = await repository.getMembership({ userId, organizationId });
      if (!isRecord(membership) || membership.userId !== userId ||
          membership.organizationId !== organizationId ||
          membership.status !== 'active' ||
          !Object.hasOwn(ROLES, membership.role)) return hidden();

      if (membership.role === 'CLIENT_EDITOR' || membership.role === 'CLIENT_VIEWER') {
        const scope = await repository.getSiteScope({ userId, organizationId, siteId });
        if (!isRecord(scope) || scope.userId !== userId ||
            scope.organizationId !== organizationId || scope.siteId !== siteId) {
          return hidden();
        }
      }
      if (!ROLES[membership.role].includes(action)) {
        return denied(403, 'FORBIDDEN');
      }
      // Context is trusted only inside server code and must not be returned to the browser.
      return Object.freeze({ ok: true, context: Object.freeze({
        userId, organizationId: organization.id, siteId: site.id, role: membership.role
      }) });
    } catch {
      // Repository unavailable: fail closed; never expose query details or secrets.
      return denied(503, 'RETRY_LATER');
    }
  };
}

module.exports = { createTenantAuthorizer };
