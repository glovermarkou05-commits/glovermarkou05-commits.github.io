'use strict';

// V67: offline acceptance catalogue + evidence inventory ONLY.
// Deliberately cannot authorize opening ports, database access, restore or deployment.
// An untrusted self-declared PASS is NOT proof that a real-world control passed.
const CHECKS = Object.freeze([
  ['HTTP-01', 'parser', 'Valid HTTP/1.1 GET passes through the real parser to V63', 'real_http', '200 and public-only JSON'],
  ['HTTP-02', 'parser', 'Mixed-case duplicate Authorization headers are rejected', 'real_http', 'No authorization call; generic rejection'],
  ['HTTP-03', 'parser', 'Duplicate Content-Length is rejected', 'real_http', 'No authorization call or smuggling'],
  ['HTTP-04', 'parser', 'Transfer-Encoding and Content-Length framing ambiguity is rejected', 'real_http', 'No route processing or smuggling'],
  ['HTTP-05', 'parser', 'Invalid header token and control bytes are rejected', 'real_http', 'No route processing or information leak'],
  ['HTTP-06', 'parser', 'Header limit is enforced by the real Node parser and proxy', 'real_http', '431 or connection closure; no processing'],
  ['HTTP-07', 'parser', 'Missing/duplicate Host cannot bypass HTTP/1.1 routing', 'real_http', 'Safe rejection without authority call'],
  ['HTTP-08', 'parser', 'Encoded path, query, fragment and absolute-form target are not accepted', 'real_http', '404 or 414 without authority call'],
  ['HTTP-09', 'parser', 'GET body and disallowed transfer framing are rejected', 'real_http', '400/413; no authorization'],
  ['HTTP-10', 'parser', 'Half-open and slow-header requests are bounded', 'real_http', 'Timeout or socket close; no resource leak'],
  ['HTTP-11', 'parser', 'Expect 100-continue receives safe rejection', 'real_http', '417 without body or authority'],
  ['HTTP-12', 'parser', 'Upgrade/CONNECT attempts cannot establish a tunnel', 'real_http', 'Socket refused; no tunnel'],
  ['HTTP-13', 'parser', 'Invalid request-line and parser errors have sanitized responses', 'real_http', '400 or close; no packet reflected'],
  ['HTTP-14', 'parser', 'Proxy handling does not trust spoofed forwarding headers', 'real_http', 'Peer admission identity from trusted ingress only'],
  ['LOAD-01', 'capacity', 'Global in-flight requests remain bounded', 'real_http', '503 while busy and recovery after release'],
  ['LOAD-02', 'capacity', 'Peer request budgets apply across repeated requests', 'real_http', '429 with bounded retry and no bypass'],
  ['LOAD-03', 'capacity', 'Connection count, memory and work backlog stay bounded', 'real_http', 'No unbounded sockets, memory or SQL jobs'],
  ['OBS-01', 'observability', 'No token, headers, payloads, SQL, IP or user identity in logs', 'review', 'Redacted storage and controlled sampling'],
  ['OBS-02', 'observability', 'Denials and failures have safe cross-layer correlation', 'review', 'Non-sensitive request ID and controlled error labels'],
  ['OBS-03', 'observability', 'Retention, encryption, access and deletion are reviewed', 'review', 'Signed retention and access policy'],
  ['OBS-04', 'observability', 'Incident escalation and security alert thresholds are defined', 'review', 'Reviewed runbook with owner and threshold'],
  ['AUTH-01', 'identity', 'Real access-token cryptographic verification and revocation', 'real_auth', 'Issuer/audience/expiry/session policy checked'],
  ['AUTH-02', 'identity', 'Cross-tenant and site scope protections under real identities', 'real_auth', '404/403 with no foreign data or writes'],
  ['AUTH-03', 'identity', 'MFA and elevated staff operations use server-verified claims', 'real_auth', 'No browser-supplied privilege accepted'],
  ['DATA-01', 'database', 'Effective grants and RLS for actual backend database roles', 'real_database', 'No service_role exposure or privilege bypass'],
  ['DATA-02', 'database', 'Transactional authorization and cancellation under timeout', 'real_database', 'No stale writes or leaked jobs'],
  ['REC-01', 'recovery', 'PostgreSQL 17 dump is restored to an isolated destination', 'restore', 'No writes to STAGING or production'],
  ['REC-02', 'recovery', 'Restore preserves schemas, counts, indexes, policies and extensions', 'restore', 'Recorded comparison of origin and restored copy'],
  ['REC-03', 'recovery', 'V53 security tests pass against isolated restored database', 'restore', 'Captured test run and failed-case details'],
  ['REC-04', 'recovery', 'Measured RPO/RTO, encryption and retention policy reviewed', 'restore', 'Measured times and approved backup lifecycle'],
  ['OPS-01', 'operations', 'Lab interface/port, TLS, scope and firewall are explicitly approved', 'approval', 'Separate explicit authorization before any listen'],
  ['OPS-02', 'operations', 'Production change window and rollback approval exist', 'approval', 'Separate explicit authorization before deploy']
].map(([id, group, description, evidenceType, expected]) => Object.freeze({ id, group, description, evidenceType, expected })));
const BY_ID = new Map(CHECKS.map(x => [x.id, x]));
const GROUPS = Object.freeze(['parser', 'capacity', 'observability', 'identity', 'database', 'recovery', 'operations']);
const EVIDENCE_TYPES = new Set(['real_http', 'review', 'real_auth', 'real_database', 'restore', 'approval']);
const FIELD_KEYS = new Set(['id', 'outcome', 'kind', 'evidenceRef']);
const safeRecord = x => x && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const VALID_REF = /^evidence\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_.-]{1,128}$/;
function assessV67Evidence(claims = []) {
  // Must never treat a caller's claim as verified evidence or deployment permission.
  if (!Array.isArray(claims) || claims.length > CHECKS.length) {
    throw new TypeError('Invalid evidence inventory');
  }
  const seen = new Set();
  const reported = new Map();
  for (const item of claims) {
    if (!safeRecord(item) || Object.keys(item).some(k => !FIELD_KEYS.has(k)) ||
        !Object.hasOwn(item, 'id') || typeof item.id !== 'string' ||
        !BY_ID.has(item.id) || seen.has(item.id) ||
        !['PASS', 'FAIL', 'BLOCKED'].includes(item.outcome) ||
        !EVIDENCE_TYPES.has(item.kind) || BY_ID.get(item.id).evidenceType !== item.kind ||
        typeof item.evidenceRef !== 'string' || !VALID_REF.test(item.evidenceRef) ||
        item.evidenceRef.split('/').some(p => p === '.' || p === '..')) {
      throw new TypeError('Invalid evidence inventory');
    }
    seen.add(item.id);
    reported.set(item.id, item.outcome);
  }
  const pendingIds = CHECKS.filter(x => !reported.has(x.id)).map(x => x.id);
  const failedIds = CHECKS.filter(x => reported.get(x.id) === 'FAIL').map(x => x.id);
  const blockedIds = CHECKS.filter(x => reported.get(x.id) === 'BLOCKED').map(x => x.id);
  const reportedPassCount = CHECKS.filter(x => reported.get(x.id) === 'PASS').length;
  return Object.freeze({
    total: CHECKS.length,
    submitted: claims.length,
    reportedPassCount,
    pendingIds: Object.freeze(pendingIds),
    failedIds: Object.freeze(failedIds),
    blockedIds: Object.freeze(blockedIds),
    documentationComplete: claims.length === CHECKS.length,
    // Reporting all PASS is not validation, even if references look plausible.
    evidenceIndependentlyVerified: false,
    liveHttpTestedByThisModule: false,
    recoveryTestedByThisModule: false,
    labAuthorized: false,
    deploymentAuthorized: false,
    decision: 'NO_GO'
  });
}
function createV67Checklist() {
  return Object.freeze({
    version: 'V67',
    tests: CHECKS,
    groups: GROUPS,
    defaultAssessment: assessV67Evidence()
  });
}
module.exports = { createV67Checklist, assessV67Evidence };
