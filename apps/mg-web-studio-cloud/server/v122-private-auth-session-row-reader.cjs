'use strict';
// V122 BACKEND CONTRACT, LAB VALIDATION ONLY. No real Supabase credentials.
// Never expose this as public RPC or grant auth.sessions to browser roles.
// Row existence establishes logout deletion at query time ONLY; Supabase
// inactivity/single-session/timebox policies may not remove rows immediately.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READER='mg_v122_ci_auth_reader';
const REVIEWED_QA_READER='mg_qa_auth_session_reader';
// Server-owned, hard allowlisted principal map. No user-supplied DB role names.
const VERIFY='SELECT session_user AS session_user, current_user AS current_user, pg_is_in_recovery() AS is_replica';
const QUERY='SELECT id, user_id, not_after FROM auth.sessions WHERE id=$1::uuid AND user_id=$2::uuid LIMIT 2';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const exact=(o,fields)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&
 Object.keys(o).length===fields.length&&fields.every(k=>own(o,k));
const validSecond=n=>Number.isSafeInteger(n)&&n>0;
function createV122PrivateAuthSessionRowReader({
 pool,nowSec=()=>Math.floor(Date.now()/1000),
 trustedTokenExpiresAtSec,policyModel='NO_EXTRA_SESSION_LIMITS_LAB_ONLY',
 expectedReaderRole=READER
}={}){
 if(!pool||typeof pool.connect!=='function'||typeof nowSec!=='function'||
    !validSecond(trustedTokenExpiresAtSec)||
    policyModel!=='NO_EXTRA_SESSION_LIMITS_LAB_ONLY'||
    ![READER,REVIEWED_QA_READER].includes(expectedReaderRole))
  throw new TypeError('V122 requires a private, verified-primary session pool and trusted JWT expiry');
 function clock(){try{const v=nowSec();return validSecond(v)?v:null;}catch{return null;}}
 async function readPrimarySession(input){
  if(!exact(input,['subject','sessionId'])||!UUID.test(input.subject||'')||
   !UUID.test(input.sessionId||''))return null;
  const atStart=clock();
  if(atStart===null||trustedTokenExpiresAtSec<=atStart)return null;
  let client;
  try{
   client=await pool.connect();
   if(!client||typeof client.query!=='function'||typeof client.release!=='function')return null;
   // Verify the same physical connection used for the sensitive SELECT.
   const identity=await client.query(VERIFY);
   if(!identity||!Array.isArray(identity.rows)||identity.rows.length!==1||
      !exact(identity.rows[0],['session_user','current_user','is_replica'])||
      identity.rows[0].session_user!==expectedReaderRole||
      identity.rows[0].current_user!==expectedReaderRole||identity.rows[0].is_replica!==false)
    return null;
   const raw=await client.query(QUERY,[input.sessionId.toLowerCase(),input.subject.toLowerCase()]);
   const checkedAtSec=clock();
   if(checkedAtSec===null||checkedAtSec<atStart||
      checkedAtSec-atStart>2||trustedTokenExpiresAtSec<=checkedAtSec)return null;
   if(!raw||!Array.isArray(raw.rows)||raw.rows.length!==1||raw.rowCount!==1)return null;
   const row=raw.rows[0];
   if(!exact(row,['id','user_id','not_after'])||
      typeof row.id!=='string'||typeof row.user_id!=='string'||
      row.id.toLowerCase()!==input.sessionId.toLowerCase()||
      row.user_id.toLowerCase()!==input.subject.toLowerCase())return null;
   // auth.sessions.not_after is nullable timestamptz. Null does NOT
   // guarantee indefinite life; only the verified JWT expiry bounds it.
   let expiresAtSec=trustedTokenExpiresAtSec;
   if(row.not_after!==null){
    if(!(row.not_after instanceof Date)||!Number.isFinite(row.not_after.getTime()))return null;
    const bounded=Math.floor(row.not_after.getTime()/1000);
    if(!validSecond(bounded))return null;
    expiresAtSec=Math.min(expiresAtSec,bounded);
   }
   if(expiresAtSec<=checkedAtSec)return null;
   // Not an assertion that Supabase inactivity/single-session policies or
   // simultaneous revocation are enforced. Review before any real deployment.
   return Object.freeze({
    active:true,checkedAtSec,expiresAtSec,
    primaryRead:true,revocationChecked:true,
    sessionId:input.sessionId.toLowerCase(),subject:input.subject.toLowerCase()
   });
  }catch{return null;}
  finally{
   // Evict the session even after a failure, preventing leaked role state.
   if(client&&typeof client.release==='function'){
    try{client.release(true);}catch{}
   }
  }
 }
 return Object.freeze({
  readPrimarySession,
  readiness:Object.freeze({
   labOnly:true,realSupabaseCredentials:false,authSessionRowExistenceOnly:true,
   customTimeoutPoliciesVerified:false,revocationLinearizable:false,
   productionRoleApproved:false,productionAuthorized:false,
   formalV67Pass:0,decision:'NO_GO'
  })
 });
}
module.exports={createV122PrivateAuthSessionRowReader,VERIFY,QUERY,READER,REVIEWED_QA_READER};
