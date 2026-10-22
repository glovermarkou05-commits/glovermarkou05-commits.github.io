'use strict';

// V65: unbound HTTP/1.1 server blueprint. NO createServer(), listen(), sockets,
// env, credentials or backend connection. Caller supplies V64's serve(req,res).
const OPTIONS = Object.freeze({
  insecureHTTPParser: false,
  joinDuplicateHeaders: false,
  requireHostHeader: true,
  maxHeaderSize: 16384,
  headersTimeout: 5000,
  requestTimeout: 10000,
  keepAliveTimeout: 1000,
  connectionsCheckingInterval: 1000,
  noDelay: true,
  rejectNonStandardBodyWrites: true
});
const SAFE_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  Connection: 'close'
});
const RESPONSES = Object.freeze({
  417: JSON.stringify({ ok: false, code: 'EXPECTATION_FAILED', requestId: 'unavailable' }),
  503: JSON.stringify({ ok: false, code: 'RETRY_LATER', requestId: 'unavailable' })
});
function respond(res, status) {
  try {
    if (!res || res.destroyed || res.writableEnded || res.headersSent ||
        typeof res.writeHead !== 'function' || typeof res.end !== 'function') return;
    res.shouldKeepAlive = false;
    res.writeHead(status, SAFE_HEADERS);
    res.end(RESPONSES[status]);
  } catch { /* Socket may already be closed; never log secrets. */ }
}
function rejectSocket(socket) {
  try {
    if (socket && typeof socket.destroy === 'function' && !socket.destroyed) socket.destroy();
  } catch { /* Do not fail open. */ }
}
function rejectParserError(error, socket) {
  // The request was never safely parsed. Do not forward error.rawPacket or headers.
  try {
    if (!socket || socket.destroyed) return;
    const status = error && error.code === 'HPE_HEADER_OVERFLOW' ? 431 : 400;
    if (socket.writable && typeof socket.end === 'function') {
      const text = status === 431 ? 'Request Header Fields Too Large' : 'Bad Request';
      socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    } else rejectSocket(socket);
  } catch { rejectSocket(socket); }
}
function createHttpServerBlueprint({ serve } = {}) {
  if (typeof serve !== 'function') throw new TypeError('V64 transport handler required');
  const configured = new WeakSet();
  async function onRequest(req, res) {
    try {
      await serve(req, res);
    } catch {
      // V64 should handle its own errors. This is only last-resort defense.
      respond(res, 503);
    }
  }
  function configure(server) {
    // Refuse a live server: all policy must be attached before a future listen().
    if (!server || typeof server !== 'object' || server.listening !== false ||
        typeof server.on !== 'function' || typeof server.setTimeout !== 'function') {
      throw new TypeError('An unbound Node HTTP server is required');
    }
    if (configured.has(server)) return server;
    server.maxHeadersCount = 32;
    server.maxRequestsPerSocket = 1;
    server.keepAliveTimeout = 1000;
    server.headersTimeout = OPTIONS.headersTimeout;
    server.requestTimeout = OPTIONS.requestTimeout;
    server.on('clientError', rejectParserError);
    server.on('upgrade', (_req, socket) => rejectSocket(socket));
    server.on('connect', (_req, socket) => rejectSocket(socket));
    server.on('checkContinue', (_req, res) => respond(res, 417));
    server.on('checkExpectation', (_req, res) => respond(res, 417));
    server.on('dropRequest', (_req, res) => respond(res, 503));
    server.setTimeout(5000, rejectSocket);
    configured.add(server);
    return server;
  }
  return Object.freeze({ options: OPTIONS, onRequest, configure });
}
module.exports = { createHttpServerBlueprint };
