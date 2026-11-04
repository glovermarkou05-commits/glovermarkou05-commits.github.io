'use strict';
// V128 private backend journal, disposable PG17 CI only. Never expose to clients.
// The backend supplies the session and a privately stored challenge reference.
// Each challenge can be claimed once; a failed/ambiguous verify never reopens it.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS=['challengeId','createdAtSec','factorId','method','proofReference','sessionId','subject'];
const CLAIM=['challenge_id','created_at_sec','factor_id','method','proof_reference','session_id','subject'];
const ROLE='mg_v128_ci_journal';
const REVIEWED_QA_ROLE='mg_qa_mfa_challenge_journal';
// Use only a server-owned, DBA-reviewed role name; reject role strings from callers.
const IDENT='SELECT session_user AS session_user,current_user AS current_user,pg_is_in_recovery() AS is_replica';
const INSERT='INSERT INTO mg_v128_fictional.challenge_journal(proof_reference,challenge_id,factor_id,subject,session_id,method,created_at_sec) VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6,$7::bigint) ON CONFLICT DO NOTHING RETURNING proof_reference';
const RESERVE="UPDATE mg_v128_fictional.challenge_journal SET state='CLAIMED',claimed_at_sec=$4::bigint WHERE proof_reference=$1::uuid AND subject=$2::uuid AND session_id=$3::uuid AND state='PENDING' AND created_at_sec BETWEEN $4::bigint - 300 AND $4::bigint RETURNING challenge_id,created_at_sec,factor_id,method,proof_reference,session_id,subject";
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const exact=(x,k)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null)&&
 Object.keys(x).length===k.length&&k.every(v=>own(x,v));
const positive=x=>Number.isSafeInteger(x)&&x>0;
const norm=x=>typeof x==='string'?x.toLowerCase():'';
function createV128PrivateChallengeJournal({pool,nowSec=()=>Math.floor(Date.now()/1000),
 expectedJournalRole=ROLE}={}){
 if(!pool||typeof pool.connect!=='function'||typeof nowSec!=='function'||
  ![ROLE,REVIEWED_QA_ROLE].includes(expectedJournalRole))
  throw new TypeError('V128 requires a private nonadmin journal PostgreSQL pool');
 function tick(){try{const t=nowSec();return positive(t)?t:null;}catch{return null;}}
 async function run(fn){
  let c;
  try{
   c=await pool.connect();
   if(!c||typeof c.query!=='function'||typeof c.release!=='function')return null;
   const identity=await c.query(IDENT);
   if(!identity||identity.rowCount!==1||!Array.isArray(identity.rows)||
    !exact(identity.rows[0],['current_user','is_replica','session_user'])||
    identity.rows[0].current_user!==expectedJournalRole||
    identity.rows[0].session_user!==expectedJournalRole||
    identity.rows[0].is_replica!==false)return null;
   return await fn(c);
  }catch{return null;}
  finally{
   // Physical eviction ensures no principal or transaction state leakage.
   if(c&&typeof c.release==='function'){try{c.release(true);}catch{}}
  }
 }
 async function createPending(input){
  if(!exact(input,FIELDS)||!['totp','mfa/phone'].includes(input.method)||
   ![input.proofReference,input.challengeId,input.factorId,input.subject,input.sessionId]
    .every(x=>UUID.test(x||''))||!positive(input.createdAtSec))return {recorded:false};
  const t=tick();
  if(t===null||input.createdAtSec>t||t-input.createdAtSec>2)return {recorded:false};
  const args=[input.proofReference,input.challengeId,input.factorId,
   input.subject,input.sessionId,input.method,input.createdAtSec].map((x,i)=>i<5?norm(x):x);
  const result=await run(c=>c.query(INSERT,args));
  if(result?.command!=='INSERT'||result?.rowCount!==1||
   !Array.isArray(result.rows)||result.rows.length!==1||
   norm(result.rows[0]?.proof_reference)!==norm(input.proofReference))
   return {recorded:false};
  return {recorded:true};
 }
 async function claimPending(input){
  if(!exact(input,['proofReference','sessionId','subject'])||
   ![input.proofReference,input.sessionId,input.subject].every(x=>UUID.test(x||'')))return null;
  const t=tick();
  if(t===null)return null;
  const result=await run(c=>c.query(RESERVE,[
   norm(input.proofReference),norm(input.subject),norm(input.sessionId),t
  ]));
  if(result?.command!=='UPDATE'||result?.rowCount!==1||
   !Array.isArray(result.rows)||result.rows.length!==1||
   !exact(result.rows[0],CLAIM))return null;
  const r=result.rows[0],created=Number(r.created_at_sec);
  if(!positive(created)||created>t||t-created>300||
   norm(r.proof_reference)!==norm(input.proofReference)||
   norm(r.subject)!==norm(input.subject)||norm(r.session_id)!==norm(input.sessionId)||
   !UUID.test(r.challenge_id||'')||!UUID.test(r.factor_id||'')||
   !['totp','mfa/phone'].includes(r.method))return null;
  return Object.freeze({claimed:true,proofReference:norm(r.proof_reference),
   subject:norm(r.subject),sessionId:norm(r.session_id),
   factorId:norm(r.factor_id),challengeId:norm(r.challenge_id),
   method:r.method,createdAtSec:created});
 }
 return Object.freeze({
  createPending,claimPending,
  readiness:Object.freeze({
   labOnly:true,realQaPrincipalCreated:false,
   persistentClaimConcurrencyTestedInCI:false,publicApiExposed:false,
   productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
  })
 });
}
module.exports={createV128PrivateChallengeJournal,INSERT,RESERVE,IDENT,ROLE,REVIEWED_QA_ROLE};
