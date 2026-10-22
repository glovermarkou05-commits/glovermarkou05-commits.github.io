'use strict';

// V63: pure, read-only HTTP envelope adapter; no listener, network, DB, or JWT verifier.
// Accept ONLY a transport-validated envelope with complete, bounded bodyBytes.
// The future network transport must preserve rawHeaders and bound streaming reads.
const { randomUUID } = require('node:crypto');
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const ROUTE = new RegExp(`^/api/v1/organizations/(${UUID})/sites/(${UUID})/access$`);
const TOKEN_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/;
const ACCEPTABLE_DENIALS = Object.freeze({
  '400:INVALID_REQUEST': true,
  '401:UNAUTHENTICATED': true,
  '403:FORBIDDEN': true,
  '404:RESOURCE_UNAVAILABLE': true,
  '503:RETRY_LATER': true
});
const BASE_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
});
const isRecord = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function makeResponse(status, code, requestId, extraHeaders = {}) {
  const success = status === 200;
  return Object.freeze({
    status,
    headers: Object.freeze({ ...BASE_HEADERS, ...extraHeaders }),
    body: JSON.stringify(success
      ? { ok: true, access: 'granted', requestId }
      : { ok: false, code, requestId })
  });
}
function parseRawHeaders(rawHeaders) {
  // Never fall back to Node's normalized headers: they may merge duplicates.
  if (!Array.isArray(rawHeaders) || rawHeaders.length > 64 || rawHeaders.length % 2 !== 0) {
    return { error: 'INVALID_REQUEST' };
  }
  const headers = new Map();
  let bytes = 0;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i];
    const value = rawHeaders[i + 1];
    if (typeof name !== 'string' || !TOKEN_NAME.test(name) ||
        typeof value !== 'string' || value.length > 8192 ||
        /[\x00-\x08\x0a-\x1f\x7f]/.test(value)) {
      return { error: 'INVALID_REQUEST' };
    }
    bytes += Buffer.byteLength(name, 'utf8') + Buffer.byteLength(value, 'utf8') + 4;
    if (bytes > 16384) return { error: 'HEADERS_TOO_LARGE' };
    const key = name.toLowerCase();
    // Duplicate ANY header rejected by this narrowly scoped route, including
    // differently cased Authorization and Content-Length.
    if (headers.has(key)) return { error: 'INVALID_REQUEST' };
    headers.set(key, value);
  }
  return { headers };
}

function createHttpSiteGate({ authorize, makeRequestId = randomUUID } = {}) {
  if (typeof authorize !== 'function' || typeof makeRequestId !== 'function') {
    throw new TypeError('A server authorizer and request ID generator are required');
  }
  return async function handle(envelope) {
    let requestId;
    try {
      requestId = makeRequestId();
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(requestId)) {
        throw new Error('Invalid internal request ID');
      }
    } catch {
      // Never expose a failed generator, credentials, or internal exceptions.
      return makeResponse(500, 'INTERNAL_ERROR', 'unavailable');
    }
    if (!isRecord(envelope)) return makeResponse(400, 'INVALID_REQUEST', requestId);
    const parsed = parseRawHeaders(envelope.rawHeaders);
    if (parsed.error) return makeResponse(parsed.error === 'HEADERS_TOO_LARGE' ? 431 : 400,
      parsed.error, requestId);
    const h = parsed.headers;
    // Reject ambiguous framing. This does not replace an HTTP server/proxy parser.
    if (h.has('transfer-encoding') || h.has('expect') || h.has('cookie') ||
        h.has('proxy-authorization')) return makeResponse(400, 'INVALID_REQUEST', requestId);
    if (h.has('content-length') && !/^(0|[1-9][0-9]{0,8})$/.test(h.get('content-length'))) {
      return makeResponse(400, 'INVALID_REQUEST', requestId);
    }
    // Caller must supply the FULL, already bounded raw request body as Buffer.
    // Never pass a live IncomingMessage stream to this pure adapter.
    if (!Buffer.isBuffer(envelope.bodyBytes) || envelope.bodyBytes.length !== 0 ||
        (h.has('content-length') && h.get('content-length') !== '0')) {
      return makeResponse(400, 'INVALID_REQUEST', requestId);
    }
    if (envelope.method !== 'GET') return makeResponse(405, 'METHOD_NOT_ALLOWED', requestId, { Allow: 'GET' });
    if (typeof envelope.target !== 'string' || envelope.target.length > 512) {
      return makeResponse(414, 'INVALID_REQUEST', requestId);
    }
    const match = ROUTE.exec(envelope.target);
    if (!match) return makeResponse(404, 'RESOURCE_UNAVAILABLE', requestId);
    const authorization = h.get('authorization');
    if (authorization === undefined) return makeResponse(401, 'UNAUTHENTICATED', requestId);
    // Role, actor, scope, and action are NEVER taken from headers or query/body.
    const organizationId = match[1].toLowerCase();
    const siteId = match[2].toLowerCase();
    let result;
    try {
      result = await authorize({ authorization, organizationId, siteId, action: 'read', body: {} });
    } catch {
      return makeResponse(503, 'RETRY_LATER', requestId);
    }
    if (!isRecord(result)) return makeResponse(500, 'INTERNAL_ERROR', requestId);
    if (result.ok === true) {
      const context = result.context;
      // Safeguard against accidental miswiring of server authorizer.
      if (!isRecord(context) || typeof context.organizationId !== 'string' ||
          typeof context.siteId !== 'string' ||
          context.organizationId.toLowerCase() !== organizationId ||
          context.siteId.toLowerCase() !== siteId || typeof context.userId !== 'string' ||
          !context.userId || typeof context.role !== 'string' ||
          !['CLIENT_OWNER', 'CLIENT_ADMIN', 'CLIENT_EDITOR', 'CLIENT_VIEWER'].includes(context.role)) {
        return makeResponse(500, 'INTERNAL_ERROR', requestId);
      }
      // No user ID, token, role, org/site IDs, or database data in response body.
      return makeResponse(200, undefined, requestId);
    }
    const key = `${result.status}:${result.code}`;
    if (result.ok === false && Object.hasOwn(ACCEPTABLE_DENIALS, key)) {
      return makeResponse(result.status, result.code, requestId);
    }
    return makeResponse(500, 'INTERNAL_ERROR', requestId);
  };
}
module.exports = { createHttpSiteGate };
