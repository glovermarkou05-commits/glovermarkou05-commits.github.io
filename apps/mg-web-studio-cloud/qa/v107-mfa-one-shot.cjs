'use strict';
// V107 isolated, one-shot TOTP QA engine. It NEVER imports Supabase directly.
// Only the CLI (with private secrets) may inject Supabase SDK clients.
// All results are redacted. No SQL, no production, no implicit retries.
const {createHash,timingSafeEqual,randomBytes,createHmac}=require('node:crypto');
const REF_SHA256='70a3cf30593d4b0413a07196bdb6caf9f2c9c927427ead6616e70c4362bcb406';
const PROJECT_NAME='MG WEB STUDIO AUTH QA';
const TEST_EMAIL='mg-webstudio-v107-qa@example.invalid';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stageNames=new Set(['PREFLIGHT','EMPTY_LAB','CREATE','SIGN_IN','AAL1',
  'ENROLL','CHALLENGE','VERIFY','AAL2','LOGOUT','DELETE','COMPLETE']);
const result=(stage,cleanup,passed)=>Object.freeze({passed,stage,
  cleanup,productionAuthorized:false,formalV67Pass:0});
function validateScope({projectRef,projectUrl,projectName}={}){
 if(typeof projectRef!=='string'||!/^[a-z]{20}$/.test(projectRef)||
    typeof projectUrl!=='string'||projectUrl!=='https://'+projectRef+'.supabase.co'||
    projectName!==PROJECT_NAME)return false;
 const a=Buffer.from(createHash('sha256').update(projectRef).digest('hex'),'hex');
 const b=Buffer.from(REF_SHA256,'hex');
 return a.length===b.length&&timingSafeEqual(a,b);
}
function base32Decode(secret){
 if(typeof secret!=='string')return null;
 const v=secret.toUpperCase().replace(/=+$/,'').replace(/\s/g,'');
 if(v.length<16||v.length>256||!/^[A-Z2-7]+$/.test(v))return null;
 let bits=0,acc=0;const bytes=[];
 for(const c of v){const n='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c);
  acc=(acc<<5)|n;bits+=5;if(bits>=8){bits-=8;bytes.push((acc>>>bits)&255);}}
 return Buffer.from(bytes);
}
function totp(secret,atMs){
 const key=base32Decode(secret);
 if(!key||key.length<10||!Number.isSafeInteger(atMs)||atMs<0)return null;
 const n=BigInt(Math.floor(atMs/30000));const b=Buffer.alloc(8);b.writeBigUInt64BE(n);
 const h=createHmac('sha1',key).update(b).digest();
 const off=h[h.length-1]&15;
 return String((h.readUInt32BE(off)&0x7fffffff)%1000000).padStart(6,'0');
}
function shape(admin,user){
 const a=admin?.auth?.admin,u=user?.auth;
 return typeof a?.listUsers==='function'&&typeof a?.createUser==='function'&&
 typeof a?.deleteUser==='function'&&typeof u?.signInWithPassword==='function'&&
 typeof u?.getClaims==='function'&&typeof u?.getUser==='function'&&
 typeof u?.mfa?.enroll==='function'&&typeof u?.mfa?.challenge==='function'&&
 typeof u?.mfa?.verify==='function'&&
 typeof u?.mfa?.getAuthenticatorAssuranceLevel==='function'&&
 typeof u?.signOut==='function';
}
function createOneShotMfaQaV107({admin,user,nowMs=()=>Date.now(),
 passwordFactory=()=>randomBytes(36).toString('base64url')+'A1!',scope}={}){
 let attempted=false;
 async function run(){
  if(attempted)return result('PREFLIGHT','NOT_NEEDED',false);
  attempted=true;
  // The supported CLI separately binds these injected clients to the pinned QA ref.
  if(!shape(admin,user)||typeof nowMs!=='function'||
     typeof passwordFactory!=='function')return result('PREFLIGHT','NOT_NEEDED',false);
  let stage='EMPTY_LAB',createdId=null,createAttempted=false,sessionEstablished=false,passed=false;
  let logoutOk=false,deleteOk=false;
  try{
   // New isolated project must start empty. Never enumerate other projects.
   const list=await admin.auth.admin.listUsers({page:1,perPage:2});
   if(list?.error||!Array.isArray(list?.data?.users)||
      list.data.users.length!==0)throw Error('unsafe_scope');
   stage='CREATE';
   const password=passwordFactory();
   if(typeof password!=='string'||password.length<32)throw Error('weak_password');
   createAttempted=true;
   const created=await admin.auth.admin.createUser({
      email:TEST_EMAIL,password,email_confirm:true
   });
   if(created?.error||!UUID.test(created?.data?.user?.id||''))
      throw Error('create_failed');
   createdId=created.data.user.id;

   stage='SIGN_IN';
   const signed=await user.auth.signInWithPassword({email:TEST_EMAIL,password});
   sessionEstablished=!signed?.error&&!!signed?.data?.user;
   const oldToken=signed?.data?.session?.access_token;
   if(signed?.error||signed?.data?.user?.id!==createdId||
      typeof oldToken!=='string'||oldToken.length<20)throw Error('login_failed');
   sessionEstablished=true;

   stage='AAL1';
   const initial=await user.auth.getClaims(oldToken);
   const before=initial?.data?.claims;
   if(initial?.error||before?.sub!==createdId||
      !UUID.test(before?.session_id||'')||before?.aal!=='aal1'||
      !Number.isSafeInteger(before?.exp)||before.exp<=Math.floor(nowMs()/1000))
      throw Error('wrong_before_claims');
   const originalSession=before.session_id;

   stage='ENROLL';
   const enrolled=await user.auth.mfa.enroll({
      factorType:'totp',friendlyName:'MG-V107-QA-ONLY'
   });
   const factor=enrolled?.data;
   if(enrolled?.error||!UUID.test(factor?.id||'')||
      typeof factor?.totp?.secret!=='string')throw Error('enroll_failed');

   stage='CHALLENGE';
   const challenge=await user.auth.mfa.challenge({factorId:factor.id});
   if(challenge?.error||!UUID.test(challenge?.data?.id||''))
      throw Error('challenge_failed');

   stage='VERIFY';
   const code=totp(factor.totp.secret,nowMs());
   if(!code)throw Error('invalid_totp_seed');
   const verified=await user.auth.mfa.verify({
      factorId:factor.id,challengeId:challenge.data.id,code
   });
   const newToken=verified?.data?.access_token||verified?.data?.session?.access_token;
   if(verified?.error||typeof newToken!=='string'||newToken.length<20)
      throw Error('verify_failed');

   stage='AAL2';
   const [jwt,identity,assurance]=await Promise.all([
     user.auth.getClaims(newToken),
     user.auth.getUser(newToken),
     user.auth.mfa.getAuthenticatorAssuranceLevel(newToken)
   ]);
   const claims=jwt?.data?.claims;
   const current=assurance?.data;
   const now=Math.floor(nowMs()/1000);
   if(jwt?.error||identity?.error||assurance?.error||
      claims?.sub!==createdId||identity?.data?.user?.id!==createdId||
      claims?.session_id!==originalSession||claims?.aal!=='aal2'||
      current?.currentLevel!=='aal2'||!Number.isSafeInteger(claims?.exp)||
      claims.exp<=now||!Array.isArray(claims.amr)||
      !claims.amr.some(m=>m?.method==='totp'&&
       Number.isSafeInteger(m.timestamp)&&m.timestamp<=now&&
       now-m.timestamp<=300))
      throw Error('unverified_post_mfa_session');
   passed=true;stage='COMPLETE';
  }catch{
   // Error categories only; never print thrown errors, user ID or secrets.
   passed=false;
  }finally{
   if(sessionEstablished){
    try{const out=await user.auth.signOut({scope:'global'});
      logoutOk=!out?.error;}catch{logoutOk=false;}
   }else logoutOk=true; // no session was obtained
   if(createdId){
    try{const out=await admin.auth.admin.deleteUser(createdId);
      deleteOk=!out?.error;}catch{deleteOk=false;}
   }else deleteOk=true; // no identified user was created
  }
  // Missing signOut or delete confirmation is a FAILURE even after successful MFA.
  const cleanup=createAttempted&&!createdId?'MANUAL_REVIEW_CREATION_UNCERTAIN':
   deleteOk&&logoutOk?'CONFIRMED':
   deleteOk?'PARTIAL_SIGNOUT_FAILED':'FAILED_DELETE_MANUAL_REVIEW';
  return result(stage,cleanup,passed&&cleanup==='CONFIRMED');
 }
 return Object.freeze({run});
}
module.exports={createOneShotMfaQaV107,validateScope,totp,PROJECT_NAME};
