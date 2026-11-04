'use strict';
// V128 uses official Supabase auth.getClaims(jwt), which verifies JWT signatures
// against JWKS or delegates validation to Auth for symmetric signing keys.
// Does not parse unsigned JWTs or infer revocation from a valid signature.
// The supplied Auth client MUST be scoped to a pinned trusted Supabase project.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // not used for trust
const FULL_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid=x=>Number.isSafeInteger(x)&&x>0;
const own=(a,k)=>Object.prototype.hasOwnProperty.call(a,k);
function createV128SupabaseClaimsVerifier({auth,expectedIssuer,expectedAudience='authenticated',
 nowSec=()=>Math.floor(Date.now()/1000)}={}){
 if(!auth||typeof auth.getClaims!=='function'||
  typeof expectedIssuer!=='string'||!/^https:\/\/[a-z0-9-]+\.supabase\.co\/auth\/v1\/?$/.test(expectedIssuer)||
  expectedAudience!=='authenticated'||typeof nowSec!=='function')
  throw new TypeError('Pinned Supabase JWT issuer and official getClaims client required');
 const issuer=expectedIssuer.replace(/\/$/,'');
 async function verifySignedJwt(accessToken){
  if(typeof accessToken!=='string'||accessToken.length<10||accessToken.length>16384)
   return null;
  let data;
  try{data=await auth.getClaims(accessToken);}catch{return null;}
  const c=data?.data?.claims;
  if(data?.error||!c||typeof c!=='object'||Array.isArray(c))return null;
  let t;
  try{t=nowSec();}catch{return null;}
  if(!valid(t)||c.iss!==issuer||c.aal!=='aal2'||
   !FULL_UUID.test(c.sub||'')||!FULL_UUID.test(c.session_id||'')||
   !valid(c.exp)||c.exp<=t||
   !own(c,'aud')||!(c.aud==='authenticated'||
    (Array.isArray(c.aud)&&c.aud.length===1&&c.aud[0]==='authenticated'))||
   (own(c,'iat')&&(!valid(c.iat)||c.iat>t+30))||
   (own(c,'nbf')&&(!valid(c.nbf)||c.nbf>t)))
   return null;
  return Object.freeze({aal:'aal2',exp:c.exp,
   session_id:c.session_id.toLowerCase(),sub:c.sub.toLowerCase()});
 }
 return Object.freeze({verifySignedJwt,readiness:Object.freeze({
  labOnly:true,liveAuthGetClaimsConnected:false,
  databaseSessionRevocationChecked:false,productionAuthorized:false,
  formalV67Pass:0,decision:'NO_GO'
 })});
}
module.exports={createV128SupabaseClaimsVerifier};
