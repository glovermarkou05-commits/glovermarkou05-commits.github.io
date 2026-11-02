'use strict';

// V97 server-only STEP-UP contract for high-impact MG Web Studio operations.
// No network, no database driver, no JWT decoder, no outbound log or default
// authorization. Three trusted callbacks are required and supplied by backend.
// This is NOT a real Supabase MFA integration or approval to publish.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS=new Set(['publish','members','billing']);
const PROOF_KEYS=['aal','active','checkedAtSec','expiresAtSec','factorConfirmedAtSec',
  'factorVerified','revocationChecked','sessionId','subject','tokenSessionIdVerified'];
const deny=(status,code)=>Object.freeze({ok:false,status,code});
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(x));
const sec=x=>Number.isSafeInteger(x)&&x>=1;
const invalidSignal=x=>x!==undefined&&!(x instanceof AbortSignal);
function createSensitiveOperationGateV97({
 verifyAccessToken,readTrustedAssurance,authorizeResource,
 nowSec=()=>Math.floor(Date.now()/1000),
 maxProofAgeSec=3,maxFactorAgeSec=300
}={}){
 if(typeof verifyAccessToken!=='function'||typeof readTrustedAssurance!=='function'||
    typeof authorizeResource!=='function'||typeof nowSec!=='function'||
    !Number.isSafeInteger(maxProofAgeSec)||maxProofAgeSec<1||maxProofAgeSec>5||
    !Number.isSafeInteger(maxFactorAgeSec)||maxFactorAgeSec<30||maxFactorAgeSec>1800){
   throw new TypeError('Three trusted backend checks and bounded clock policy required');
 }
 async function check(input={}){
  if(!plain(input)||Object.keys(input).some(x=>![
     'authorization','organizationId','siteId','action','signal'].includes(x))||
     invalidSignal(input.signal)||input.signal?.aborted)
    return deny(400,'INVALID_REQUEST');

  const h=input.authorization;
  if(typeof h!=='string'||h.length>8192)
    return deny(401,'UNAUTHENTICATED');
  const m=/^Bearer ([A-Za-z0-9._~+\/-]+=*)$/i.exec(h);
  if(!m)return deny(401,'UNAUTHENTICATED');
  const token=m[1];
  let identity;
  try{identity=await verifyAccessToken(token);}
  catch{return deny(401,'UNAUTHENTICATED');}
  if(input.signal?.aborted||!plain(identity)||identity.verified!==true||
     typeof identity.subject!=='string'||!UUID.test(identity.subject))
    return deny(401,'UNAUTHENTICATED');

  // This action MUST be fixed by server routing, never a client JSON body.
  if(typeof input.organizationId!=='string'||!UUID.test(input.organizationId)||
     typeof input.siteId!=='string'||!UUID.test(input.siteId)||
     !ACTIONS.has(input.action))
    return deny(400,'INVALID_REQUEST');

  let proof;
  try{
   // The trusted adapter MUST verify active session_id binding to THIS token,
   // current server-side MFA factor and revocation from the source of truth.
   proof=await readTrustedAssurance(Object.freeze({
     subject:identity.subject,accessToken:token,signal:input.signal
   }));
  }catch{return deny(503,'RETRY_LATER');}
  if(input.signal?.aborted)return deny(503,'RETRY_LATER');
  let now;
  try{now=nowSec();}catch{return deny(503,'RETRY_LATER');}
  if(!sec(now))return deny(503,'RETRY_LATER');
  if(!plain(proof)||Object.keys(proof).sort().join(',')!==PROOF_KEYS.slice().sort().join(',')||
     proof.subject!==identity.subject||!UUID.test(proof.sessionId)||
     proof.active!==true||proof.revocationChecked!==true||
     proof.tokenSessionIdVerified!==true||
     proof.aal!=='aal2'||proof.factorVerified!==true||
     !sec(proof.checkedAtSec)||proof.checkedAtSec>now||
     now-proof.checkedAtSec>maxProofAgeSec||
     !sec(proof.factorConfirmedAtSec)||proof.factorConfirmedAtSec>now||
     now-proof.factorConfirmedAtSec>maxFactorAgeSec||
     !sec(proof.expiresAtSec)||proof.expiresAtSec<=now)
     return deny(403,'STEP_UP_REQUIRED');

  let allowed;
  try{
   // Resource permission is a SEPARATE fresh tenant authorization check.
   // Never use claims from JWT user_metadata, role, scope or an untrusted body.
   allowed=await authorizeResource(Object.freeze({
     actorId:identity.subject,organizationId:input.organizationId,
     siteId:input.siteId,action:input.action,signal:input.signal
   }));
  }catch{return deny(503,'RETRY_LATER');}
  if(input.signal?.aborted)return deny(503,'RETRY_LATER');
  if(allowed!==true)return deny(404,'RESOURCE_UNAVAILABLE');
  return Object.freeze({ok:true,stepUp:'verified'});
 }
 return Object.freeze({check,readiness:Object.freeze({
  mode:'TRUSTED_ADAPTER_REQUIRED',providerConnected:false,
  realMfaVerified:false,realSessionBindingVerified:false,
  productionAuthorized:false,decision:'NO_GO'
 })});
}
module.exports={createSensitiveOperationGateV97};
