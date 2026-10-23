'use strict';

// V71: offline asymmetric JWT signature verifier. No JWKS fetch, secrets or I/O.
// Only returns a verified UUID subject to V60. Never trusts token roles/MFA.
const { createPublicKey, verify, constants } = require('node:crypto');
const URL64 = /^[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Za-z0-9_-]{1,80}$/;
const ALG = new Set(['ES256', 'RS256']);
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const intRange = (x, min, max) => Number.isSafeInteger(x) && x >= min && x <= max;
function decode(segment, maxBytes) {
  if (typeof segment !== 'string' || segment.length > maxBytes * 2 ||
      !URL64.test(segment)) return null;
  const bytes = Buffer.from(segment, 'base64url');
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64url') !== segment) return null;
  return bytes;
}
function parse(segment, maxBytes) {
  const bytes = decode(segment, maxBytes);
  if (!bytes) return null;
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return isObject(value) ? value : null;
  } catch { return null; }
}
function isPublicJwk(jwk, alg) {
  if (!isObject(jwk)) return false;
  // Reject secrets even if createPublicKey could derive a public component.
  if (['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(k => Object.hasOwn(jwk, k))) return false;
  if (jwk.use !== undefined && jwk.use !== 'sig') return false;
  if (jwk.key_ops !== undefined &&
      (!Array.isArray(jwk.key_ops) || jwk.key_ops.length !== 1 || jwk.key_ops[0] !== 'verify')) return false;
  if (jwk.alg !== undefined && jwk.alg !== alg) return false;
  if (alg === 'RS256') return jwk.kty === 'RSA' && typeof jwk.n === 'string' && typeof jwk.e === 'string' &&
    decode(jwk.n, 1024) !== null && decode(jwk.e, 8) !== null;
  return jwk.kty === 'EC' && jwk.crv === 'P-256' &&
    typeof jwk.x === 'string' && typeof jwk.y === 'string' &&
    decode(jwk.x, 32)?.length === 32 && decode(jwk.y, 32)?.length === 32;
}
function importKey(entry) {
  if (!isObject(entry) || !KEY_ID.test(entry.kid) || !ALG.has(entry.alg) ||
      !isPublicJwk(entry.jwk, entry.alg)) throw new TypeError('Invalid public signing key');
  const raw = entry.jwk;
  const publicJwk = entry.alg === 'RS256'
    ? {kty:'RSA', n:raw.n, e:raw.e}
    : {kty:'EC', crv:'P-256', x:raw.x, y:raw.y};
  let key;
  try { key = createPublicKey({key: publicJwk, format:'jwk'}); }
  catch { throw new TypeError('Invalid public signing key'); }
  if (entry.alg === 'RS256' &&
      (key.asymmetricKeyType !== 'rsa' || !intRange(key.asymmetricKeyDetails?.modulusLength, 2048, 8192)))
    throw new TypeError('RSA signing key is too weak');
  if (entry.alg === 'ES256' &&
      (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1'))
    throw new TypeError('EC signing key must use P-256');
  return Object.freeze({kid:entry.kid, alg:entry.alg, key});
}
function createJwtPublicVerifierV71({issuer, audience, publicKeys,
  maxTokenAgeSec = 3600, clockToleranceSec = 0, nowSec = () => Math.floor(Date.now()/1000)} = {}) {
  if (typeof issuer !== 'string' || issuer.length > 512 ||
      typeof audience !== 'string' || !audience.trim() || audience.length > 256 ||
      typeof nowSec !== 'function' ||
      !intRange(maxTokenAgeSec, 60, 86400) || !intRange(clockToleranceSec, 0, 60) ||
      !Array.isArray(publicKeys) || publicKeys.length === 0 || publicKeys.length > 8) {
    throw new TypeError('Explicit issuer, audience and bounded public keys required');
  }
  let url;
  try { url = new URL(issuer); } catch { throw new TypeError('Invalid HTTPS issuer'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      url.search || url.hash || url.href !== issuer) throw new TypeError('Invalid HTTPS issuer');
  const trusted = new Map();
  for (const entry of publicKeys) {
    const item = importKey(entry);
    if (trusted.has(item.kid)) throw new TypeError('Duplicate signing key identifier');
    trusted.set(item.kid, item);
  }
  return async function verifyAccessToken(token) {
    if (typeof token !== 'string' || token.length > 8192 || token.length < 20) return null;
    const segments = token.split('.');
    if (segments.length !== 3) return null;
    const [first, second, third] = segments;
    const header = parse(first, 1024), payload = parse(second, 4096);
    if (!header || !payload || Object.keys(header).some(k => !['alg','kid','typ'].includes(k)) ||
        header.typ !== 'JWT' || !KEY_ID.test(header.kid) || !ALG.has(header.alg)) return null;
    const selected = trusted.get(header.kid);
    if (!selected || selected.alg !== header.alg) return null;
    const signature = decode(third, 1024);
    if (!signature || (header.alg === 'ES256' && signature.length !== 64) ||
        (header.alg === 'RS256' && signature.length !== selected.key.asymmetricKeyDetails?.modulusLength/8)) return null;
    try {
      const signed = Buffer.from(first + '.' + second, 'ascii');
      const options = header.alg === 'ES256'
        ? {key:selected.key, dsaEncoding:'ieee-p1363'}
        : {key:selected.key, padding:constants.RSA_PKCS1_PADDING};
      if (!verify('sha256', signed, options, signature)) return null;
      let now = nowSec();
      if (!intRange(now, 0, Number.MAX_SAFE_INTEGER)) return null;
      if (payload.iss !== issuer || !UUID.test(payload.sub) ||
          !((typeof payload.aud === 'string' && payload.aud === audience) ||
            (Array.isArray(payload.aud) && payload.aud.length > 0 && payload.aud.length <= 8 &&
             payload.aud.every(x => typeof x === 'string') && payload.aud.includes(audience))) ||
          !intRange(payload.exp, 1, Number.MAX_SAFE_INTEGER) ||
          !intRange(payload.iat, 1, Number.MAX_SAFE_INTEGER) ||
          payload.exp <= payload.iat || payload.exp - payload.iat > maxTokenAgeSec ||
          payload.iat > now + clockToleranceSec || now >= payload.exp + clockToleranceSec ||
          (payload.nbf !== undefined &&
            (!intRange(payload.nbf, 1, Number.MAX_SAFE_INTEGER) ||
             payload.nbf > now + clockToleranceSec || payload.nbf > payload.exp))) return null;
      return Object.freeze({verified:true, subject:payload.sub});
    } catch { return null; }
  };
}
module.exports = {createJwtPublicVerifierV71};
