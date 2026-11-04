'use strict';
// V122 BACKEND CONTRACT, LAB VALIDATION ONLY. No real Supabase credentials.
// Must never be exposed as a public RPC, API or SQL GRANT to anon/authenticated.
// Row existence establishes logout deletion at query time ONLY; Supabase
// inactivity/single-session/timebox policies may not remove rows immediately.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUERY='SELECT id, user_id, not_after FROM auth.sessions WHERE id=$1::uuid AND user_id=$2::uuid LIMIT 2';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const exact=(o,fields)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&
 Object.keys(o).length===fields.length&&fields.every(k=>own(o,k));
const validSecond=n=>Number.isSafeInteger(n)&&n>0;
function createV122PrivateAuthSessionRowReader({
 query,nowSec=()=>Math.floor(Date.now()/1000),
 trustedTokenExpiresAtSec,assertPrimaryConnection,
 policyModel='NO_EXTRA_SESSION_LIMITS_LAB_ONLY'
}={}){
 if(typeof query!=='function'||typeof nowSec!=='function'||
    typeof assertPrimaryConnection!=='function'||
    !validSecond(trustedTokenExpiresAtSec)||
    policyModel!=='NO_EXTRA_SESSION_LIMITS_LAB_ONLY')
  throw new TypeError('V122 requires primary-backed, trusted session and token-expiry providers');
 function clock(){try{const v=nowSec();return validSecond(v)?v:null;}catch{return null;}}
 async function readPrimarySession(input){
  if(!exact(input,['subject','sessionId'])||!UUID.test(input.subject||'')||
   !UUID.test(input.sessionId||''))return null;
  // Every call verifies the broker's expected primary role/connection identity.
  // This callback must be independently audited in real deployments.
  try{if(await assertPrimaryConnection()!==true)return null;}catch{return null;}
  const atStart=clock();
  if(atStart===null||trustedTokenExpiresAtSec<=atStart)return null;
  let raw;
  try{raw=await query(QUERY,[input.sessionId.toLowerCase(),input.subject.toLowerCase()]);}
  catch{return null;}
  const checkedAtSec=clock();
  if(checkedAtSec===null||checkedAtSec<atStart||
    checkedAtSec-atStart>2||trustedTokenExpiresAtSec<=checkedAtSec)return null;
  if(!raw||!Array.isArray(raw.rows)||raw.rows.length!==1||raw.rowCount!==1)return null;
  const row=raw.rows[0];
  if(!exact(row,['id','user_id','not_after'])||
     typeof row.id!=='string'||typeof row.user_id!=='string'||
     row.id.toLowerCase()!==input.sessionId.toLowerCase()||
     row.user_id.toLowerCase()!==input.subject.toLowerCase())return null;
  // auth.sessions.not_after is nullable timestamptz. A null does NOT
  // guarantee a session is indefinite: only the trusted JWT expiry bounds it.
  let expiresAtSec=trustedTokenExpiresAtSec;
  if(row.not_after!==null){
   if(!(row.not_after instanceof Date)||!Number.isFinite(row.not_after.getTime()))return null;
   const bounded=Math.floor(row.not_after.getTime()/1000);
   if(!validSecond(bounded))return null;
   expiresAtSec=Math.min(expiresAtSec,bounded);
  }
  if(expiresAtSec<=checkedAtSec)return null;
  // The result is compatible with V119 but may NOT be used as a claim that
  // Supabase session policies are fully enforced or revocation is atomic.
  return Object.freeze({
   active:true,checkedAtSec,expiresAtSec,
   primaryRead:true,revocationChecked:true,
   sessionId:input.sessionId.toLowerCase(),subject:input.subject.toLowerCase()
  });
 }
 return Object.freeze({
  readPrimarySession,queryText:QUERY,
  readiness:Object.freeze({
   labOnly:true,realSupabaseCredentials:false,authSessionRowExistenceOnly:true,
   customTimeoutPoliciesVerified:false,revocationLinearizable:false,
   primaryConnectionAttestedForProduction:false,
   productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
  })
 });
}
module.exports={createV122PrivateAuthSessionRowReader,QUERY};
