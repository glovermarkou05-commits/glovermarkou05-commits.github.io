'use strict';
// V127: OFFLINE QA HANDOFF ADAPTER, NOT WIRED TO ANY PUBLIC ROUTE.
// Uses the documented per-user Supabase auth.mfa.listFactors/challenge/verify API,
// never service_role; the client and verified actor come from a trusted backend.
// Journal, token verifier and receipt writer MUST be independent durable services.
// This cannot atomically commit Supabase Auth verify + external receipt DB write.
const {createHmac,randomUUID}=require('node:crypto');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE=/^[0-9]{6}$/;
const NO=Object.freeze({ok:false,productionAuthorized:false,formalV67Pass:0});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const exact=(o,keys)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&
 Object.keys(o).length===keys.length&&keys.every(k=>own(o,k));
const secureTime=n=>Number.isSafeInteger(n)&&n>0;
function createV127NativeMfaBridge({auth,actor,readActiveSession,journal,
 verifySignedJwt,persistVerifiedReceipt,receiptKey,
 nowSec=()=>Math.floor(Date.now()/1000),newReference=randomUUID}={}){
 if(!auth||!auth.mfa||['listFactors','challenge','verify'].some(f=>typeof auth.mfa[f]!=='function')||
  !exact(actor,['sessionId','subject','tokenExpiresAtSec'])||
  !UUID.test(actor.sessionId||'')||!UUID.test(actor.subject||'')||
  !secureTime(actor.tokenExpiresAtSec)||
  typeof readActiveSession!=='function'||!journal||
  ['createPending','claimPending'].some(f=>typeof journal[f]!=='function')||
  typeof verifySignedJwt!=='function'||typeof persistVerifiedReceipt!=='function'||
  !Buffer.isBuffer(receiptKey)||receiptKey.length<32||
  typeof nowSec!=='function'||typeof newReference!=='function')
  throw new TypeError('V127 requires trusted scoped Auth client, actor, durable journal and token verifier');
 const subject=actor.subject.toLowerCase(),sessionId=actor.sessionId.toLowerCase();
 const key=Buffer.from(receiptKey);
 function tick(){try{const t=nowSec();return secureTime(t)?t:null;}catch{return null;}}
 async function sessionOk(verifiedMfaToken){
  const started=tick();
  if(started===null||actor.tokenExpiresAtSec<=started)return false;
  try{
   const r=await readActiveSession(Object.freeze({subject,sessionId}),verifiedMfaToken);
   // Auth checks finish AFTER the request starts. A valid server timestamp
   // may be one second later: compare against a clock read AFTER the response.
   // Keep the two-second freshness bound, expiry and revocation fail-closed.
   const checked=tick();
   return checked!==null&&checked>=started&&
    actor.tokenExpiresAtSec>checked&&
    r!==null&&typeof r==='object'&&r.active===true&&
    (r.primaryRead===true||r.authServerConfirmed===true)&&r.revocationChecked===true&&
    r.subject===subject&&r.sessionId===sessionId&&
    secureTime(r.checkedAtSec)&&secureTime(r.expiresAtSec)&&
    r.checkedAtSec>=started&&r.checkedAtSec<=checked&&
    checked-r.checkedAtSec<=2&&r.expiresAtSec>checked;
  }catch{return false;}
 }
 function stableReceiptId(challengeId){
  const b=createHmac('sha256',key)
   .update('mg-v127-auth-mfa-challenge-v1|'+challengeId.toLowerCase()+'|'+subject+'|'+sessionId)
   .digest().subarray(0,16);
  b[6]=(b[6]&0x0f)|0x40;b[8]=(b[8]&0x3f)|0x80;
  const h=b.toString('hex');
  return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
 }
 async function begin(input){
  if(!exact(input,['factorId'])||!UUID.test(input.factorId||'')||
   !await sessionOk())return NO;
  try{
   const f=await auth.mfa.listFactors();
   if(f?.error||!f?.data||!Array.isArray(f.data.totp)||!Array.isArray(f.data.phone))return NO;
   const found=[
    ...f.data.totp.map(x=>({...x,_method:'totp'})),
    ...f.data.phone.map(x=>({...x,_method:'mfa/phone'}))
   ].find(x=>x.id?.toLowerCase()===input.factorId.toLowerCase()&&x.status==='verified');
   if(!found||!await sessionOk())return NO;
   const c=await auth.mfa.challenge({factorId:found.id});
   if(c?.error||!UUID.test(c?.data?.id||''))return NO;
   const proofReference=newReference();
   const t=tick();
   if(!UUID.test(proofReference||'')||t===null)return NO;
   const pending=Object.freeze({
    proofReference:proofReference.toLowerCase(),challengeId:c.data.id.toLowerCase(),
    factorId:found.id.toLowerCase(),subject,sessionId,method:found._method,createdAtSec:t
   });
   const saved=await journal.createPending(pending);
   if(saved?.recorded!==true)return NO;
   return Object.freeze({ok:true,proofReference:pending.proofReference,
    productionAuthorized:false,formalV67Pass:0});
  }catch{return NO;}
 }
 async function confirm(input){
  if(!exact(input,['code','proofReference'])||
   !CODE.test(input.code||'')||!UUID.test(input.proofReference||'')||
   !await sessionOk())return NO;
  let claim;
  try{
   // Must be atomic compare-and-claim in backend store; never release a claim
   // for automatic retry after verification uncertainty.
   claim=await journal.claimPending(Object.freeze({
    proofReference:input.proofReference.toLowerCase(),subject,sessionId
   }));
   const t=tick();
   if(!claim||claim.claimed!==true||
    !exact(claim,['challengeId','claimed','createdAtSec','factorId','method','proofReference','sessionId','subject'])||
    claim.proofReference!==input.proofReference.toLowerCase()||
    claim.subject!==subject||claim.sessionId!==sessionId||
    !UUID.test(claim.challengeId||'')||!UUID.test(claim.factorId||'')||
    !['totp','mfa/phone'].includes(claim.method)||
    t===null||!secureTime(claim.createdAtSec)||t<claim.createdAtSec||t-claim.createdAtSec>300)
    return NO;
   // No user-selected factorId/challengeId can enter this invocation.
   const v=await auth.mfa.verify({
    factorId:claim.factorId,challengeId:claim.challengeId,code:input.code
   });
   if(v?.error||typeof v?.data?.access_token!=='string')return NO;
   // verifySignedJwt must cryptographically verify the returned access token.
   // The bridge does not parse an unverified JWT or trust browser claims.
   const assertions=await verifySignedJwt(v.data.access_token);
   const at=tick();
   if(!exact(assertions,['aal','exp','session_id','sub'])||
    assertions.aal!=='aal2'||assertions.sub!==subject||
    assertions.session_id!==sessionId||!secureTime(assertions.exp)||
    at===null||assertions.exp<=at||!await sessionOk(v.data.access_token))return NO;
   const receipt=Object.freeze({
    checkedAtSec:at,proofReference:claim.proofReference,receiptId:stableReceiptId(claim.challengeId),
    subject,sessionId,method:claim.method,verifiedAtSec:at,
    factorOwnershipVerified:true,provenanceReviewed:true,
    sessionBoundByAuthorizedFlow:true,verified:true
   });
   // This writer must ensure durable atomic persistence before acknowledging.
   // If write fails after Auth success, deny; require NEW MFA challenge.
   const stored=await persistVerifiedReceipt(receipt);
   if(stored?.recorded!==true)return NO;
   return Object.freeze({ok:true,proofReference:claim.proofReference,
    productionAuthorized:false,formalV67Pass:0});
  }catch{return NO;}
 }
 return Object.freeze({begin,confirm,readiness:Object.freeze({
  labOnly:true,realSupabaseClientConnected:false,
  authMfaChallengesUsedViaOfficialApi:true,privateJournalImplemented:false,
  liveJwtVerifierConnected:false,issuanceCrashConsistencyAudited:false,
  productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 })});
}
module.exports={createV127NativeMfaBridge};
