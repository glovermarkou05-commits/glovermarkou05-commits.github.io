'use strict';

// V75 offline adapter: inject an explicitly authorized, READ-ONLY PostgreSQL
// query function. This module does not create pools, credentials or connections.
// SQL is fixed and parameterized; the caller must supply a primary, fresh read.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
const isSafeSecond = x => Number.isSafeInteger(x) && x >= 1;
const SQL = 'SELECT id::text AS "sessionId", user_id::text AS "subject", ' +
  'FLOOR(EXTRACT(EPOCH FROM not_after))::bigint::text AS "notAfterEpoch" ' +
  'FROM auth.sessions WHERE id = $1::uuid AND user_id = $2::uuid LIMIT 2';
const READINESS = Object.freeze({source:'auth.sessions',databaseConnected:false,
  grantsVerified:false,sessionPolicyVerified:false,realRevocationVerified:false,
  productionAuthorized:false,decision:'NO_GO'});

function createPgSessionReaderV75({query, nowSec = () => Math.floor(Date.now() / 1000),
  proofTtlSec = 2} = {}) {
  if (typeof query !== 'function' || typeof nowSec !== 'function' ||
      !Number.isSafeInteger(proofTtlSec) || proofTtlSec < 1 || proofTtlSec > 5) {
    throw new TypeError('V75 requires a trusted read-only query and bounded proof TTL');
  }
  async function readSession({subject,sessionId,signal} = {}) {
    if (typeof subject !== 'string' || !UUID.test(subject) ||
        typeof sessionId !== 'string' || !UUID.test(sessionId) ||
        (signal !== undefined && !(signal instanceof AbortSignal)) || signal?.aborted) return null;
    let before;
    try { before = nowSec(); } catch { return null; }
    if (!isSafeSecond(before)) return null;
    const request = Object.freeze({text:SQL,values:Object.freeze([sessionId,subject]),signal});
    let result;
    try { result = await query(request); } catch { return null; }
    if (signal?.aborted || !isRecord(result) || !Array.isArray(result.rows) || result.rows.length > 1) return null;
    let checkedAtSec;
    try { checkedAtSec = nowSec(); } catch { return null; }
    if (!isSafeSecond(checkedAtSec) || checkedAtSec < before ||
        checkedAtSec > Number.MAX_SAFE_INTEGER - proofTtlSec) return null;
    // A missing row is the documented Supabase sign-out signal. It is a
    // verified NEGATIVE, not an unverified provider failure.
    if (result.rows.length === 0) return Object.freeze({active:false,revocationChecked:true,
      subject,sessionId,checkedAtSec,expiresAtSec:checkedAtSec+proofTtlSec});
    const row=result.rows[0];
    if (!isRecord(row) || Object.keys(row).length !== 3 ||
        row.sessionId !== sessionId || row.subject !== subject ||
        !Object.hasOwn(row,'notAfterEpoch')) return null;
    const notAfter=row.notAfterEpoch;
    let expiresAtSec=checkedAtSec+proofTtlSec;
    if (notAfter !== null) {
      if (typeof notAfter !== 'string' || !/^[1-9][0-9]{0,15}$/.test(notAfter)) return null;
      const expiry=Number(notAfter);
      if (!isSafeSecond(expiry)) return null;
      expiresAtSec=Math.min(expiresAtSec,expiry);
    }
    // expiresAtSec is the SHORT-LIVED ATTESTATION expiry, not the entire
    // Supabase session expiry when not_after is NULL. JWT.exp is enforced V71.
    return Object.freeze({active:expiresAtSec>checkedAtSec,revocationChecked:true,
      subject,sessionId,checkedAtSec,expiresAtSec});
  }
  return Object.freeze({readSession,readiness:READINESS});
}
module.exports={createPgSessionReaderV75};
