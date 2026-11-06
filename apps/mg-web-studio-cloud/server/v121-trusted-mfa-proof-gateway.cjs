'use strict';
// V121: BACKEND-ONLY, OFFLINE COMPOSITION CONTRACT. NOT DEPLOYED.
// A trusted server supplies authenticatedSubject / authenticatedSessionId
// and resolves the opaque proofReference using an independently checked
// MFA proof service. No client-provided eventKey, subject, session or claims.
const {createHmac}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['publish','members','billing']);
const METHODS=new Set(['totp','mfa/phone']);
const PROOF_KEYS=[
 'checkedAtSec','factorOwnershipVerified','method','provenanceReviewed',
 'sessionBoundByAuthorizedFlow','sessionId','subject','verified','verifiedAtSec'
];
const RESPONSE_KEYS=['ok','atomicCommitConfirmed','productionAuthorized','formalV67Pass'];
function exact(o,keys){
 return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&
  Object.keys(o).length===keys.length&&
  keys.every(k=>Object.prototype.hasOwnProperty.call(o,k));
}
function validSecond(v){return Number.isSafeInteger(v)&&v>0;}
function deny(){return Object.freeze({
 ok:false,atomicCommitConfirmed:false,productionAuthorized:false,formalV67Pass:0
});}
function accept(){return Object.freeze({
 ok:true,atomicCommitConfirmed:true,productionAuthorized:false,formalV67Pass:0
});}
function createV121TrustedMfaProofGateway({
 authenticatedSubject,authenticatedSessionId,readTrustedMfaProof,
 runAtomicOperation,ledgerHmacKey,nowSec=()=>Math.floor(Date.now()/1000)
}={}){
 if(!UUID.test(authenticatedSubject||'')||!UUID.test(authenticatedSessionId||'')||
    typeof readTrustedMfaProof!=='function'||typeof runAtomicOperation!=='function'||
    !Buffer.isBuffer(ledgerHmacKey)||ledgerHmacKey.length<32||typeof nowSec!=='function')
  throw new TypeError('V121 requires a trusted server identity, proof provider and shared HMAC key');
 // Avoid a caller mutating the original key while an operation is in-flight.
 const key=Buffer.from(ledgerHmacKey);
 const subject=authenticatedSubject.toLowerCase();
 const sessionId=authenticatedSessionId.toLowerCase();
 function clock(){try{const n=nowSec();return validSecond(n)?n:null;}catch{return null;}}
 async function execute(input){
  if(!exact(input,['action','organizationId','proofReference','siteId'])||
     !ACTIONS.has(input.action)||!UUID.test(input.organizationId||'')||
     !UUID.test(input.siteId||'')||!UUID.test(input.proofReference||''))
   return deny();
  let proof;
  try{
   proof=await readTrustedMfaProof(Object.freeze({
    proofReference:input.proofReference,subject,sessionId
   }));
  }catch{return deny();}
  const now=clock();
  if(now===null||!exact(proof,PROOF_KEYS)||
     proof.verified!==true||proof.factorOwnershipVerified!==true||
     proof.provenanceReviewed!==true||proof.sessionBoundByAuthorizedFlow!==true||
     !METHODS.has(proof.method)||!UUID.test(proof.subject||'')||
     !UUID.test(proof.sessionId||'')||
     proof.subject.toLowerCase()!==subject||
     proof.sessionId.toLowerCase()!==sessionId||
     !validSecond(proof.checkedAtSec)||proof.checkedAtSec>now||
     now-proof.checkedAtSec>2||
     !validSecond(proof.verifiedAtSec)||proof.verifiedAtSec>now||
     now-proof.verifiedAtSec>300)
   return deny();
  // Mirror V109 exactly. Never include action or tenant in this event key:
  // one verified MFA event must not be spent again on a different action.
  const message=['mg-v109-mfa-event-v1',subject,sessionId,proof.method,proof.verifiedAtSec].join('|');
  const eventKey=createHmac('sha256',key).update(message,'utf8').digest('hex');
  const payload=Object.freeze({
   action:input.action,eventKey,organizationId:input.organizationId,
   sessionId,siteId:input.siteId,subject,verifiedAtSec:proof.verifiedAtSec
  });
  if(clock()===null||clock()-proof.checkedAtSec>2)return deny();
  let result;
  try{result=await runAtomicOperation(payload);}
  catch{return deny();}
  // A mocked provider cannot promote production readiness or formal signoff.
  if(!exact(result,RESPONSE_KEYS)||result.ok!==true||
     result.atomicCommitConfirmed!==true||
     result.productionAuthorized!==false||result.formalV67Pass!==0)return deny();
  return accept();
 }
 return Object.freeze({
  execute,
  readiness:Object.freeze({
   backendOnly:true,liveProofProviderIntegrated:false,
   realSessionRevocationVerified:false,businessOperationIntegrated:false,
   productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
  })
 });
}
module.exports={createV121TrustedMfaProofGateway};
