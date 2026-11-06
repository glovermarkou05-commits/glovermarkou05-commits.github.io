'use strict';

// V102 — server-controlled MFA challenge/session correlation (synthetic only).
// This module never calls Supabase, SQL or the network. Five trusted backend
// callbacks MUST execute in one server request; their authority is NOT proven
// by this module. It never holds tokens or OTPs in its issued receipt.
// The WeakMap receipt is local, one-use, and NOT distributed/restart-safe.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS=new Set(['totp','mfa/phone']);
const OBJECT=Object.prototype;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&
 keys.every(k=>OBJECT.hasOwnProperty.call(x,k));
const isSec=x=>Number.isSafeInteger(x)&&x>0;
const alive=s=>s===undefined||s instanceof AbortSignal&&!s.aborted;
const SESSION_KEYS=['active','aal','checkedAtSec','jwtVerified','primaryRead',
 'revocationChecked','sessionId','subject','verified'];
const FACTOR_KEYS=['checkedAtSec','factorId','method','owned','status','subject'];
const CHALLENGE_KEYS=['challengeId','createdAtSec','factorId','providerIssued'];
const VERIFY_KEYS=['challengeId','factorId','providerVerified',
 'refreshedAccessToken','verifiedAtSec'];
const POST_KEYS=['aal','active','amrMethod','amrTimestampSec','checkedAtSec',
 'exp','jwtVerified','primaryRead','revocationChecked','sessionId','subject','verified'];

