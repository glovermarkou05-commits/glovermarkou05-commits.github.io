'use strict';

// V73 composes V72 with bounded providers. No network/database adapters are
// supplied by this module; callers inject trusted, read-only callbacks.
const { createBoundedProviderV73 } = require('./bounded-provider-v73.cjs');
const { createRotatingSessionVerifierV72 } = require('./rotating-session-verifier-v72.cjs');
const ALLOWED = new Set(['issuer', 'audience', 'loadPublicKeys', 'checkSession', 'nowSec',
  'nowMs', 'refreshIntervalSec', 'maxTokenAgeSec', 'keyTimeoutMs', 'sessionTimeoutMs',
  'keyConcurrent', 'sessionConcurrent', 'failureThreshold', 'cooldownMs', 'observe']);
const NO_GO = Object.freeze({environment:'SYNTHETIC_ONLY', networkConnected:false,
  sessionDatabaseConnected:false, timeoutCancelsUncooperativeWork:false,
  deploymentAuthorized:false, decision:'NO_GO'});
function createResilientSessionVerifierV73(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(options)) ||
      Object.keys(options).some(k => !ALLOWED.has(k)) ||
      typeof options.loadPublicKeys !== 'function' ||
      typeof options.checkSession !== 'function' ||
      (options.observe !== undefined && typeof options.observe !== 'function')) {
    throw new TypeError('Trusted read-only key and session providers required');
  }
  const common = {
    ...(options.nowMs !== undefined ? {nowMs:options.nowMs} : {}),
    ...(options.failureThreshold !== undefined ? {failureThreshold:options.failureThreshold} : {}),
    ...(options.cooldownMs !== undefined ? {cooldownMs:options.cooldownMs} : {})
  };
  function audit(provider) {
    return event => {
      try { options.observe?.(Object.freeze({ provider, event:event.event,
        active:event.active, circuit:event.circuit })); } catch { /* ignore telemetry */ }
    };
  }
  const keys = createBoundedProviderV73({run:(_input, ctx) => options.loadPublicKeys(ctx),
    timeoutMs: options.keyTimeoutMs ?? 500, maxConcurrent: options.keyConcurrent ?? 1,
    onAudit:audit('keys'), ...common});
  const sessions = createBoundedProviderV73({run:(input, ctx) => options.checkSession(input,ctx),
    timeoutMs: options.sessionTimeoutMs ?? 500, maxConcurrent: options.sessionConcurrent ?? 8,
    onAudit:audit('session'), ...common});
  const verified = createRotatingSessionVerifierV72({
    issuer:options.issuer, audience:options.audience,
    loadPublicKeys: () => keys.execute(null),
    checkSession: input => sessions.execute(input),
    ...(options.nowSec !== undefined ? {nowSec:options.nowSec} : {}),
    ...(options.refreshIntervalSec !== undefined ? {refreshIntervalSec:options.refreshIntervalSec} : {}),
    ...(options.maxTokenAgeSec !== undefined ? {maxTokenAgeSec:options.maxTokenAgeSec} : {})
  });
  return Object.freeze({verifyAccessToken:verified.verifyAccessToken,
    invalidateKeys:verified.invalidateKeys,
    providerStatus:() => Object.freeze({keys:keys.status(), session:sessions.status()}),
    readiness:NO_GO});
}
module.exports = {createResilientSessionVerifierV73};
