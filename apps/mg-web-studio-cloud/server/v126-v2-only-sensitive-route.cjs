'use strict';
// V126 reference composition only: NOT wired to a public endpoint.
// Security-sensitive routes can use V125 only, with a durable server-side
// verification store. No request-level version negotiation or fallback.
const {createV125UniqueVerificationGateway}=require('./v125-unique-verification-gateway.cjs');
const DENIED=Object.freeze({
 ok:false,atomicCommitConfirmed:false,productionAuthorized:false,formalV67Pass:0
});
const keys=['action','organizationId','proofReference','siteId'];
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function safeRequest(o){
 return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&
 Object.keys(o).length===4&&keys.every(k=>own(o,k));
}
function createV126V2OnlySensitiveRoute({verificationStore,authenticatedSubject,
 authenticatedSessionId,runAtomicOperation,ledgerHmacKey,nowSec}={}){
 if(!verificationStore||
  typeof verificationStore.readTrustedVerifiedEvent!=='function'||
  verificationStore.readiness?.labOnly!==true||
  verificationStore.readiness?.realSupabaseVerifierIntegrated!==false||
  verificationStore.readiness?.productionAuthorized!==false||
  typeof runAtomicOperation!=='function')
  throw new TypeError('V126 requires reviewed lab-only verification store and atomic operation');
 const gate=createV125UniqueVerificationGateway({
  authenticatedSubject,authenticatedSessionId,
  readTrustedVerifiedEvent:verificationStore.readTrustedVerifiedEvent,
  runAtomicOperation,ledgerHmacKey,nowSec
 });
 async function execute(input){
  // Legacy V109/V121 event keys, protocol selectors, downgrade toggles,
  // timestamps, sessions and JWTs cannot select an older implementation.
  if(!safeRequest(input))return DENIED;
  return gate.execute(input);
 }
 return Object.freeze({
  execute,
  readiness:Object.freeze({
   labOnly:true,protocol:'V125_EVENT_ID_V2_ONLY',
   legacyV109Allowed:false,legacyV121Allowed:false,
   clientProtocolNegotiation:false,publicRouteWired:false,
   productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
  })
 });
}
module.exports={createV126V2OnlySensitiveRoute};
