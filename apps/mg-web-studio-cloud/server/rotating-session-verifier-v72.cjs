'use strict';

// Offline-first trust boundary: providers are explicit, server-owned callbacks.
// No network clients, HTTP listeners, Supabase credentials or SQL inside V72.
const { createJwtPublicVerifierV71 } = require('./jwt-public-verifier-v71.cjs');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const NO_GO = Object.freeze({ environment: 'SYNTHETIC_ONLY',
  jwksNetworkConnected: false, sessionStoreConnected: false,
  realSessionRevocationVerified: false, deploymentAuthorized: false, decision: 'NO_GO' });
const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const bounded = (n,min,max) => Number.isSafeInteger(n) && n >= min && n <= max;
function safePayload(token) {
  try {
    if (typeof token !== 'string' || token.length > 8192) return null;
    const segments = token.split('.');
    if (segments.length !== 3 || !/^[A-Za-z0-9_-]{1,6000}$/.test(segments[1])) return null;
    const bytes = Buffer.from(segments[1], 'base64url');
    if (bytes.length > 4096 || bytes.toString('base64url') !== segments[1]) return null;
    const parsed = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    return isRecord(parsed) && UUID.test(parsed.session_id) ? parsed : null;
  } catch { return null; }
}
function normalizeKeys(document) {
  if (!isRecord(document) || Object.keys(document).length !== 1 ||
      !Array.isArray(document.keys) || document.keys.length < 1 || document.keys.length > 8) {
    throw new TypeError('Invalid trusted public key snapshot');
  }
  const known = new Set();
  return document.keys.map(x => {
    if (!isRecord(x) || Object.keys(x).some(k => !['kid','alg','jwk'].includes(k)) ||
        !ID.test(x.kid) || !['ES256','RS256'].includes(x.alg) ||
        !isRecord(x.jwk) || known.has(x.kid)) throw new TypeError('Invalid key entry');
    known.add(x.kid);
    return x;
  });
}
function createRotatingSessionVerifierV72({issuer, audience, loadPublicKeys,
  checkSession, nowSec = () => Math.floor(Date.now()/1000),
  refreshIntervalSec = 300, maxTokenAgeSec = 3600} = {}) {
  if (typeof issuer !== 'string' || !issuer || typeof audience !== 'string' || !audience ||
      typeof loadPublicKeys !== 'function' || typeof checkSession !== 'function' ||
      typeof nowSec !== 'function' || !bounded(refreshIntervalSec, 10, 3600) ||
      !bounded(maxTokenAgeSec, 60, 86400)) throw new TypeError('Trusted providers required');
  // Validate static issuer/audience immediately rather than on the first request.
  let url;
  try { url = new URL(issuer); } catch { throw new TypeError('Invalid issuer'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      url.href !== issuer || audience.length > 256) throw new TypeError('Invalid issuer or audience');
  let generation = 0, active = null, loading = null;
  function invalidateKeys() {
    generation++;
    active = null;
    loading = null;
  }
  async function snapshot() {
    let now;
    try { now = nowSec(); } catch { invalidateKeys(); return null; }
    if (!bounded(now, 1, Number.MAX_SAFE_INTEGER)) { invalidateKeys(); return null; }
    if (active && now >= active.loadedAt && now - active.loadedAt < refreshIntervalSec) return active;
    if (active && now < active.loadedAt) { invalidateKeys(); return null; }
    if (loading) return loading;
    const expected = generation;
    const pending = (async () => {
      try {
        const keys = normalizeKeys(await loadPublicKeys());
        const verifier = createJwtPublicVerifierV71({issuer,audience,publicKeys:keys,
          maxTokenAgeSec,nowSec});
        const at = nowSec();
        if (expected !== generation || !bounded(at, 1, Number.MAX_SAFE_INTEGER) ||
            at < now) return null;
        const item = Object.freeze({loadedAt:at, verifier, generation:expected});
        active = item;
        return item;
      } catch {
        if (expected === generation) active = null; // never use a stale snapshot
        return null;
      }
    })();
    loading = pending;
    try { return await pending; }
    finally { if (loading === pending) loading = null; }
  }
  async function verifyAccessToken(token) {
    const keys = await snapshot();
    if (!keys || keys.generation !== generation) return null;
    let identity;
    try { identity = await keys.verifier(token); } catch { return null; }
    if (!identity || identity.verified !== true || !UUID.test(identity.subject) ||
        keys.generation !== generation) return null;
    // A session_id is never trusted before signature/time/issuer/audience verification.
    const payload = safePayload(token);
    if (!payload || payload.sub !== identity.subject) return null;
    let session;
    try { session = await checkSession(Object.freeze({
      sessionId: payload.session_id, subject: identity.subject
    })); } catch { return null; }
    if (keys.generation !== generation || !isRecord(session) || session.active !== true ||
        session.sessionId !== payload.session_id || session.subject !== identity.subject) return null;
    return Object.freeze({verified:true,subject:identity.subject});
  }
  return Object.freeze({ verifyAccessToken, invalidateKeys, readiness: NO_GO });
}
module.exports = { createRotatingSessionVerifierV72 };
