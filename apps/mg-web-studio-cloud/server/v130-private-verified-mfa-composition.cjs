'use strict';
// V130 PRIVATE COMPOSITION ONLY. No public endpoint or export of a receipt writer.
// This binds V127's verified MFA callback to V126's durable receipt table.
// Trust anchor: V127 has called official MFA verify AND validated signed aal2
// claims, subject, session and primary session before invoking this callback.
// The Auth API and Postgres commit are NOT one transaction: fail closed.
const {createV127NativeMfaBridge}=require('./v127-supabase-native-mfa-bridge.cjs');
const {createV126DurableMfaEventStore}=require('./v126-durable-mfa-event-store.cjs');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const FIELDS=['checkedAtSec','factorOwnershipVerified','method','proofReference',
 'provenanceReviewed','receiptId','sessionBoundByAuthorizedFlow','sessionId',
 'subject','verified','verifiedAtSec'];
function exact(obj,fields){
 return obj!==null&&typeof obj==='object'&&!Array.isArray(obj)&&
  (Object.getPrototypeOf(obj)===Object.prototype||Object.getPrototypeOf(obj)===null)&&
  Object.keys(obj).length===fields.length&&fields.every(k=>own(obj,k));
}
const REJECT=Object.freeze({recorded:false});
function createV130PrivateVerifiedMfaComposition({
 auth,actor,readActiveSession,journal,verifySignedJwt,receiptKey,
 issuerPool,readerPool,nowSec=()=>Math.floor(Date.now()/1000),
 newReference,expectedIssuerRole,expectedReaderRole
}={}){
 if(!actor||typeof actor!=='object'||!UUID.test(actor.subject||'')||
  !UUID.test(actor.sessionId||'')||
  !issuerPool||typeof issuerPool.connect!=='function'||
  !readerPool||typeof readerPool.connect!=='function')
  throw new TypeError('V130: trusted backend actor and separate private PostgreSQL pools required');

 const storeOptions={issuerPool,readerPool,nowSec};
 if(expectedIssuerRole!==undefined)storeOptions.expectedIssuerRole=expectedIssuerRole;
 if(expectedReaderRole!==undefined)storeOptions.expectedReaderRole=expectedReaderRole;

 // A shared read-only adapter NEVER issues new MFA receipts.
 const reader=createV126DurableMfaEventStore({
  ...storeOptions,confirmAuthenticMfaReceipt:async()=>null
 });
 const subject=actor.subject.toLowerCase(),sessionId=actor.sessionId.toLowerCase();
 async function persistBridgeVerifiedReceipt(receipt){
  // This function is private to the V127 composition, not an exposed method
  // or public request handler. Only the V127 verified callback receives it.
  if(!exact(receipt,FIELDS)||receipt.verified!==true||
   receipt.factorOwnershipVerified!==true||receipt.provenanceReviewed!==true||
   receipt.sessionBoundByAuthorizedFlow!==true||
   typeof receipt.proofReference!=='string'||
   receipt.subject?.toLowerCase()!==subject||
   receipt.sessionId?.toLowerCase()!==sessionId)
   return REJECT;
  // Clone/freeze the verified object to prevent mutation across awaits.
  const attested=Object.freeze({...receipt});
  const input=Object.freeze({
   proofReference:attested.proofReference,subject,sessionId
  });
  const attester=async q=>
   exact(q,['proofReference','sessionId','subject'])&&
   q.proofReference===input.proofReference.toLowerCase()&&
   q.sessionId===sessionId&&q.subject===subject?attested:null;
  const issuer=createV126DurableMfaEventStore({
   ...storeOptions,confirmAuthenticMfaReceipt:attester
  });
  try{return await issuer.recordVerifiedOnce(input);}
  catch{return REJECT;}
 }
 const bridgeOptions={auth,actor,readActiveSession,journal,verifySignedJwt,
  receiptKey,nowSec,persistVerifiedReceipt:persistBridgeVerifiedReceipt};
 if(newReference!==undefined)bridgeOptions.newReference=newReference;
 const bridge=createV127NativeMfaBridge(bridgeOptions);
 return Object.freeze({
  begin:bridge.begin,confirm:bridge.confirm,
  readTrustedVerifiedEvent:reader.readTrustedVerifiedEvent,
  readiness:Object.freeze({
   labOnly:true,privateReceiptCallbackBound:true,
   receiptDatabaseContractIntegrated:true,
   liveAuthVerificationConfirmed:false,realQaJournalInstalled:false,
   externalIndependentReviewComplete:false,
   verifiedMfaAndReceiptCommitAtomic:false,revocationLinearizable:false,
   productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
  })
 });
}
module.exports={createV130PrivateVerifiedMfaComposition};
