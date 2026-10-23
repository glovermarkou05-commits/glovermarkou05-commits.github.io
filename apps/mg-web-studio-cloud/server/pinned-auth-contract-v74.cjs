'use strict';

// V74: transport-neutral, fail-closed contracts. Never performs I/O directly.
// requestJwks/readSession MUST be injected from a trusted server-side adapter.
// The adapter, not this module, must enforce TLS, DNS, no redirects and timeouts.
const {isIP} = require('node:net');
const {createResilientSessionVerifierV73} = require('./resilient-session-verifier-v73.cjs');
const KEY_ID = /^[a-zA-Z0-9_-]{1,80}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const integer = (x,a,b) => Number.isSafeInteger(x) && x>=a && x<=b;
const allowedOptions = new Set(['issuer','audience','requestJwks','readSession','nowSec',
  'maxJwksBytes','maxSessionStalenessSec','nowMs','refreshIntervalSec','maxTokenAgeSec',
  'keyTimeoutMs','sessionTimeoutMs','keyConcurrent','sessionConcurrent',
  'failureThreshold','cooldownMs','observe']);
const READINESS = Object.freeze({originPinned:true, directNetworkClient:false,
  authoritativeSessionStoreConnected:false, tlsAndDnsVerified:false,
  redirectsIndependentlyVerified:false, productionAuthorized:false, decision:'NO_GO'});
