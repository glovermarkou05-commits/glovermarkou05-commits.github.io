'use strict';
// V125 OFFLINE BACKEND CONTRACT ONLY; no real Auth, credentials or deployment.
// The trusted issuer must durably mint ONE unpredictable v4 UUID per successful
// MFA verification and return the SAME immutable event ID for every retry.
// Never mint a new ID when a request is replayed or re-read.
const {createHmac}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METHODS=new Set(['totp','mfa/phone']);
const ACTIONS=new Set(['publish','members','billing']);
const FIELDS=['checkedAtSec','eventId','eventIdBoundToVerification',
 'factorOwnershipVerified','method','proofReference','provenanceReviewed',
 'sessionBoundByAuthorizedFlow','sessionId','subject','verified','verifiedAtSec'];
const RESULT=['atomicCommitConfirmed','formalV67Pass','ok','productionAuthorized'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function exact(o,keys){return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&
 Object.keys(o).length===keys.length&&keys.every(k=>own(o,k));}
const second=n=>Number.isSafeInteger(n)&&n>0;
const DENIED=Object.freeze({ok:false,atomicCommitConfirmed:false,productionAuthorized:false,formalV67Pass:0});
const ACCEPTED=Object.freeze({ok:true,atomicCommitConfirmed:true,productionAuthorized:false,formalV67Pass:0});
function createV125UniqueVerificationGateway({authenticatedSubject,authenticatedSessionId,
 readTrustedVerifiedEvent,runAtomicOperation,ledgerHmacKey,
 nowSec=()=>Math.floor(Date.now()/1000)}={}){
 if(!UUID.test(authenticatedSubject||'')||!UUID.test(authenticatedSessionId||'')||
  typeof readTrustedVerifiedEvent!=='function'||typeof runAtomicOperation!=='function'||
  !Buffer.isBuffer(ledgerHmacKey)||ledgerHmacKey.length<32||typeof nowSec!=='function')
  throw new TypeError('V125: backend identity, trusted durable event issuer, HMAC and transaction required');
 const subject=authenticatedSubject.toLowerCase(),sessionId=authenticatedSessionId.toLowerCase();
 const secret=Buffer.from(ledgerHmacKey);
 function clock(){try{const t=nowSec();return second(t)?t:null;}catch{return null;}}
 async function execute(input){
  if(!exact(input,['action','organizationId','proofReference','siteId'])||
   !ACTIONS.has(input.action)||!UUID.test(input.organizationId||'')||
   !UUID.test(input.siteId||'')||!UUID.test(input.proofReference||''))return DENIED;
  let record;
  try{
   record=await readTrustedVerifiedEvent(Object.freeze({
    proofReference:input.proofReference,subject,sessionId
   }));
  }catch{return DENIED;}
  const now=clock();
  if(now===null||!exact(record,FIELDS)||!EVENT_ID.test(record.eventId||'')||
   record.eventIdBoundToVerification!==true||record.verified!==true||
   record.factorOwnershipVerified!==true||record.provenanceReviewed!==true||
   record.sessionBoundByAuthorizedFlow!==true||!METHODS.has(record.method)||
   typeof record.proofReference!=='string'||
   record.proofReference.toLowerCase()!==input.proofReference.toLowerCase()||
   typeof record.subject!=='string'||record.subject.toLowerCase()!==subject||
   typeof record.sessionId!=='string'||record.sessionId.toLowerCase()!==sessionId||
   !second(record.checkedAtSec)||record.checkedAtSec>now||
   now-record.checkedAtSec>2||!second(record.verifiedAtSec)||
   record.verifiedAtSec>now||now-record.verifiedAtSec>300)return DENIED;
  // v2 domain separation from legacy V109/V121. The stable trusted event ID
  // alone defines the one-time key: timestamp, actor, tenant, method, site and
  // action CANNOT generate a new key for the same server-issued event ID.
  // Uniqueness and permanence depend on the unimplemented issuer contract.
  const message='mg-v125-mfa-event-v2|'+record.eventId.toLowerCase();
  const eventKey=createHmac('sha256',secret).update(message,'utf8').digest('hex');
  const beforeHandoff=clock();
  if(beforeHandoff===null||beforeHandoff<now||
   beforeHandoff-record.checkedAtSec>2||beforeHandoff-record.verifiedAtSec>300)return DENIED;
  const payload=Object.freeze({action:input.action,eventKey,organizationId:input.organizationId,
   sessionId,siteId:input.siteId,subject,verifiedAtSec:record.verifiedAtSec});
  let result;
  try{result=await runAtomicOperation(payload);}catch{return DENIED;}
  if(!exact(result,RESULT)||result.ok!==true||result.atomicCommitConfirmed!==true||
   result.productionAuthorized!==false||result.formalV67Pass!==0)return DENIED;
  return ACCEPTED;
 }
 return Object.freeze({execute,readiness:Object.freeze({
  labOnly:true,realTrustedEventIssuerConnected:false,immutableEventIssuanceVerifiedInQA:false,
  liveAuthSessionReaderConnected:false,revocationLinearizable:false,
  businessOperationReal:false,productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 })});
}
module.exports={createV125UniqueVerificationGateway};