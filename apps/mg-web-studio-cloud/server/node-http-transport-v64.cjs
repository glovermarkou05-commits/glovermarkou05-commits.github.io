'use strict';

// V64: factory for one IncomingMessage/ServerResponse pair, NOT an HTTP server.
// No listen(), network access, DB drivers, or tokens are configured here.
const { randomUUID } = require('node:crypto');
const DEFAULT_DEADLINE_MS = 3000;
const DEFAULT_MAX_BODY = 4096;
const HEADER_LIMIT = 16384;
const MAX_RAW_HEADER_ENTRIES = 64;
const HEADER_TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/;
const SAFE_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Connection': 'close'
});
const isIntIn = (n, lo, hi) => Number.isSafeInteger(n) && n >= lo && n <= hi;
function preflight(rawHeaders) {
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0 ||
      rawHeaders.length > MAX_RAW_HEADER_ENTRIES) return 400;
  const seen = new Set();
  let count = 0;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i], value = rawHeaders[i + 1];
    if (typeof name !== 'string' || !HEADER_TOKEN.test(name) ||
        typeof value !== 'string' || value.length > 8192 ||
        /[\x00-\x08\x0a-\x1f\x7f]/.test(value)) return 400;
    count += Buffer.byteLength(name) + Buffer.byteLength(value) + 4;
    if (count > HEADER_LIMIT) return 431;
    const lower = name.toLowerCase();
    if (seen.has(lower)) return 400;
    seen.add(lower);
    if (['transfer-encoding', 'expect', 'cookie', 'proxy-authorization', 'trailer', 'upgrade'].includes(lower)) return 400;
    if (lower === 'content-length' && value !== '0') return 400;
  }
  return null;
}
function createNodeHttpTransport({ gate, deadlineMs = DEFAULT_DEADLINE_MS,
  maxBodyBytes = DEFAULT_MAX_BODY, makeRequestId = randomUUID } = {}) {
  if (typeof gate !== 'function' || typeof makeRequestId !== 'function' ||
      !isIntIn(deadlineMs, 10, 30000) || !isIntIn(maxBodyBytes, 1, 8192)) {
    throw new TypeError('V64 requires a gate, bounded deadline and body limit');
  }
  return function serve(req, res) {
    return new Promise(resolve => {
      let settled = false;
      let stage = 'body';
      let timeout;
      let requestId = 'unavailable';
      try {
        const candidate = makeRequestId();
        if (typeof candidate === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(candidate)) {
          requestId = candidate;
        }
      } catch { /* Never reflect a generator exception. */ }
      const clean = () => {
        clearTimeout(timeout);
        if (req && typeof req.removeListener === 'function') {
          req.removeListener('data', onData);
          req.removeListener('end', onEnd);
          // Retain the once('error') handler to swallow later stream errors.
          req.removeListener('close', onClose);
        }
      };
      const finish = (response) => {
        if (settled) return;
        settled = true;
        clean();
        try {
          if (res && !res.destroyed && !res.writableEnded &&
              typeof res.writeHead === 'function' && typeof res.end === 'function') {
            // Only status/header/body produced by V63 or this fixed error factory.
            res.shouldKeepAlive = false;
            res.writeHead(response.status, { ...response.headers, Connection: 'close' });
            res.end(response.body);
          }
        } catch { /* Client may have disconnected. Do not disclose internals. */ }
        resolve(response.status);
      };
      const failure = (status, code) => finish({ status, headers: SAFE_HEADERS,
        body: JSON.stringify({ ok: false, code, requestId }) });
      const onData = chunk => {
        if (settled) return;
        // No body is permitted by V63. Count chunk bytes before any allocation.
        if (!Buffer.isBuffer(chunk)) return failure(400, 'INVALID_REQUEST');
        if (chunk.length > maxBodyBytes) return failure(413, 'BODY_TOO_LARGE');
        if (chunk.length !== 0) return failure(400, 'INVALID_REQUEST');
      };
      const onEnd = () => {
        if (settled) return;
        if (req.complete !== true || (Array.isArray(req.rawTrailers) && req.rawTrailers.length)) {
          return failure(400, 'INVALID_REQUEST');
        }
        stage = 'gate';
        const envelope = Object.freeze({
          method: req.method, target: req.url,
          rawHeaders: Object.freeze([...req.rawHeaders]), bodyBytes: Buffer.alloc(0)
        });
        // gate() exceptions and rejections are sanitized. Its work is NOT cancelled
        // by the deadline; a real DB adapter must enforce its own query timeout.
        Promise.resolve().then(() => gate(envelope)).then(
          result => {
            if (!result || !isIntIn(result.status, 100, 599) ||
                typeof result.body !== 'string' || !result.headers ||
                typeof result.headers !== 'object') return failure(500, 'INTERNAL_ERROR');
            // Trusted V63 should emit exact response classes; reject unknowns.
            if (![200, 400, 401, 403, 404, 405, 414, 431, 500, 503].includes(result.status)) {
              return failure(500, 'INTERNAL_ERROR');
            }
            const parsed = (() => { try { return JSON.parse(result.body); } catch { return null; } })();
            const errors = {400:['INVALID_REQUEST'],401:['UNAUTHENTICATED'],
              403:['FORBIDDEN'],404:['RESOURCE_UNAVAILABLE'],
              405:['METHOD_NOT_ALLOWED'],414:['INVALID_REQUEST'],
              431:['HEADERS_TOO_LARGE'],500:['INTERNAL_ERROR'],503:['RETRY_LATER']};
            const requestIdOk = parsed && typeof parsed.requestId === 'string' &&
              /^[A-Za-z0-9_-]{1,80}$/.test(parsed.requestId);
            const shapeOk = result.status === 200
              ? parsed && Object.keys(parsed).sort().join(',') === 'access,ok,requestId' &&
                parsed.ok === true && parsed.access === 'granted'
              : parsed && Object.keys(parsed).sort().join(',') === 'code,ok,requestId' &&
                parsed.ok === false && errors[result.status]?.includes(parsed.code);
            if (!requestIdOk || !shapeOk) return failure(500, 'INTERNAL_ERROR');
            // Do not forward untrusted arbitrary headers even if gate is miswired.
            const permitted = {};
            if (result.status === 405) permitted.Allow = 'GET';
            finish({status: result.status, headers: {...SAFE_HEADERS, ...permitted}, body:result.body});
          }, () => failure(503, 'RETRY_LATER')
        );
      };
      const onError = () => failure(400, 'INVALID_REQUEST');
      const onClose = () => {
        if (!settled && req.complete !== true) {
          // Incomplete peer disconnect: do not try to respond to the closed socket.
          settled = true;
          clean();
          resolve(null);
        }
      };
      timeout = setTimeout(() => failure(stage === 'body' ? 408 : 503,
        stage === 'body' ? 'REQUEST_TIMEOUT' : 'RETRY_LATER'), deadlineMs);
      try {
        // Install an error listener even if header preflight rejects.
        if (req && typeof req.once === 'function') req.once('error', onError);
        const status = preflight(req && req.rawHeaders);
        if (status) return failure(status, status === 431 ? 'HEADERS_TOO_LARGE' : 'INVALID_REQUEST');
        if (typeof req.on !== 'function' || typeof req.removeListener !== 'function' ||
            typeof res.writeHead !== 'function' || typeof res.end !== 'function') {
          return failure(400, 'INVALID_REQUEST');
        }
        req.on('data', onData);
        req.once('end', onEnd);
        req.once('close', onClose);
        // Fail closed if the stream ended before handlers could be registered.
        if (req.readableEnded === true) return failure(400, 'INVALID_REQUEST');
      } catch {
        failure(400, 'INVALID_REQUEST');
      }
    });
  };
}
module.exports = { createNodeHttpTransport };
