'use strict';

// V101: Optional, synthetic, read-only provider boundary for V100.
// Supabase Auth source shows JWT AMR timestamp from mfa_amr_claims.updated_at.
// The AMR row alone is NOT a verified MFA challenge; challenge rows do not
// directly bind to a session. A separately reviewed server-side session link
// and verified challenge are mandatory before returning V100 evidence.
// No DB driver, SQL execution, network, storage, side effects, or automatic grant.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUPPORTED=new Set(['totp','mfa/phone']);
const ROW_KEYS=['checkedAtSec','createdAtSec','method','primaryRead',
 'sessionId','sessionOwnershipVerified','subject','updatedAtSec'];
const CHALLENGE_KEYS=['checkedAtSec','factorOwnershipVerified','method',
 'provenanceReviewed','sessionBoundByAuthorizedFlow','sessionId','subject',
 'verified','verifiedAtSec'];
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 [Object.prototype,null].includes(Object.getPrototypeOf(x));
const exact=(obj,keys)=>plain(obj)&&Object.keys(obj).length===keys.length&&
 keys.every(k=>Object.prototype.hasOwnProperty.call(obj,k));
const time=n=>Number.isSafeInteger(n)&&n>0;
function createMfaRowCorroboratorV101({
 readPrimaryAmrRow,readVerifiedChallenge,
 nowSec=()=>Math.floor(Date.now()/1000),
 maxObservationAgeSec=2,maxClockSkewSec=3
}={}){
 if(typeof readPrimaryAmrRow!=='function'||typeof readVerifiedChallenge!=='function'||
  typeof nowSec!=='function'||!Number.isSafeInteger(maxObservationAgeSec)||
  maxObservationAgeSec<1||maxObservationAgeSec>3||
  !Number.isSafeInteger(maxClockSkewSec)||maxClockSkewSec<0||maxClockSkewSec>5){
  throw new TypeError('Two independent backend sources and bounded windows required');
 }
 const clock=()=>{
  try{const t=nowSec();return time(t)?t:null;}catch{return null;}
 };
 async function readAuthoritativeMfaEvent(input={}){
  if(!plain(input)||Object.keys(input).some(k=>![
    'subject','sessionId','method','verifiedAtSec','signal'].includes(k))||
    !UUID.test(input.subject||'')||!UUID.test(input.sessionId||'')||
    !SUPPORTED.has(input.method)||!time(input.verifiedAtSec)||
    (input.signal!==undefined&&!(input.signal instanceof AbortSignal))||
    input.signal?.aborted)return null;
  let now=clock();
  if(now===null||input.verifiedAtSec>now||now-input.verifiedAtSec>300)return null;

  const params=Object.freeze({subject:input.subject,sessionId:input.sessionId,
    method:input.method,signal:input.signal});
  let row;
  try{row=await readPrimaryAmrRow(params);}catch{return null;}
  if(input.signal?.aborted)return null;
  now=clock();
  if(now===null||!exact(row,ROW_KEYS)||row.subject!==input.subject||
    row.sessionId!==input.sessionId||row.method!==input.method||
    row.primaryRead!==true||row.sessionOwnershipVerified!==true||
    !time(row.createdAtSec)||!time(row.updatedAtSec)||
    row.updatedAtSec!==input.verifiedAtSec||
    row.createdAtSec>row.updatedAtSec||
    !time(row.checkedAtSec)||row.checkedAtSec>now||
    now-row.checkedAtSec>maxObservationAgeSec||
    row.updatedAtSec>now||now-row.updatedAtSec>300)return null;

  let challenge;
  try{challenge=await readVerifiedChallenge(params);}catch{return null;}
  if(input.signal?.aborted)return null;
  now=clock();
  if(now===null||!exact(challenge,CHALLENGE_KEYS)||
    challenge.subject!==input.subject||challenge.sessionId!==input.sessionId||
    challenge.method!==input.method||challenge.verified!==true||
    challenge.factorOwnershipVerified!==true||
    challenge.provenanceReviewed!==true||
    challenge.sessionBoundByAuthorizedFlow!==true||
    !time(challenge.verifiedAtSec)||challenge.verifiedAtSec>now||
    Math.abs(challenge.verifiedAtSec-row.updatedAtSec)>maxClockSkewSec||
    now-challenge.verifiedAtSec>300||
    !time(challenge.checkedAtSec)||challenge.checkedAtSec>now||
    now-challenge.checkedAtSec>maxObservationAgeSec)return null;

  // No challenge has an intrinsic session_id in the upstream migration.
  // The backend must prove sessionBoundByAuthorizedFlow, not infer it from
  // matching factor/user/timestamps. Without independent proof: DENY.
  return Object.freeze({
    checkedAtSec:now, freshnessSemanticsVerified:true,method:input.method,
    origin:'INDEPENDENT_AUTH_VERIFICATION_EVENT',
    sessionId:input.sessionId,subject:input.subject,
    verifiedAtSec:row.updatedAtSec
  });
 }
 return Object.freeze({readAuthoritativeMfaEvent,
  readiness:Object.freeze({mode:'OFFLINE_INDEPENDENT_CHALLENGE_PROOF_REQUIRED',
    supabaseConnected:false,remoteAuthQueried:false,
    challengeSessionLinkProven:false,productionAuthorized:false,
    formalV67Approved:0,decision:'NO_GO'})});
}
module.exports={createMfaRowCorroboratorV101};
