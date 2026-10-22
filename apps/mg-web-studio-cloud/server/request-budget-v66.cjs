'use strict';

// V66: server-side, process-local admission guard for V64/V65, no listener or I/O.
// NOT a distributed rate limiter, reverse-proxy policy, firewall or SQL timeout.
const { isIP } = require('node:net');
const { performance } = require('node:perf_hooks');
const HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  Connection: 'close'
});
const integerBetween = (n, low, high) => Number.isSafeInteger(n) && n >= low && n <= high;
const EVENTS = new Set(['admitted', 'rate_limited', 'overloaded', 'peer_capacity', 'completed', 'transport_error']);
function timeBucket(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 0;
  if (ms < 10) return 0;
  if (ms < 100) return 10;
  if (ms < 1000) return 100;
  if (ms < 10000) return 1000;
  return 10000;
}
function createRequestBudget({ serve, maxConcurrent = 8, maxRequestsPerPeer = 30,
  windowMs = 60000, maxPeers = 256, now = () => performance.now(), observe = () => {} } = {}) {
  if (typeof serve !== 'function' || typeof now !== 'function' || typeof observe !== 'function' ||
      !integerBetween(maxConcurrent, 1, 512) || !integerBetween(maxRequestsPerPeer, 1, 10000) ||
      !integerBetween(windowMs, 1000, 3600000) || !integerBetween(maxPeers, 1, 4096)) {
    throw new TypeError('Explicit transport and bounded V66 admission policy required');
  }
  const buckets = new Map();
  let inFlight = 0;
  function emit(event, status, elapsedMs = 0) {
    if (!EVENTS.has(event)) return;
    // Closed schema: never pass request, headers, origin, user, path or token.
    try { observe(Object.freeze({ event, status, durationBucketMs: timeBucket(elapsedMs) })); } catch { /* fail closed log */ }
  }
  function deny(res, status, code, event, start, retryAfter = false) {
    const headers = retryAfter
      ? { ...HEADERS, 'Retry-After': String(Math.ceil(windowMs / 1000)) } : HEADERS;
    try {
      if (res && !res.destroyed && !res.writableEnded && !res.headersSent &&
          typeof res.writeHead === 'function' && typeof res.end === 'function') {
        res.shouldKeepAlive = false;
        res.writeHead(status, headers);
        res.end(JSON.stringify({ ok: false, code, requestId: 'unavailable' }));
      }
    } catch { /* disconnected */ }
    emit(event, status, 0);
    return status;
  }
  function peerKey(req) {
    let address;
    try { address = req && req.socket && req.socket.remoteAddress; } catch { /* invalid */ }
    // Only the direct socket peer is used; never X-Forwarded-For or client headers.
    return typeof address === 'string' && isIP(address) ? address : 'unknown';
  }
  function prune(t) {
    // Sweep only on capacity pressure; memory stays bounded by maxPeers.
    for (const [key, record] of buckets) {
      if (t >= record.start && t - record.start >= windowMs && record.inFlight === 0) {
        buckets.delete(key);
      }
    }
  }
  async function guardedServe(req, res) {
    let stamp;
    try { stamp = now(); } catch { stamp = NaN; }
    if (!Number.isFinite(stamp) || stamp < 0) {
      return deny(res, 503, 'RETRY_LATER', 'transport_error', 0);
    }
    if (inFlight >= maxConcurrent) {
      return deny(res, 503, 'RETRY_LATER', 'overloaded', stamp);
    }
    const peer = peerKey(req);
    let record = buckets.get(peer);
    if (!record) {
      if (buckets.size >= maxPeers) prune(stamp);
      if (buckets.size >= maxPeers) {
        return deny(res, 503, 'RETRY_LATER', 'peer_capacity', stamp);
      }
      record = { start: stamp, count: 0, inFlight: 0 };
      buckets.set(peer, record);
    }
    if (stamp >= record.start && stamp - record.start >= windowMs) {
      record.start = stamp;
      record.count = 0;
    }
    if (record.count >= maxRequestsPerPeer) {
      return deny(res, 429, 'RATE_LIMITED', 'rate_limited', stamp, true);
    }
    record.count++;
    record.inFlight++;
    inFlight++;
    emit('admitted', 0);
    let status = null;
    try {
      // Direct callback to V64. It must enforce body/stream timeouts itself.
      const result = await serve(req, res);
      status = Number.isSafeInteger(result) && result >= 100 && result <= 599 ? result : null;
      return result;
    } catch {
      status = 503;
      return deny(res, 503, 'RETRY_LATER', 'transport_error', stamp);
    } finally {
      record.inFlight--;
      inFlight--;
      let end;
      try { end = now(); } catch { end = stamp; }
      emit('completed', status, Number.isFinite(end) ? Math.max(0, end - stamp) : 0);
    }
  }
  // No public mutation, bucket inspection, IP output or bypass switches.
  return guardedServe;
}

module.exports = { createRequestBudget };
