'use strict';

// V109: BACKEND-ONLY, OFFLINE CONTRACT. No Supabase connection, table creation,
// database driver, secret IO, timers or production authorization.
// Source must be a trusted V102/V101 checked proof, never client JSON.
// A real deployment needs a reviewed, transactionally atomic *shared*
// insert-if-absent ledger and an authoritative current auth.sessions check.
const {createHmac}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['publish','members','billing']);
const METHODS=new Set(['totp','mfa/phone']);
const P=Object.prototype;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const exact=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length&&
  keys.every(k=>P.hasOwnProperty.call(o,k));
const second=n=>Number.isSafeInteger(n)&&n>0;
const signalOk=s=>s===undefined||s instanceof AbortSignal&&!s.aborted;
const PROOF_KEYS=['checkedAtSec','factorOwnershipVerified','method',
 'provenanceReviewed','sessionBoundByAuthorizedFlow','sessionId','subject',
 'verified','verifiedAtSec'];
const SESSION_KEYS=['active','checkedAtSec','expiresAtSec','primaryRead',
 'revocationChecked','sessionId','subject'];
const CONSUME_KEYS=['committed','inserted','shared','storedUntilSec'];
const safe=()=>Object.freeze({
 ok:false,productionAuthorized:false,formalV67Pass:0
});
function createAtomicMfaRedemptionV109({
 readPrimarySession,authorizeResource,consumeEventAtomically,ledgerHmacKey,
 nowSec=()=>Math.floor(Date.now()/1000),
 maxProofAgeSec=2,maxFactorAgeSec=300
}={}){
 if(typeof readPrimarySession!=='function'||typeof authorizeResource!=='function'||
   typeof consumeEventAtomically!=='function'||typeof nowSec!=='function'||
   !Buffer.isBuffer(ledgerHmacKey)||ledgerHmacKey.length<32||
   !Number.isSafeInteger(maxProofAgeSec)||maxProofAgeSec<1||maxProofAgeSec>3||
   !Number.isSafeInteger(maxFactorAgeSec)||maxFactorAgeSec<60||
   maxFactorAgeSec>300)
   throw new TypeError('Trusted primary session, tenant and shared ledger adapters required');
 const clock=()=>{try{const v=nowSec();return second(v)?v:null;}catch{return null;}};
 async function redeem(input={}){
  // Prevent a client from supplying a role, claims, arbitrary token or store key.
  if(!exact(input,['action','organizationId','proof','signal','siteId'])||
    !ACTIONS.has(input.action)||!UUID.test(input.organizationId||'')||
    !UUID.test(input.siteId||'')||!signalOk(input.signal))return safe();
  const proof=input.proof;
  if(!exact(proof,PROOF_KEYS)||proof.verified!==true||
     proof.factorOwnershipVerified!==true||proof.provenanceReviewed!==true||
     proof.sessionBoundByAuthorizedFlow!==true||
     !UUID.test(proof.subject||'')||!UUID.test(proof.sessionId||'')||
     !METHODS.has(proof.method)||!second(proof.checkedAtSec)||
     !second(proof.verifiedAtSec))return safe();
  let now=clock();
  if(now===null||proof.checkedAtSec>now||
     now-proof.checkedAtSec>maxProofAgeSec||
     proof.verifiedAtSec>now||now-proof.verifiedAtSec>maxFactorAgeSec)return safe();

  // LIVE PRIMARY READ must be checked independently of JWT signature/AAL.
  let current;
  try{current=await readPrimarySession(Object.freeze({
    subject:proof.subject,sessionId:proof.sessionId,signal:input.signal
  }));}catch{return safe();}
  now=clock();
  if(!signalOk(input.signal)||now===null||!exact(current,SESSION_KEYS)||
    current.active!==true||current.primaryRead!==true||
    current.revocationChecked!==true||
    current.subject!==proof.subject||current.sessionId!==proof.sessionId||
    !second(current.checkedAtSec)||current.checkedAtSec>now||
    now-current.checkedAtSec>2||
    !second(current.expiresAtSec)||current.expiresAtSec<=now||
    now-proof.checkedAtSec>maxProofAgeSec||
    now-proof.verifiedAtSec>maxFactorAgeSec)return safe();

  let permission;
  try{permission=await authorizeResource(Object.freeze({
    actorId:proof.subject,organizationId:input.organizationId,
    siteId:input.siteId,action:input.action,signal:input.signal
  }));}catch{return safe();}
  now=clock();
  if(!signalOk(input.signal)||permission!==true||now===null||
    now-current.checkedAtSec>2||now-proof.checkedAtSec>maxProofAgeSec||
    now-proof.verifiedAtSec>maxFactorAgeSec)return safe();

  // Same secret key required across ALL nodes. Do NOT include action/tenant:
  // one MFA event cannot be spent once for each action or organization.
  const message=['mg-v109-mfa-event-v1',proof.subject.toLowerCase(),
    proof.sessionId.toLowerCase(),proof.method,proof.verifiedAtSec].join('|');
  const eventKey=createHmac('sha256',ledgerHmacKey)
    .update(message,'utf8').digest('hex');
  const tombstoneUntil=proof.verifiedAtSec+maxFactorAgeSec+10;
  let insertion;
  try{insertion=await consumeEventAtomically(Object.freeze({
    eventKey,consumeUntilSec:tombstoneUntil,
    action:input.action,organizationId:input.organizationId,
    siteId:input.siteId,signal:input.signal
  }));}catch{return safe();}
  now=clock();
  if(!signalOk(input.signal)||now===null||now-current.checkedAtSec>2||
    now-proof.checkedAtSec>maxProofAgeSec||
    !exact(insertion,CONSUME_KEYS)||insertion.committed!==true||
    insertion.inserted!==true||insertion.shared!==true||
    !second(insertion.storedUntilSec)||
    insertion.storedUntilSec<tombstoneUntil)return safe();

  // This module may not execute a business operation. The caller must
  // coordinate ledger consumption and the action in one reviewed transaction;
  // never claim production readiness from an injected provider's assertions.
  return Object.freeze({
    ok:true,mode:'INJECTED_ATOMIC_LEDGER_CONTRACT',
    eventRedeemed:true,productionAuthorized:false,
    formalV67Pass:0
  });
 }
 return Object.freeze({redeem,
  readiness:Object.freeze({
    mode:'INJECTED_ATOMIC_LEDGER_OFFLINE',
    primarySessionConnected:false,
    distributedStoreConnected:false,
    sharedKeyOperationallyVerified:false,
    businessTransactionIntegrated:false,
    productionAuthorized:false,formalV67Pass:0,
    decision:'NO_GO'
  })
 });
}
module.exports={createAtomicMfaRedemptionV109};
