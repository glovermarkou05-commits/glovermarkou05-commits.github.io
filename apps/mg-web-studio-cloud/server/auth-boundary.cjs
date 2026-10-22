'use strict';

// Server-only boundary. No default verifier, token decoding fallback or browser session.
// Integration must supply a verifier that validates authenticity, expiry, issuer,
// audience and the chosen revocation policy. This module does not implement JWT verification.
const forbidden = new Set(['actorId', 'userId', 'role', 'roles', 'scope', 'scopes',
  'mfa', 'aal', 'trustedSession', 'session', 'sessionId']);
const denied = (status, code) => Object.freeze({ ok: false, status, code });

function createAuthBoundary({ verifyAccessToken } = {}) {
  if (typeof verifyAccessToken !== 'function') {
    throw new TypeError('A server access-token verifier is required');
  }
  return async function authenticate({ authorization, body = {} } = {}) {
    // The HTTP adapter must reject duplicate Authorization headers before calling.
    if (typeof authorization !== 'string' || authorization.length > 8192) {
      return denied(401, 'UNAUTHENTICATED');
    }
    const match = /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i.exec(authorization);
    if (!match) return denied(401, 'UNAUTHENTICATED');
    let identity;
    try {
      identity = await verifyAccessToken(match[1]);
    } catch {
      // Never expose provider errors, tokens or internal stack traces.
      return denied(401, 'UNAUTHENTICATED');
    }
    if (!identity || identity.verified !== true || typeof identity.subject !== 'string' ||
        !identity.subject.trim() || identity.subject.length > 256) {
      return denied(401, 'UNAUTHENTICATED');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(body)) ||
        Object.keys(body).some(key => forbidden.has(key))) {
      return denied(400, 'INVALID_REQUEST');
    }
    // Copy only the verified actor identifier. This is not tenant authorization.
    // Never carry roles or MFA from a request body into a trusted context.
    return Object.freeze({ ok: true, actor: Object.freeze({ id: identity.subject }) });
  };
}

module.exports = { createAuthBoundary };
