'use strict';

// V100: Offline, fail-closed corroboration of verified JWT AMR timestamps.
// Never treat AAL2, an unverified JWT, or auth.mfa_amr_claims.created_at
// as a successful recent MFA verification without independent reviewed evidence.
// Trusted providers are injected by the BACKEND; this file has no IO/DB/network.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_KEYS=['aal','amr','audienceVerified','exp','issuerVerified','sessionId','subject','verified'];
const AMR_KEYS=['method','timestamp'];
const PROOF_KEYS=['checkedAtSec','freshnessSemanticsVerified','method','origin','sessionId','subject','verifiedAtSec'];
const FACTORS=new Set(['totp','phone']);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&
 Object.keys(x).every(k=>keys.includes(k))&&keys.every(k=>Object.hasOwn(x,k));
const seconds=n=>Number.isSafeInteger(n)&&n>=1;
function createVerifiedMfaAmrProvenanceV100({
 verifySignedJwtAmr,readAuthoritativeMfaEvent,
 nowSec=()=>Math.floor(Date.now()/1000),
 maxRecentFactorSec=300,
 maxEvidenceAgeSec=2
}={}){
 if(typeof verifySignedJwtAmr!=='function'||typeof readAuthoritativeMfaEvent!=='function'||
    typeof nowSec!=='function'||!Number.isSafeInteger(maxRecentFactorSec)||
    maxRecentFactorSec<30||maxRecentFactorSec>300||
    !Number.isSafeInteger(maxEvidenceAgeSec)||maxEvidenceAgeSec<1||
    maxEvidenceAgeSec>3)throw new TypeError('Two independent trusted backend sources required');
 async function readAuthoritativeFactor(input={}){
  if(!plain(input)||Object.keys(input).some(k=>!['subject','sessionId','accessToken','signal'].includes(k))||
     !UUID.test(input.subject||'')||!UUID.test(input.sessionId||'')||
     typeof input.accessToken!=='string'||input.accessToken.length<20||
     input.accessToken.length>8192||
     (input.signal!==undefined&&!(input.signal instanceof AbortSignal))||
     input.signal?.aborted)return null;
  let signed;
  try {
   signed=await verifySignedJwtAmr(Object.freeze({
     accessToken:input.accessToken,subject:input.subject,
     sessionId:input.sessionId,signal:input.signal
   }));
  } catch {return null;}
  if(input.signal?.aborted)return null;
  let now;
  try {now=nowSec();}catch{return null;}
  if(!seconds(now)||!exact(signed,SIGNED_KEYS)||signed.verified!==true||
     signed.issuerVerified!==true||signed.audienceVerified!==true||
     signed.aal!=='aal2'||signed.subject!==input.subject||
     signed.sessionId!==input.sessionId||!seconds(signed.exp)||signed.exp<=now||
     !Array.isArray(signed.amr)||signed.amr.length<1||signed.amr.length>8||
     signed.amr.some(x=>!exact(x,AMR_KEYS)||typeof x.method!=='string'||
       !seconds(x.timestamp)||x.timestamp>now))return null;
  const methods=signed.amr.filter(x=>FACTORS.has(x.method));
  // No heuristics: ambiguous/fan-out AMR events are rejected until policy review.
  if(methods.length!==1)return null;
  const amr=methods[0];
  if(now-amr.timestamp>maxRecentFactorSec)return null;
  let event;
  try {
   event=await readAuthoritativeMfaEvent(Object.freeze({
     subject:input.subject,sessionId:input.sessionId,
     method:amr.method,verifiedAtSec:amr.timestamp,
     signal:input.signal
   }));
  }catch{return null;}
  if(input.signal?.aborted)return null;
  try {now=nowSec();}catch{return null;}
  if(!seconds(now)||signed.exp<=now||amr.timestamp>now||
     now-amr.timestamp>maxRecentFactorSec||
     !exact(event,PROOF_KEYS)||event.subject!==input.subject||
     event.sessionId!==input.sessionId||event.method!==amr.method||
     event.verifiedAtSec!==amr.timestamp||
     event.freshnessSemanticsVerified!==true||
     event.origin!=='INDEPENDENT_AUTH_VERIFICATION_EVENT'||
     !seconds(event.checkedAtSec)||event.checkedAtSec>now||
     now-event.checkedAtSec>maxEvidenceAgeSec)return null;
  // Only after a trusted *independent* provider corroborates verification
  // semantics can this fact be forwarded to the existing V98 contract.
  return Object.freeze({
    subject:input.subject,sessionId:input.sessionId,
    source:'AUTH_SERVER_VERIFIED_MFA',aal:'aal2',
    factorType:amr.method,factorVerified:true,
    checkedAtSec:event.checkedAtSec,
    factorConfirmedAtSec:amr.timestamp
  });
 }
 return Object.freeze({
  readAuthoritativeFactor,
  readiness:Object.freeze({
   mode:'OFFLINE_INDEPENDENT_AMR_CORROBORATION_REQUIRED',
   jwtVerifierConnected:false,independentEventConnected:false,
   supabaseSandboxConnected:false,productionAuthorized:false,
   v67Approved:0,decision:'NO_GO'
  })
 });
}
module.exports={createVerifiedMfaAmrProvenanceV100};
