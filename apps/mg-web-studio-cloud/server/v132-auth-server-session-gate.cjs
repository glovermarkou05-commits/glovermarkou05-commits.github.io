'use strict';
// V132 QA-only, backend-only integration contract. No auth.sessions SQL,
// custom Auth RLS policies, service_role, refresh tokens or public endpoint.
// Supabase's documented auth.getUser(jwt) makes an Auth-server network request.
// It can detect remote sign-out at check time; NOT linearizable with COMMIT.
// AAL1 is allowed to START MFA; V127 separately requires verified AAL2
// *after* challenge/verify to mint the persistent MFA receipt.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QA_ISSUER='https://tbfhiqkivsoeuudlpkgi.supabase.co/auth/v1';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const exact=(o,k)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&
 Object.keys(o).length===k.length&&k.every(x=>own(o,x));
const valid=n=>Number.isSafeInteger(n)&&n>0;
function createV132AuthServerSessionGate({
 auth,accessToken,expectedIssuer=QA_ISSUER,
 nowSec=()=>Math.floor(Date.now()/1000)
}={}){
 if(!auth||typeof auth.getClaims!=='function'||typeof auth.getUser!=='function'||
  typeof accessToken!=='string'||accessToken.length<10||accessToken.length>16384||
  expectedIssuer!==QA_ISSUER||typeof nowSec!=='function')
  throw new TypeError('V132 requires QA-pinned Auth, access JWT and server clock');
 const jwt=accessToken;
 function tick(){try{const t=nowSec();return valid(t)?t:null;}catch{return null;}}
 async function verifyOne(checkToken=jwt){
  const started=tick();
  if(started===null||typeof checkToken!=='string'||
   checkToken.length<10||checkToken.length>16384)return null;
  let c,userResponse;
  try{
   // The configured real Supabase client must verify the JWT cryptographically.
   // This is not equivalent to decoding a client-provided JWT or getSession().
   const claimsResult=await auth.getClaims(checkToken);
   if(claimsResult?.error)return null;
   c=claimsResult?.data?.claims;
   if(!c||typeof c!=='object'||Array.isArray(c)||
    c.iss!==QA_ISSUER||
    !(c.aud==='authenticated'||
     (Array.isArray(c.aud)&&c.aud.length===1&&c.aud[0]==='authenticated'))||
    !['aal1','aal2'].includes(c.aal)||
    !UUID.test(c.sub||'')||!UUID.test(c.session_id||'')||
    !valid(c.exp)||c.exp<=started||
    (own(c,'iat')&&(!valid(c.iat)||c.iat>started+30))||
    (own(c,'nbf')&&(!valid(c.nbf)||c.nbf>started)))
    return null;
   // Do not cache this response. Explicit JWT ensures no session-global,
   // cookie or browser state can silently change the checked identity.
   userResponse=await auth.getUser(checkToken);
  }catch{return null;}
  const ended=tick();
  if(ended===null||ended<started||ended-started>2||c.exp<=ended||
   userResponse?.error||!UUID.test(userResponse?.data?.user?.id||'')||
   userResponse.data.user.id.toLowerCase()!==c.sub.toLowerCase())
   return null;
  return Object.freeze({
   subject:c.sub.toLowerCase(),sessionId:c.session_id.toLowerCase(),
   tokenExpiresAtSec:c.exp,checkedAtSec:ended,aal:c.aal
  });
 }
 async function authenticate(){
  const proof=await verifyOne();
  if(!proof)return null;
  const actor=Object.freeze({
   subject:proof.subject,sessionId:proof.sessionId,
   tokenExpiresAtSec:proof.tokenExpiresAtSec
  });
  // Only the private V127 bridge supplies the token returned by mfa.verify.
  // The pre-MFA checks keep using the original AAL1 token. After MFA, Auth
  // may rotate/revoke that token: check the new signed AAL2 token against
  // Auth server instead, still requiring the SAME subject and session.
  async function readActiveSession(input,verifiedMfaToken){
   if(!exact(input,['subject','sessionId'])||
    input.subject!==actor.subject||input.sessionId!==actor.sessionId)
    return null;
   const afterMfa=verifiedMfaToken!==undefined;
   if(afterMfa&&(typeof verifiedMfaToken!=='string'||
    verifiedMfaToken.length<10||verifiedMfaToken.length>16384||
    verifiedMfaToken===jwt))return null;
   const current=await verifyOne(afterMfa?verifiedMfaToken:jwt);
   if(!current||current.subject!==actor.subject||
    current.sessionId!==actor.sessionId||
    (afterMfa?current.aal!=='aal2':
     current.tokenExpiresAtSec!==actor.tokenExpiresAtSec))return null;
   return Object.freeze({
    active:true,authServerConfirmed:true,revocationChecked:true,
    checkedAtSec:current.checkedAtSec,expiresAtSec:current.tokenExpiresAtSec,
    subject:current.subject,sessionId:current.sessionId
   });
  }
  return Object.freeze({actor,readActiveSession});
 }
 return Object.freeze({
  authenticate,
  readiness:Object.freeze({
   labOnly:true,qaProjectPinned:true,usesOfficialGetUser:true,
   usesManagedAuthTableDirectly:false,requiresFreshAuthCallPerCheck:true,
   liveSupabaseAuthTested:false,
   postCheckRevocationRaceResolved:false,revocationLinearizable:false,
   productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
  })
 });
}
module.exports={createV132AuthServerSessionGate,QA_ISSUER};
