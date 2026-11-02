'use strict';
// V98 — optional, offline and fail-closed adapter for V97 sensitive operations.
// All three providers must be *trusted server-side adapters*. No Supabase clients,
// network, SQL, secret handling, JWT decoding, production connectivity or caching.
// A token with JWT 'aal2' alone is NEVER sufficient evidence of recent MFA.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_KEYS=['aal','audienceVerified','exp','iat','issuerVerified','sessionId','subject','verified'];
const SESSION_KEYS=['active','checkedAtSec','expiresAtSec','primaryRead','revocationChecked','sessionId','subject'];
const FACTOR_KEYS=['aal','checkedAtSec','factorConfirmedAtSec','factorType','factorVerified','sessionId','source','subject'];
const own=Object.prototype.hasOwnProperty;
const plain=x=>x!==null && typeof x==='object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length &&
  Object.keys(x).every(k=>keys.includes(k))&&keys.every(k=>own.call(x,k));
const sec=n=>Number.isSafeInteger(n)&&n>=1;
const signalValid=s=>s===undefined||s instanceof AbortSignal;
function createTrustedAssuranceAdapterV98({
  verifyBoundJwt,readPrimarySession,readAuthoritativeFactor,
  nowSec=()=>Math.floor(Date.now()/1000),
  maxSessionAgeSec=2,maxFactorEvidenceAgeSec=2
}={}){
 if(typeof verifyBoundJwt!=='function'||typeof readPrimarySession!=='function'||
   typeof readAuthoritativeFactor!=='function'||typeof nowSec!=='function'||
   !Number.isSafeInteger(maxSessionAgeSec)||maxSessionAgeSec<1||maxSessionAgeSec>3||
   !Number.isSafeInteger(maxFactorEvidenceAgeSec)||maxFactorEvidenceAgeSec<1||
   maxFactorEvidenceAgeSec>3)throw new TypeError('Strict backend-only Auth providers required');

 async function readTrustedAssurance(input={}){
  if(!plain(input)||Object.keys(input).some(k=>!['subject','accessToken','signal'].includes(k))||
    !UUID.test(input.subject||'')||typeof input.accessToken!=='string'||
    input.accessToken.length<20||input.accessToken.length>8192||
    !signalValid(input.signal)||input.signal?.aborted)return null;

  let token;
  try{
   // Provider contract: cryptographically verify signature, issuer, audience,
   // expiry and token session_id; no unverified JWT decode or user_metadata.
   token=await verifyBoundJwt(Object.freeze({
      accessToken:input.accessToken,signal:input.signal
   }));
  }catch{return null;}
  if(input.signal?.aborted)return null;
  let at;
  try{at=nowSec();}catch{return null;}
  if(!sec(at)||!exact(token,TOKEN_KEYS)||token.verified!==true||
     token.issuerVerified!==true||token.audienceVerified!==true||
     token.subject!==input.subject||!UUID.test(token.sessionId)||
     token.aal!=='aal2'||!sec(token.iat)||token.iat>at||
     !sec(token.exp)||token.exp<=at||token.exp<=token.iat)return null;

  let session;
  try{
    session=await readPrimarySession(Object.freeze({
      subject:token.subject,sessionId:token.sessionId,signal:input.signal
    }));
  }catch{return null;}
  if(input.signal?.aborted)return null;
  try{at=nowSec();}catch{return null;}
  if(!sec(at)||at>=token.exp||!exact(session,SESSION_KEYS)||
    session.subject!==token.subject||session.sessionId!==token.sessionId||
    session.primaryRead!==true||session.active!==true||
    session.revocationChecked!==true||!sec(session.checkedAtSec)||
    session.checkedAtSec>at||at-session.checkedAtSec>maxSessionAgeSec||
    !sec(session.expiresAtSec)||session.expiresAtSec<=at)return null;

  let factor;
  try{
    // Must be independently checked against a server-authoritative MFA event
    // for THIS session and user. JWT aal2 and enrolled factors are not enough.
    factor=await readAuthoritativeFactor(Object.freeze({
      subject:token.subject,sessionId:token.sessionId,signal:input.signal
    }));
  }catch{return null;}
  if(input.signal?.aborted)return null;
  try{at=nowSec();}catch{return null;}
  if(!sec(at)||at>=token.exp||at>=session.expiresAtSec||
    !exact(factor,FACTOR_KEYS)||factor.subject!==token.subject||
    factor.sessionId!==token.sessionId||factor.source!=='AUTH_SERVER_VERIFIED_MFA'||
    factor.aal!=='aal2'||factor.factorVerified!==true||
    !['totp','phone'].includes(factor.factorType)||
    !sec(factor.checkedAtSec)||factor.checkedAtSec>at||
    at-factor.checkedAtSec>maxFactorEvidenceAgeSec||
    !sec(factor.factorConfirmedAtSec)||factor.factorConfirmedAtSec>at||
    at-factor.factorConfirmedAtSec>300)return null;

  // In the V97 contract expiresAtSec represents the shorter attestation expiry.
  const expiry=Math.min(token.exp,session.expiresAtSec,
     session.checkedAtSec+maxSessionAgeSec,
     factor.checkedAtSec+maxFactorEvidenceAgeSec,
     factor.factorConfirmedAtSec+300);
  if(expiry<=at)return null;
  return Object.freeze({
     aal:'aal2',active:true,checkedAtSec:at,expiresAtSec:expiry,
     factorConfirmedAtSec:factor.factorConfirmedAtSec,factorVerified:true,
     revocationChecked:true,sessionId:token.sessionId,subject:token.subject,
     tokenSessionIdVerified:true
  });
 }
 return Object.freeze({
   readTrustedAssurance,
   readiness:Object.freeze({
     mode:'INJECTED_TRUSTED_AUTH_PROVIDERS_ONLY',
     supabaseConnected:false,primarySessionConnected:false,
     realMfaProofConnected:false,tokenClaimBindingCertified:false,
     productionAuthorized:false,decision:'NO_GO'
   })
 });
}
module.exports={createTrustedAssuranceAdapterV98};
