'use strict';
// V126 LAB-ONLY. TRUSTED MFA RECEIPT PROVIDER IS NOT IMPLEMENTED AGAINST SUPABASE.
// Never publish recordVerifiedOnce as a client endpoint. No production grants.
// Only a server-verified, stable receipt can mint one durable event UUID.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS=new Set(['totp','mfa/phone']);
const ISSUER='mg_v126_ci_issuer';
const READER='mg_v126_ci_reader';
const IDENTITY='SELECT session_user AS session_user, current_user AS current_user, pg_is_in_recovery() AS is_replica';
const INSERT='INSERT INTO mg_v126_fictional.verified_mfa_events (receipt_id,proof_reference,subject,session_id,method,verified_at_sec) VALUES ($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6::bigint) ON CONFLICT (receipt_id) DO NOTHING';
const SELECT_BY_RECEIPT='SELECT receipt_id,event_id,proof_reference,subject,session_id,method,verified_at_sec FROM mg_v126_fictional.verified_mfa_events WHERE receipt_id=$1::uuid LIMIT 2';
const SELECT_BY_PROOF='SELECT receipt_id,event_id,proof_reference,subject,session_id,method,verified_at_sec FROM mg_v126_fictional.verified_mfa_events WHERE proof_reference=$1::uuid AND subject=$2::uuid AND session_id=$3::uuid LIMIT 2';
const REQUEST_KEYS=['proofReference','sessionId','subject'];
const RECEIPT_KEYS=['checkedAtSec','factorOwnershipVerified','method','proofReference',
 'provenanceReviewed','receiptId','sessionBoundByAuthorizedFlow','sessionId',
 'subject','verified','verifiedAtSec'];
const FIELDS=['receipt_id','event_id','proof_reference','subject','session_id','method','verified_at_sec'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&
 Object.keys(o).length===keys.length&&keys.every(k=>own(o,k));
const secs=n=>Number.isSafeInteger(n)&&n>0;
const lower=s=>typeof s==='string'?s.toLowerCase():'';
const NO=Object.freeze({recorded:false});
const YES=Object.freeze({recorded:true});
function createV126DurableMfaEventStore({issuerPool,readerPool,confirmAuthenticMfaReceipt,
 nowSec=()=>Math.floor(Date.now()/1000)}={}){
 if(!issuerPool||typeof issuerPool.connect!=='function'||
  !readerPool||typeof readerPool.connect!=='function'||
  typeof confirmAuthenticMfaReceipt!=='function'||typeof nowSec!=='function')
  throw new TypeError('V126 requires separate private issuer/reader pools and trusted verifier');
 function tick(){try{const n=nowSec();return secs(n)?n:null;}catch{return null;}}
 function validRequest(q){return exact(q,REQUEST_KEYS)&&
  UUID.test(q.proofReference||'')&&UUID.test(q.sessionId||'')&&UUID.test(q.subject||'');}
 async function withPrincipal(pool,role,run){
  let c;
  try{
   c=await pool.connect();
   if(!c||typeof c.query!=='function'||typeof c.release!=='function')return null;
   const r=await c.query(IDENTITY);
   if(!r||!Array.isArray(r.rows)||r.rows.length!==1||
    !exact(r.rows[0],['session_user','current_user','is_replica'])||
    r.rows[0].session_user!==role||r.rows[0].current_user!==role||
    r.rows[0].is_replica!==false)return null;
   return await run(c);
  }catch{return null;}
  finally{if(c&&typeof c.release==='function'){try{c.release(true);}catch{}}}
 }
 function rowMatches(r,input,receiptId=null){
  if(!r||!Array.isArray(r.rows)||r.rows.length!==1||r.rowCount!==1||
   !exact(r.rows[0],FIELDS))return false;
  const row=r.rows[0],stamp=Number(row.verified_at_sec);
  return UUID4.test(row.event_id||'')&&UUID4.test(row.receipt_id||'')&&
   (!receiptId||lower(row.receipt_id)===lower(receiptId))&&
   lower(row.proof_reference)===lower(input.proofReference)&&
   lower(row.subject)===lower(input.subject)&&
   lower(row.session_id)===lower(input.sessionId)&&
   METHODS.has(row.method)&&secs(stamp);
 }
 async function recordVerifiedOnce(input){
  if(!validRequest(input))return NO;
  let a;
  try{a=await confirmAuthenticMfaReceipt(Object.freeze({
   proofReference:lower(input.proofReference),sessionId:lower(input.sessionId),
   subject:lower(input.subject)
  }));}catch{return NO;}
  const t=tick();
  if(t===null||!exact(a,RECEIPT_KEYS)||!UUID4.test(a.receiptId||'')||
   lower(a.proofReference)!==lower(input.proofReference)||
   lower(a.subject)!==lower(input.subject)||lower(a.sessionId)!==lower(input.sessionId)||
   !METHODS.has(a.method)||a.verified!==true||
   a.factorOwnershipVerified!==true||a.provenanceReviewed!==true||
   a.sessionBoundByAuthorizedFlow!==true||!secs(a.checkedAtSec)||
   a.checkedAtSec>t||t-a.checkedAtSec>2||
   !secs(a.verifiedAtSec)||a.verifiedAtSec>t||t-a.verifiedAtSec>300)return NO;
  const result=await withPrincipal(issuerPool,ISSUER,async c=>{
   const ins=await c.query(INSERT,[lower(a.receiptId),lower(a.proofReference),
    lower(a.subject),lower(a.sessionId),a.method,a.verifiedAtSec]);
   if(ins?.command!=='INSERT'||![0,1].includes(ins.rowCount))return null;
   const row=await c.query(SELECT_BY_RECEIPT,[lower(a.receiptId)]);
   if(!rowMatches(row,input,a.receiptId))return null;
   const r=row.rows[0];
   if(r.method!==a.method||Number(r.verified_at_sec)!==a.verifiedAtSec)return null;
   return true;
  });
  return result===true?YES:NO;
 }
 async function readTrustedVerifiedEvent(input){
  if(!validRequest(input))return null;
  const result=await withPrincipal(readerPool,READER,async c=>{
   const row=await c.query(SELECT_BY_PROOF,[lower(input.proofReference),
    lower(input.subject),lower(input.sessionId)]);
   const t=tick();
   if(t===null||!rowMatches(row,input))return null;
   const r=row.rows[0],stamp=Number(r.verified_at_sec);
   if(stamp>t||t-stamp>300)return null;
   return Object.freeze({
    checkedAtSec:t,eventId:lower(r.event_id),eventIdBoundToVerification:true,
    factorOwnershipVerified:true,method:r.method,proofReference:lower(r.proof_reference),
    provenanceReviewed:true,sessionBoundByAuthorizedFlow:true,
    sessionId:lower(r.session_id),subject:lower(r.subject),
    verified:true,verifiedAtSec:stamp
   });
  });
  return result||null;
 }
 return Object.freeze({recordVerifiedOnce,readTrustedVerifiedEvent,
  readiness:Object.freeze({
   labOnly:true,realSupabaseVerifierIntegrated:false,proofIssuerAudited:false,
   eventRetentionReviewed:false,revocationLinearizable:false,
   productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
  })});
}
module.exports={createV126DurableMfaEventStore,IDENTITY,INSERT,
 SELECT_BY_RECEIPT,SELECT_BY_PROOF,ISSUER,READER};
