'use strict';

// Test-only preload: trips immediately on attempted TCP/UDP networking.
// This is defense-in-depth for native Node tests, NOT an OS sandbox.
const net = require('node:net');
const dgram = require('node:dgram');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const http2 = require('node:http2');
const MARK = Symbol.for('mg.cloud.v70.networkGuard');
if (process[MARK]) {
  module.exports = process[MARK];
} else {
  const blocked = Object.freeze({ code: 'V70_NETWORK_FORBIDDEN', message: 'V70 isolated Node tests cannot use network APIs' });
  function deny() {
    const error = new Error(blocked.message);
    error.code = blocked.code;
    throw error;
  }
  // Avoid wrapping twice, because tests may load this module through --require.
  net.Server.prototype.listen = deny;
  net.Socket.prototype.connect = deny;
  net.createConnection = deny;
  net.connect = deny;
  tls.connect = deny;
  http.request = deny;
  http.get = deny;
  https.request = deny;
  https.get = deny;
  http2.connect = deny;
  dgram.Socket.prototype.bind = deny;
  dgram.Socket.prototype.send = deny;
  dgram.createSocket = deny;
  // Named requirements in other modules may have captured references before
  // this preload. Load as the first --require argument in a fresh process.
  const guard = Object.freeze({ active: true, code: blocked.code, preloaded: true });
  process[MARK] = guard;
  module.exports = guard;
}