function createMfaChallengeSessionTransactionV102({
 readOriginalSession,readOwnedFactor,createChallenge,verifyChallenge,readUpdatedSession,
 nowSec=()=>Math.floor(Date.now()/1000),
 maxFlowSec=120,maxReceiptAgeSec=2,maxDriftSec=3
}={}){
 if([readOriginalSession,readOwnedFactor,createChallenge,verifyChallenge,
  readUpdatedSession,nowSec].some(f=>typeof f!=='function')||
  !Number.isSafeInteger(maxFlowSec)||maxFlowSec<30||maxFlowSec>180||
  !Number.isSafeInteger(maxReceiptAgeSec)||maxReceiptAgeSec<1||maxReceiptAgeSec>3||
  !Number.isSafeInteger(maxDriftSec)||maxDriftSec<0||maxDriftSec>5)
  throw new TypeError('Trusted challenge, session and factor adapters required');

 const receipts=new WeakMap();
 const clock=()=>{try{const t=nowSec();return isSec(t)?t:null;}catch{return null;}};

 async function run(input={}){
  if(!exact(input,['accessToken','code','factorId','method','sessionId',
   'signal','subject'])||!UUID.test(input.subject||'')||
   !UUID.test(input.sessionId||'')||!UUID.test(input.factorId||'')||
   !METHODS.has(input.method)||typeof input.accessToken!=='string'||
   input.accessToken.length<20||input.accessToken.length>8192||
   typeof input.code!=='string'||!/^[0-9]{6,8}$/.test(input.code)||
   !alive(input.signal))return null;
  const start=clock();
  if(start===null)return null;

  // All fields come from a validated server route, never request-body roles.
  const identity=Object.freeze({subject:input.subject,
   sessionId:input.sessionId,signal:input.signal});
  let pre,owned,challenge,verified,post,now;
  try{
   pre=await readOriginalSession(Object.freeze({
    ...identity,accessToken:input.accessToken
   }));
   if(!alive(input.signal))return null;
   now=clock();
   if(now===null||!exact(pre,SESSION_KEYS)||pre.verified!==true||
    pre.jwtVerified!==true||pre.primaryRead!==true||
    pre.revocationChecked!==true||pre.active!==true||
    !['aal1','aal2'].includes(pre.aal)||
    pre.subject!==input.subject||pre.sessionId!==input.sessionId||
    !isSec(pre.checkedAtSec)||pre.checkedAtSec>now||
    now-pre.checkedAtSec>2||now-start>maxFlowSec)return null;

   owned=await readOwnedFactor(Object.freeze({
    ...identity,factorId:input.factorId,method:input.method
   }));
   if(!alive(input.signal))return null;
   now=clock();
   if(now===null||!exact(owned,FACTOR_KEYS)||owned.owned!==true||
    owned.status!=='verified'||owned.subject!==input.subject||
    owned.factorId!==input.factorId||owned.method!==input.method||
    !isSec(owned.checkedAtSec)||owned.checkedAtSec>now||
    now-owned.checkedAtSec>2||now-start>maxFlowSec)return null;

   challenge=await createChallenge(Object.freeze({
    ...identity,factorId:input.factorId,method:input.method
   }));
   if(!alive(input.signal))return null;
   now=clock();
   if(now===null||!exact(challenge,CHALLENGE_KEYS)||
    !UUID.test(challenge.challengeId||'')||
    challenge.factorId!==input.factorId||challenge.providerIssued!==true||
    !isSec(challenge.createdAtSec)||challenge.createdAtSec<start-2||
    challenge.createdAtSec>now||now-start>maxFlowSec)return null;

   // Opaque OTP is delivered only to the trusted provider callback, never kept
   // in the one-use receipt or emitted in errors, telemetry or return values.
   verified=await verifyChallenge(Object.freeze({
    ...identity,challengeId:challenge.challengeId,factorId:input.factorId,
    method:input.method,code:input.code
   }));
   if(!alive(input.signal))return null;
   now=clock();
   if(now===null||!exact(verified,VERIFY_KEYS)||
    verified.providerVerified!==true||
    verified.challengeId!==challenge.challengeId||
    verified.factorId!==input.factorId||
    typeof verified.refreshedAccessToken!=='string'||
    verified.refreshedAccessToken.length<20||
    verified.refreshedAccessToken.length>8192||
    !isSec(verified.verifiedAtSec)||
    verified.verifiedAtSec<challenge.createdAtSec||
    verified.verifiedAtSec>now||now-start>maxFlowSec)return null;

   post=await readUpdatedSession(Object.freeze({
    ...identity,accessToken:verified.refreshedAccessToken
   }));
   if(!alive(input.signal))return null;
   now=clock();
   if(now===null||!exact(post,POST_KEYS)||
    post.verified!==true||post.jwtVerified!==true||
    post.primaryRead!==true||post.revocationChecked!==true||
    post.active!==true||post.aal!=='aal2'||
    post.subject!==input.subject||post.sessionId!==input.sessionId||
    post.amrMethod!==input.method||
    !isSec(post.amrTimestampSec)||post.amrTimestampSec>now||
    Math.abs(post.amrTimestampSec-verified.verifiedAtSec)>maxDriftSec||
    post.amrTimestampSec<challenge.createdAtSec-maxDriftSec||
    !isSec(post.checkedAtSec)||post.checkedAtSec>now||
    now-post.checkedAtSec>2||!isSec(post.exp)||post.exp<=now||
    now-start>maxFlowSec)return null;
  }catch{return null;}

  // A reference-only receipt prevents simple JSON-copy replay, with no OTP/JWT
  // or challenge ID in it. A distributed deployment needs an authorized atomic
  // store and transaction integration; this one process is NOT sufficient.
  const receipt=Object.freeze({});
  receipts.set(receipt,Object.freeze({
   subject:input.subject,sessionId:input.sessionId,method:input.method,
   verifiedAtSec:post.amrTimestampSec,expiresAtSec:now+maxReceiptAgeSec
  }));
  return receipt;
 }
 function consume(receipt,query={}){
  if(!plain(receipt)||!receipts.has(receipt))return null;
  const data=receipts.get(receipt);
  receipts.delete(receipt); // every attempted use, even invalid, consumes it
  if(!exact(query,['method','sessionId','subject','verifiedAtSec'])||
    query.subject!==data.subject||query.sessionId!==data.sessionId||
    query.method!==data.method||query.verifiedAtSec!==data.verifiedAtSec)
    return null;
  const now=clock();
  if(now===null||now>data.expiresAtSec||now<data.verifiedAtSec)return null;
  return Object.freeze({
   checkedAtSec:now,factorOwnershipVerified:true,method:data.method,
   provenanceReviewed:true,sessionBoundByAuthorizedFlow:true,
   sessionId:data.sessionId,subject:data.subject,verified:true,
   verifiedAtSec:data.verifiedAtSec
  });
 }
 return Object.freeze({run,consume,readiness:Object.freeze({
  mode:'SYNTHETIC_SERVER_FLOW_ONLY',supabaseConnected:false,
  liveChallengeVerified:false,distributedReplayGuard:false,
  productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 })});
}
module.exports={createMfaChallengeSessionTransactionV102};
