'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { createHttpServerBlueprint } = require('../server/http-server-blueprint-v65.cjs');

function server() {
  const s = new EventEmitter();
  s.listening = false;
  s.setTimeout = (ms, cb) => { s.timeoutMs = ms; s.timeoutFn = cb; return s; };
  return s;
}
function response() {
  return { destroyed: false, writableEnded: false, headersSent: false, writes: 0,
    shouldKeepAlive: true, writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true; },
    end(body) { this.body = body; this.writes++; this.writableEnded = true; } };
}
function socket(writable = true) {
  return { writable, destroyed: false, destroyedCount: 0, endCount: 0,
    destroy() { this.destroyed = true; this.destroyedCount++; },
    end(data) { this.output = data; this.endCount++; this.destroyed = true; } };
}
const setup = (serve = async () => undefined) => {
  const plan = createHttpServerBlueprint({ serve });
  const s = server();
  plan.configure(s);
  return { plan, s };
};

test('requires explicit V64 handler; never uses permissive default', () => {
  assert.throws(() => createHttpServerBlueprint(), TypeError);
  assert.throws(() => createHttpServerBlueprint({ serve: 4 }), TypeError);
});
test('construction is pure and creates no listening network server', () => {
  let called = 0;
  const plan = createHttpServerBlueprint({serve: () => {called++;}});
  assert.equal(called, 0);
  assert.deepEqual(Object.keys(plan), ['options', 'onRequest', 'configure']);
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.options));
});
test('options enforce strict HTTP parser and duplicate-header policy', () => {
  const {options} = setup().plan;
  assert.equal(options.insecureHTTPParser, false);
  assert.equal(options.joinDuplicateHeaders, false);
  assert.equal(options.requireHostHeader, true);
  assert.equal(options.maxHeaderSize, 16384);
  assert.equal(options.rejectNonStandardBodyWrites, true);
});
test('request and header timeout policy follows expected order', () => {
  const {options} = setup().plan;
  assert.equal(options.headersTimeout, 5000);
  assert.equal(options.requestTimeout, 10000);
  assert.ok(options.headersTimeout <= options.requestTimeout);
  assert.equal(options.keepAliveTimeout, 1000);
  assert.equal(options.connectionsCheckingInterval, 1000);
});
test('rejects configuring a server already listening or wrong adapter', () => {
  const plan = createHttpServerBlueprint({serve: async () => undefined});
  for (const bad of [null, undefined, {}, { listening: true, on() {}, setTimeout() {} }, {listening: false, on() {} }]) {
    assert.throws(() => plan.configure(bad), TypeError);
  }
});
test('configures max header counts and max requests per socket', () => {
  const {s} = setup();
  assert.equal(s.maxHeadersCount,32);
  assert.equal(s.maxRequestsPerSocket,1);
  assert.equal(s.keepAliveTimeout,1000);
  assert.equal(s.headersTimeout,5000);
  assert.equal(s.requestTimeout,10000);
  assert.equal(s.timeoutMs,5000);
  assert.equal(s.listening,false);
});
test('configure attaches exactly one callback for each security event', () => {
  const {s, plan} = setup();
  for (const event of ['clientError','upgrade','connect','checkContinue','checkExpectation','dropRequest']) {
    assert.equal(s.listenerCount(event), 1, event);
  }
  assert.equal(plan.configure(s),s);
  assert.equal(s.listenerCount('clientError'),1);
});
test('client parser error uses generic HTTP/1.1 400; does not echo secrets', () => {
  const {s}=setup(); const sock=socket();
  s.emit('clientError', { code:'HPE_INVALID_HEADER_TOKEN', rawPacket: Buffer.from('Authorization: SECRET') },sock);
  assert.match(sock.output,/^HTTP\/1\.1 400 Bad Request\r\n/);
  assert.doesNotMatch(sock.output,/SECRET/);
  assert.match(sock.output,/Content-Length: 0/);
  assert.match(sock.output,/Connection: close/);
});
test('client header overflow receives generic 431', () => {
  const {s}=setup(); const sock=socket();
  s.emit('clientError',{code:'HPE_HEADER_OVERFLOW',rawPacket:'PRIVATE'},sock);
  assert.match(sock.output,/^HTTP\/1\.1 431 Request Header Fields Too Large/);
  assert.doesNotMatch(sock.output,/PRIVATE/);
});
test('unwritable or disconnected parser socket is destroyed safely', () => {
  const {s}=setup();const sock=socket(false);
  s.emit('clientError',{code:'HPE_INVALID_EOF_STATE'},sock);
  assert.equal(sock.destroyedCount,1);
  s.emit('clientError',{},sock);
  assert.equal(sock.destroyedCount,1);
});
test('clientError with null socket does not throw', () => {
  assert.doesNotThrow(()=>setup().s.emit('clientError',{code:'TEST'},null));
});
test('websocket upgrades and CONNECT tunneling are refused', () => {
  const {s}=setup();
  for (const event of ['upgrade','connect']) {
    const sock=socket(); s.emit(event,{},sock,Buffer.from('SENSITIVE'));
    assert.equal(sock.destroyedCount,1);
    assert.equal(sock.endCount,0);
  }
});
test('Expect: 100-continue is rejected; V64 handler is not called', () => {
  let calls=0;const {s}=setup(async()=>{calls++;}); const res=response();
  s.emit('checkContinue',{},res);
  assert.equal(res.status,417);
  assert.equal(JSON.parse(res.body).code,'EXPECTATION_FAILED');
  assert.equal(calls,0);
});
test('unknown expectation receives same safe rejection', () => {
  const {s}=setup();const res=response();s.emit('checkExpectation',{},res);
  assert.equal(res.status,417); assert.equal(res.headers['Cache-Control'],'no-store');
});
test('dropRequest rejects with 503, not a request handler continuation', () => {
  let calls=0;const {s}=setup(async()=>{calls++;});const res=response();
  s.emit('dropRequest',{},res);
  assert.equal(res.status,503);
  assert.deepEqual(JSON.parse(res.body),{ok:false,code:'RETRY_LATER',requestId:'unavailable'});
  assert.equal(calls,0);
});
test('responses cannot write again to a completed or destroyed socket', () => {
  const {s}=setup();for(const opts of [{writableEnded:true},{destroyed:true},{headersSent:true}]) {
    const res=Object.assign(response(),opts);
    s.emit('checkContinue',{},res);
    assert.equal(res.writes,0);
  }
});
test('idle socket timeout destroys socket', () => {
  const {s}=setup();const sock=socket(); s.timeoutFn(sock);
  assert.equal(sock.destroyedCount,1);
});
test('transport success passes req/res without mutation by blueprint', async () => {
  const req={rawHeaders:['Authorization','Bearer fake']},res=response();
  let received;
  const p=createHttpServerBlueprint({serve: async (a,b) => { received=[a,b]; b.writeHead(204,{}); b.end(''); }});
  await p.onRequest(req,res);
  assert.deepEqual(received,[req,res]); assert.equal(res.status,204);
});
test('transport exception returns sanitized 503 when no headers sent', async () => {
  const p=createHttpServerBlueprint({serve: async()=>{throw Error('DATABASE_SECRET');}});
  const res=response();await p.onRequest({},res);
  assert.equal(res.status,503);
  assert.equal(JSON.parse(res.body).code,'RETRY_LATER');
  assert.ok(!res.body.includes('SECRET'));
});
test('exception after response completed never writes a second response', async () => {
  const p=createHttpServerBlueprint({serve: async(req,res)=>{res.writeHead(200,{});res.end('{}');throw Error('PRIVATE');}});
  const res=response();await p.onRequest({},res);
  assert.equal(res.writes,1);assert.equal(res.status,200);
});
test('actual Node HTTP Server can be constructed unbound without listening', () => {
  const plan=createHttpServerBlueprint({serve: async()=>undefined});
  const srv=http.createServer(plan.options,plan.onRequest);
  plan.configure(srv);
  assert.equal(srv.listening,false);
  assert.equal(srv.maxHeadersCount,32);
  assert.equal(srv.maxRequestsPerSocket,1);
  assert.equal(srv.listenerCount('clientError'),1);
  // No listen() is ever invoked in this suite.
});
