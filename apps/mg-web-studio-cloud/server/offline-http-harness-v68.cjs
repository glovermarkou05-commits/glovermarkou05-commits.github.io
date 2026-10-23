'use strict';

// V68: in-process Node event harness, NOT an HTTP wire-protocol/parser test.
// No http.createServer, listen, net sockets, HTTP client or database connections.
const { EventEmitter } = require('node:events');
const ID = /^[A-Z][A-Z0-9_-]{1,63}$/;
const METHODS = new Set(['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE']);
const KINDS = Object.freeze({ evidenceClass: 'SYNTHETIC_NODE_EVENTS', realHttp: false,
  realParser: false, realAuth: false, realDatabase: false, recoveryVerified: false });
const FIELDS = new Set(['id', 'method', 'target', 'rawHeaders', 'chunkSizes', 'expectedStatus', 'peer']);
const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v));
const goodInt = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
function validate(spec) {
  if (!isRecord(spec) || Object.keys(spec).some(k => !FIELDS.has(k)) ||
      !ID.test(spec.id || '') || !METHODS.has(spec.method) ||
      typeof spec.target !== 'string' || spec.target.length > 512 ||
      !Array.isArray(spec.rawHeaders) || spec.rawHeaders.length > 64 ||
      spec.rawHeaders.length % 2 !== 0 ||
      !spec.rawHeaders.every(v => typeof v === 'string' && v.length <= 16384) ||
      !Array.isArray(spec.chunkSizes) || spec.chunkSizes.length > 4 ||
      !spec.chunkSizes.every(n => goodInt(n, 0, 8192)) ||
      !goodInt(spec.expectedStatus, 100, 599) ||
      (spec.peer !== undefined && spec.peer !== 'loopback-a' && spec.peer !== 'loopback-b')) {
    throw new TypeError('Invalid V68 synthetic test case');
  }
}
function createOfflineHttpHarness({ onRequest, deadlineMs = 1000 } = {}) {
  if (typeof onRequest !== 'function' || !goodInt(deadlineMs, 10, 5000)) {
    throw new TypeError('A server request handler and a bounded deadline are required');
  }
  async function runCase(spec) {
    validate(spec);
    // No caller-provided real remoteAddress. Test-only local loopback choices.
    const req = Object.assign(new EventEmitter(), {
      method: spec.method, url: spec.target,
      rawHeaders: [...spec.rawHeaders], rawTrailers: [],
      complete: false, readableEnded: false,
      socket: { remoteAddress: spec.peer === 'loopback-b' ? '127.0.0.2' : '127.0.0.1' }
    });
    const response = { destroyed: false, writableEnded: false, headersSent: false,
      status: null, responseWrites: 0,
      writeHead(status) { this.status = status; this.headersSent = true; },
      end() { this.writableEnded = true; this.responseWrites++; }
    };
    // A test EventEmitter has no network parser or socket. Error handler avoids
    // unhandled synthetic late errors, but does not prove real TCP behavior.
    req.on('error', () => {});
    const completion = Promise.resolve().then(() => onRequest(req, response));
    // Allow an async onRequest shim to install its 'data' and 'end' listeners.
    await Promise.resolve();
    for (const length of spec.chunkSizes) req.emit('data', Buffer.alloc(length));
    req.complete = true;
    req.readableEnded = true;
    req.emit('end');
    let timer;
    const handlerFinished = await Promise.race([
      completion.then(() => true, () => false),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), deadlineMs); })
    ]);
    clearTimeout(timer);
    // A timed-out synthetic handler may still be running. This timeout is NOT
    // cancellation of network/database work and cannot certify availability.
    const observedStatus = handlerFinished ? response.status : null;
    // Never return request URL, peer, headers, body, tokens or exception text.
    return Object.freeze({ id: spec.id, expectedStatus: spec.expectedStatus,
      observedStatus, matched: observedStatus === spec.expectedStatus && response.responseWrites === 1,
      evidenceClass: KINDS.evidenceClass, realHttp: false });
  }
  async function runSuite(cases) {
    if (!Array.isArray(cases) || cases.length > 64) throw new TypeError('Invalid V68 suite');
    const ids = new Set();
    // Validate all cases before running the first, avoiding partial suite execution.
    for (const item of cases) {
      validate(item);
      if (ids.has(item.id)) throw new TypeError('Duplicate V68 case');
      ids.add(item.id);
    }
    const results = [];
    for (const item of cases) results.push(await runCase(item));
    const passed = results.filter(x => x.matched).length;
    return Object.freeze({ ...KINDS, total: results.length, passed,
      failed: results.length - passed, results: Object.freeze(results),
      // A matching synthetic suite must never be promoted to a release approval.
      decision: 'NO_GO', v67OperationalCasesPassed: 0 });
  }
  return Object.freeze({ runCase, runSuite });
}
module.exports = { createOfflineHttpHarness };