function canonicalIssuer(raw) {
  if (typeof raw !== 'string' || raw.length > 400) throw new TypeError('Explicit HTTPS issuer required');
  let url;
  try {url=new URL(raw);}catch{throw new TypeError('Explicit HTTPS issuer required');}
  if (url.protocol !== 'https:' || !url.hostname.includes('.') || isIP(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.port ||
      url.href!==raw || !url.pathname.endsWith('/auth/v1') ||
      /(?:^|\.)(?:localhost|local|internal|invalid)$/i.test(url.hostname))
    throw new TypeError('Canonical external HTTPS issuer required');
  return raw;
}
function parseDocument(response, expectedUrl, maxBytes) {
  if (!plain(response) || response.status!==200 || response.finalUrl!==expectedUrl ||
      response.redirected!==false || typeof response.mediaType!=='string' ||
      !/^application\/(?:json|jwk-set\+json)(?:;\s*charset=utf-8)?$/i.test(response.mediaType)) return null;
  let bytes;
  if (typeof response.body==='string') bytes=Buffer.from(response.body,'utf8');
  else if (Buffer.isBuffer(response.body)) bytes=response.body;
  else return null;
  if (!bytes.length || bytes.length>maxBytes) return null;
  let doc;
  try {doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return null;}
  if (!plain(doc) || Object.keys(doc).length!==1 || !Array.isArray(doc.keys) ||
      doc.keys.length<1 || doc.keys.length>8) return null;
  const seen=new Set(), keys=[];
  for (const key of doc.keys) {
    if (!plain(key) || Object.keys(key).some(k=>![
      'kid','alg','kty','crv','x','y','n','e','use','key_ops'
    ].includes(k)) || !KEY_ID.test(key.kid) ||
        !['ES256','RS256'].includes(key.alg) || seen.has(key.kid) ||
        (key.use!==undefined && key.use!=='sig') ||
        (key.key_ops!==undefined &&
          (!Array.isArray(key.key_ops) || key.key_ops.length!==1 || key.key_ops[0]!=='verify')))
      return null;
    const jwk = key.alg==='ES256'
      ? {kty:key.kty,crv:key.crv,x:key.x,y:key.y}
      : {kty:key.kty,n:key.n,e:key.e};
    if ((key.alg==='ES256' && (key.kty!=='EC' || key.crv!=='P-256' ||
          typeof key.x!=='string' || typeof key.y!=='string' ||
          Object.hasOwn(key,'n') || Object.hasOwn(key,'e'))) ||
        (key.alg==='RS256' && (key.kty!=='RSA' ||
          typeof key.n!=='string' || typeof key.e!=='string' ||
          Object.hasOwn(key,'x') || Object.hasOwn(key,'y') || Object.hasOwn(key,'crv'))))
      return null;
    seen.add(key.kid);
    keys.push(Object.freeze({kid:key.kid,alg:key.alg,jwk:Object.freeze(jwk)}));
  }
  return Object.freeze({keys:Object.freeze(keys)});
}
function createPinnedAuthContractsV74(config={}) {
  if (!plain(config) || Object.keys(config).some(k=>!allowedOptions.has(k)) ||
      typeof config.requestJwks!=='function' || typeof config.readSession!=='function' ||
      (config.nowSec!==undefined && typeof config.nowSec!=='function') ||
      (config.observe!==undefined && typeof config.observe!=='function') ||
      (config.maxJwksBytes!==undefined && !integer(config.maxJwksBytes,2048,65536)) ||
      (config.maxSessionStalenessSec!==undefined &&
        !integer(config.maxSessionStalenessSec,0,30)) ||
      typeof config.audience!=='string' || config.audience.length<1 || config.audience.length>256)
    throw new TypeError('Explicit trusted authentication providers required');
  const issuer=canonicalIssuer(config.issuer);
  const jwksUrl=issuer+'/.well-known/jwks.json';
  const maxBytes=config.maxJwksBytes??16384;
  const maxStale=config.maxSessionStalenessSec??5;
  const nowSec=config.nowSec??(()=>Math.floor(Date.now()/1000));
  async function loadPublicKeys({signal}={}) {
    if (signal?.aborted) return null;
    const request=Object.freeze({
      url:jwksUrl,method:'GET',accept:'application/json',redirect:'error',
      maxBytes,signal
    });
    let response;
    try {response=await config.requestJwks(request);}catch{return null;}
    if (signal?.aborted) return null;
    return parseDocument(response,jwksUrl,maxBytes);
  }
  async function checkSession({subject,sessionId}={}, {signal}={}) {
    if (!UUID.test(subject??'') || !UUID.test(sessionId??'') || signal?.aborted) return null;
    let result;
    try {result=await config.readSession(Object.freeze({subject,sessionId,signal}));}
    catch{return null;}
    if (signal?.aborted || !plain(result) ||
        result.subject!==subject || result.sessionId!==sessionId ||
        typeof result.active!=='boolean' || result.revocationChecked!==true) return null;
    let now;
    try {now=nowSec();}catch{return null;}
    if (!integer(now,1,Number.MAX_SAFE_INTEGER) ||
        !integer(result.checkedAtSec,1,Number.MAX_SAFE_INTEGER) ||
        result.checkedAtSec>now || now-result.checkedAtSec>maxStale ||
        !integer(result.expiresAtSec,1,Number.MAX_SAFE_INTEGER))
      return null;
    // Expired sessions return a validated negative rather than a provider
    // failure. Invalid tokens cannot artificially open the provider circuit.
    return Object.freeze({active:result.active && result.expiresAtSec>now,
      subject,sessionId});
  }
  return Object.freeze({issuer,jwksUrl,loadPublicKeys,checkSession,readiness:READINESS});
}
function createPinnedAuthVerifierV74(config={}) {
  const contract=createPinnedAuthContractsV74(config);
  const adapterOptions={issuer:contract.issuer,audience:config.audience,
    loadPublicKeys:contract.loadPublicKeys,checkSession:contract.checkSession};
  for(const key of ['nowSec','nowMs','refreshIntervalSec','maxTokenAgeSec',
    'keyTimeoutMs','sessionTimeoutMs','keyConcurrent','sessionConcurrent',
    'failureThreshold','cooldownMs','observe']) {
    if (config[key]!==undefined) adapterOptions[key]=config[key];
  }
  const verified=createResilientSessionVerifierV73(adapterOptions);
  return Object.freeze({verifyAccessToken:verified.verifyAccessToken,
    invalidateKeys:verified.invalidateKeys,providerStatus:verified.providerStatus,
    readiness:READINESS});
}
module.exports={createPinnedAuthContractsV74,createPinnedAuthVerifierV74};
