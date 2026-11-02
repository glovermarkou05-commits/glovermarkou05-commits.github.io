'use strict';

// V105. Optional backend-only bridge to official Supabase Auth APIs.
// The injected clientFactory MUST create an isolated server Auth client per
// request (persistSession:false, autoRefreshToken:false, no browser storage).
// It is never called in these offline tests with live credentials.
// getClaims verifies JWT; getUser retrieves a server-confirmed user;
// mfa.getAuthenticatorAssuranceLevel(jwt) checks current AAL over Auth API.
// This DOES NOT prove live auth.sessions revocation or an independent MFA event.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const METHODS=new Set(['totp','mfa/phone']);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(x));
const seconds=n=>Number.isSafeInteger(n)&&n>=1;
const allowedSignal=s=>s===undefined||(s instanceof AbortSignal);
const frozen=x=>Object.freeze(x);
function createAuthApiObservationV105({
 clientFactory, expectedIssuer, expectedAudience='authenticated',
 nowSec=()=>Math.floor(Date.now()/1000), maxAmrAgeSec=300
}={}){
 if(typeof clientFactory!=='function'||typeof nowSec!=='function'||
   typeof expectedIssuer!=='string'||!/^https:\/\/[a-z0-9.-]+\/auth\/v1$/.test(expectedIssuer)||
   typeof expectedAudience!=='string'||!/^[a-z0-9_-]{1,64}$/.test(expectedAudience)||
   !Number.isSafeInteger(maxAmrAgeSec)||maxAmrAgeSec<30||maxAmrAgeSec>300)
   throw new TypeError('Trusted per-request Auth client and issuer policy required');

 const clock=()=>{try{const t=nowSec();return seconds(t)?t:null;}catch{return null;}};
 async function observe(input={}){
  if(!plain(input)||Object.keys(input).sort().join(',')!==
    'accessToken,expectedSessionId,expectedSubject,signal' ||
    !UUID.test(input.expectedSubject||'')||!UUID.test(input.expectedSessionId||'')||
    typeof input.accessToken!=='string'||input.accessToken.length>8192||
    !JWT.test(input.accessToken)||!allowedSignal(input.signal)||
    input.signal?.aborted)return null;

  let client;
  try{client=await clientFactory(frozen({signal:input.signal,
     purpose:'AUTH_SIGNALS_ONLY_NO_SESSIONS_OR_SECRETS'}));}
  catch{return null;}
  if(input.signal?.aborted||!client||!client.auth||
    typeof client.auth.getClaims!=='function'||
    typeof client.auth.getUser!=='function'||
    !client.auth.mfa||typeof client.auth.mfa.getAuthenticatorAssuranceLevel!=='function')
    return null;

  let claimsResponse;
  try{claimsResponse=await client.auth.getClaims(input.accessToken);}
  catch{return null;}
  if(input.signal?.aborted||!plain(claimsResponse)||claimsResponse.error||
    !plain(claimsResponse.data)||!plain(claimsResponse.data.claims))return null;
  const c=claimsResponse.data.claims;
  let now=clock();
  if(now===null||c.sub!==input.expectedSubject||
    c.session_id!==input.expectedSessionId||
    c.iss!==expectedIssuer||
    !(c.aud===expectedAudience||
      (Array.isArray(c.aud)&&c.aud.length===1&&c.aud[0]===expectedAudience))||
    c.aal!=='aal2'||!seconds(c.iat)||c.iat>now||
    !seconds(c.exp)||c.exp<=now||
    !Array.isArray(c.amr)||c.amr.length<1||c.amr.length>8)return null;

  // JWT AMR is only accepted after getClaims verifies it. Even verified
  // JWT claims are NOT authoritative about session revocation.
  const supported=c.amr.filter(x=>plain(x)&&METHODS.has(x.method));
  if(c.amr.some(x=>!plain(x)||typeof x.method!=='string'||
     !seconds(x.timestamp)||x.timestamp>now)||supported.length!==1)return null;
  const amr=supported[0];
  if(now-amr.timestamp>maxAmrAgeSec)return null;

  let userResponse;
  try{userResponse=await client.auth.getUser(input.accessToken);}
  catch{return null;}
  if(input.signal?.aborted||!plain(userResponse)||userResponse.error||
    !plain(userResponse.data)||!plain(userResponse.data.user)||
    userResponse.data.user.id!==input.expectedSubject)return null;

  let aalResponse;
  try{aalResponse=await client.auth.mfa.getAuthenticatorAssuranceLevel(input.accessToken);}
  catch{return null;}
  now=clock();
  if(input.signal?.aborted||now===null||c.exp<=now||
    now-amr.timestamp>maxAmrAgeSec||
    !plain(aalResponse)||aalResponse.error||!plain(aalResponse.data)||
    aalResponse.data.currentLevel!=='aal2'||
    aalResponse.data.nextLevel!=='aal2'||
    !Array.isArray(aalResponse.data.currentAuthenticationMethods)||
    aalResponse.data.currentAuthenticationMethods.length<1||
    aalResponse.data.currentAuthenticationMethods.length>8||
    !aalResponse.data.currentAuthenticationMethods.some(x=>
      plain(x)&&x.method===amr.method&&x.timestamp===amr.timestamp))return null;

  // Avoid the V97/V98 proof shape: this is intentionally NOT an approval.
  return frozen({
    kind:'AUTH_API_SIGNAL_OBSERVATION',
    subject:input.expectedSubject,sessionId:input.expectedSessionId,
    amrMethod:amr.method,amrTimestampSec:amr.timestamp,
    observedAtSec:now,expiresAtSec:c.exp,
    jwtClaimsVerifiedByAuthClient:true,identityFetchedFromAuth:true,
    aal2ObservedFromAuth:true,
    // This is the safety boundary: none of the above replaces the
    // independent source needed for revocation/MFA and permission checks.
    sessionRevocationVerified:false,
    independentMfaChallengeProven:false,
    tenantPermissionVerified:false,
    canAuthorizeSensitiveAction:false,productionAuthorized:false,
    formalV67Pass:0
  });
 }
 return frozen({observe,readiness:frozen({
   mode:'OFFLINE_AUTH_API_CONTRACT_NOT_WIRED',
   supabaseConnected:false,
   activeSessionRevocationCheckAvailable:false,
   independentMfaChallengeProofAvailable:false,
   productionAuthorized:false,decision:'NO_GO'
 })});
}
module.exports={createAuthApiObservationV105};
