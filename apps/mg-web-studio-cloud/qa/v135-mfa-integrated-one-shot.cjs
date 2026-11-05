#!/usr/bin/env node
'use strict';
// V135 integrated QA test, local OWNER terminal ONLY. No public handler.
// One ephemeral Auth user; three separate real TLS private PG principals.
// Never log credentials, JWT, OTP, MFA seed, email, user id or DB row content.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes}=require('node:crypto');
const {checkServerIdentity}=require('node:tls');
const {validateScope,PROJECT_NAME,totp}=require('./v107-mfa-one-shot.cjs');
const {createV135PrivateQaRuntime}=require('../server/v135-private-qa-runtime.cjs');
const CONSENT='YES_V135_ONE_EPHEMERAL_QA_USER_AND_DELETE';
const QA_EMAIL='mg-webstudio-v135-qa@example.invalid';
const ROLES=[
 'mg_qa_mfa_challenge_journal','mg_qa_mfa_receipt_issuer',
 'mg_qa_mfa_receipt_reader'
];
const VALID_SECRET=v=>typeof v==='string'&&v.length>=24&&v.length<=512&&!/\s/.test(v);
const envRoleNames=[
 'MG_V135_JOURNAL_PASSWORD','MG_V135_ISSUER_PASSWORD','MG_V135_READER_PASSWORD'
];
function lockedDependencies(){
 try{
  const auth=JSON.parse(fs.readFileSync(path.join(__dirname,'package-lock.json'),'utf8'));
  const pg=JSON.parse(fs.readFileSync(path.join(__dirname,'v116-pg-driver','package-lock.json'),'utf8'));
  return auth.lockfileVersion===3&&pg.lockfileVersion===3&&
   auth.packages?.['node_modules/@supabase/supabase-js']?.version==='2.118.0'&&
   typeof auth.packages?.['node_modules/@supabase/supabase-js']?.integrity==='string'&&
   pg.packages?.['node_modules/pg']?.version==='8.23.1'&&
   typeof pg.packages?.['node_modules/pg']?.integrity==='string';
 }catch{return false;}
}
function preflight(e=process.env){
 const scope={projectRef:e.MG_AUTH_QA_PROJECT_REF,
  projectUrl:e.MG_AUTH_QA_URL,projectName:PROJECT_NAME};
 if(!validateScope(scope))return 'WRONG_QA_SCOPE';
 if(e.MG_V135_CONFIRMATION!==CONSENT)return 'CONFIRMATION_REQUIRED';
 if(!lockedDependencies())return 'UNVERIFIED_LOCKFILES';
 if(typeof e.MG_AUTH_QA_ADMIN_KEY!=='string'||e.MG_AUTH_QA_ADMIN_KEY.length<30||
  typeof e.MG_AUTH_QA_PUBLISHABLE_KEY!=='string'||e.MG_AUTH_QA_PUBLISHABLE_KEY.length<20||
  e.MG_AUTH_QA_ADMIN_KEY===e.MG_AUTH_QA_PUBLISHABLE_KEY)
  return 'QA_KEYS_MISSING';
 const keys=envRoleNames.map(k=>e[k]);
 if(!keys.every(VALID_SECRET)||new Set(keys).size!==3)return 'PRIVATE_ROLE_SECRETS_INVALID';
 if(typeof e.MG_V135_CA_PATH!=='string')return 'CA_PATH_REQUIRED';
 try{
  const st=fs.statSync(e.MG_V135_CA_PATH);
  if(!st.isFile()||st.size>20000)return 'CA_INVALID';
  const ca=fs.readFileSync(e.MG_V135_CA_PATH,'utf8');
  if(ca.length<80||!ca.includes('-----BEGIN CERTIFICATE-----')||
   !ca.includes('-----END CERTIFICATE-----'))return 'CA_INVALID';
 }catch{return 'CA_INVALID';}
 return null;
}
const authOptions={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const isUuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
async function nextTotpWindow(previous){
 // Enrollment verification and private challenge require distinct TOTP time steps.
 const deadline=Date.now()+40000;
 while(Math.floor(Date.now()/30000)===previous){
  if(Date.now()>deadline)throw Error('TOTP_CLOCK_STALLED');
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 await new Promise(resolve=>setTimeout(resolve,1200));
}
// Authentication preflight runs BEFORE creating any Auth user and discloses
// only the failing role, never native driver errors (which may include secrets).
async function checkPrivateRoleConnections({Pool,caPem,passwords}){
 const host='aws-1-sa-east-1.pooler.supabase.com';
 const project='tbfhiqkivsoeuudlpkgi';
 if(typeof Pool!=='function'||!Array.isArray(passwords)||
  passwords.length!==3||!passwords.every(VALID_SECRET))
  return 'PRIVATE_ROLE_SECRETS_INVALID';
 for(let i=0;i<ROLES.length;i++){
  const role=ROLES[i];
  let pool,client;
  try{
   pool=new Pool({
    host,port:5432,database:'postgres',user:role+'.'+project,
    password:passwords[i],
    ssl:{ca:caPem,rejectUnauthorized:true,servername:host},
    max:1,connectionTimeoutMillis:12000,idleTimeoutMillis:1000,
    application_name:'mg-web-studio-v135-local-precheck'
   });
   client=await pool.connect();
   const socket=client.connection?.stream;
   const cert=typeof socket?.getPeerCertificate==='function'?
    socket.getPeerCertificate():null;
   if(socket?.encrypted!==true||socket?.authorized!==true||
    !cert||checkServerIdentity(host,cert)!==undefined)
    return 'TLS_OR_SERVER_IDENTITY_REJECTED';
   const r=await client.query(
    'SELECT current_database() AS db,current_user AS current_user,'+
    'session_user AS session_user,pg_is_in_recovery() AS is_replica'
   );
   const q=r.rows?.[0];
   if(r.rowCount!==1||q?.db!=='postgres'||q?.current_user!==role||
    q?.session_user!==role||q?.is_replica!==false)
    return 'ROLE_IDENTITY_MISMATCH_'+role;
  }catch{
   return 'ROLE_CONNECTION_FAILED_'+role;
  }finally{
   if(client){try{client.release(true);}catch{}}
   if(pool){try{await pool.end();}catch{}}
  }
 }
 return null;
}

async function executeWith({admin,user,Pool,caPem,passwords,nowMs=()=>Date.now()}){
 let stage='PRECHECK',createdId=null,createdAttempted=false;
 let sessionStarted=false,flow=null,logoutOk=true,deleteOk=true;
 let passed=false;
 try{
  const users=await admin.auth.admin.listUsers({page:1,perPage:2});
  if(users.error||!Array.isArray(users.data?.users)||users.data.users.length!==0)
   throw Error('QA_NOT_EMPTY');
  stage='CREATE';
  const password=randomBytes(36).toString('base64url')+'A1!';
  createdAttempted=true;
  const create=await admin.auth.admin.createUser({
   email:QA_EMAIL,password,email_confirm:true
  });
  if(create.error||!isUuid(create.data?.user?.id))throw Error('CREATE_UNCERTAIN');
  createdId=create.data.user.id;

  stage='ENROLL';
  const login=await user.auth.signInWithPassword({email:QA_EMAIL,password});
  sessionStarted=!login.error&&!!login.data?.session?.access_token;
  if(!sessionStarted||login.data?.user?.id!==createdId)throw Error('LOGIN_FAILED');
  const enrolled=await user.auth.mfa.enroll({factorType:'totp',friendlyName:'MG-V135-QA-ONLY'});
  if(enrolled.error||!isUuid(enrolled.data?.id)||!enrolled.data?.totp?.secret)
   throw Error('ENROLL_FAILED');
  const factorId=enrolled.data.id,secret=enrolled.data.totp.secret;
  const enrollmentChallenge=await user.auth.mfa.challenge({factorId});
  if(enrollmentChallenge.error||!isUuid(enrollmentChallenge.data?.id))
   throw Error('ENROLL_CHALLENGE_FAILED');
  const usedWindow=Math.floor(nowMs()/30000);
  const enrolledVerify=await user.auth.mfa.verify({
   factorId,challengeId:enrollmentChallenge.data.id,code:totp(secret,nowMs())
  });
  if(enrolledVerify.error||!enrolledVerify.data?.access_token)
   throw Error('ENROLL_VERIFY_FAILED');

  // Start a fresh AAL1 session with the verified TOTP factor installed.
  stage='RELOGIN';
  const signOut=await user.auth.signOut({scope:'global'});
  if(signOut.error)throw Error('SESSION_RESET_FAILED');
  sessionStarted=false;
  const relog=await user.auth.signInWithPassword({email:QA_EMAIL,password});
  sessionStarted=!relog.error&&!!relog.data?.session?.access_token;
  const token=relog.data?.session?.access_token;
  if(!sessionStarted||relog.data?.user?.id!==createdId)throw Error('RELOGIN_FAILED');
  const initial=await user.auth.getClaims(token);
  const claims=initial.data?.claims;
  if(initial.error||claims?.aal!=='aal1'||claims?.sub!==createdId||
   !isUuid(claims?.session_id))throw Error('AAL1_NOT_CONFIRMED');

  stage='PRIVATE_BACKEND';
  flow=await createV135PrivateQaRuntime({
   Pool,auth:user.auth,accessToken:token,caPem,
   rolePasswords:passwords,receiptKey:randomBytes(32),
   transport:'session_pooler'
  });
  if(!flow||flow.readiness?.decision!=='NO_GO')throw Error('PRIVATE_RUNTIME_UNAVAILABLE');
  const begun=await flow.begin({factorId});
  if(begun?.ok!==true||!isUuid(begun?.proofReference))
   throw Error('CHALLENGE_NOT_RECORDED');

  stage='TOTP_AAL2_VERIFY_AND_RECEIPT';
  await nextTotpWindow(usedWindow);
  const confirm=await flow.confirm({
   proofReference:begun.proofReference,code:totp(secret,nowMs())
  });
  if(confirm?.ok!==true)throw Error('RECEIPT_NOT_RECORDED');
  stage='TOTP_AAL2_SIGNED_CLAIMS';
  const verifiedSession=await user.auth.getSession();
  const freshJwt=verifiedSession.data?.session?.access_token;
  const signed=await user.auth.getClaims(freshJwt);
  if(verifiedSession.error||signed.error||signed.data?.claims?.aal!=='aal2'||
   signed.data?.claims?.sub!==createdId||
   signed.data?.claims?.session_id!==claims.session_id)
   throw Error('AAL2_NOT_CONFIRMED');

  stage='ANTI_REPLAY';
  const readRequest={
   proofReference:begun.proofReference,
   subject:createdId,sessionId:claims.session_id
  };
  const receipt=await flow.readTrustedVerifiedEvent(readRequest);
  if(receipt?.verified!==true||!isUuid(receipt?.eventId))
   throw Error('RECEIPT_NOT_READABLE');
  const replay=await flow.confirm({
   proofReference:begun.proofReference,code:totp(secret,nowMs())
  });
  const after=await flow.readTrustedVerifiedEvent(readRequest);
  if(replay?.ok!==false||after?.eventId!==receipt.eventId)
   throw Error('REPLAY_NOT_REJECTED');
  passed=true;stage='COMPLETE';
 }catch{passed=false;
 }finally{
  if(flow){try{await flow.close();}catch{passed=false;}}
  if(sessionStarted){try{
   const out=await user.auth.signOut({scope:'global'});
   logoutOk=!out.error;
  }catch{logoutOk=false;}}
  if(createdId){try{
   const out=await admin.auth.admin.deleteUser(createdId);
   deleteOk=!out.error;
  }catch{deleteOk=false;}}
 }
 const cleanup=createdAttempted&&!createdId?'CREATION_UNCERTAIN_REVIEW':
  !deleteOk?'DELETE_FAILED_REVIEW':!logoutOk?'SIGNOUT_FAILED_REVIEW':'CONFIRMED';
 return {passed:passed&&cleanup==='CONFIRMED',stage,cleanup};
}
async function main(args=process.argv.slice(2),e=process.env){
 if(args.length===1&&args[0]==='--dry-run'){
  process.stdout.write('V135 INTEGRATED DRY_RUN: no network or QA changes.\n');
  return 0;
 }
 if(args.length!==1||args[0]!=='--execute'){
  process.stderr.write('V135 BLOCKED: valid flags are --dry-run or --execute.\n');return 2;
 }
 const reason=preflight(e);
 if(reason){process.stderr.write('V135 BLOCKED: '+reason+'\n');return 2;}
 let createClient,Pool;
 try{
  ({createClient}=require('@supabase/supabase-js'));
  ({Pool}=require('./v116-pg-driver/node_modules/pg'));
 }catch{process.stderr.write('V135 BLOCKED: PINNED_MODULES_MISSING\n');return 2;}
 // Local mutual exclusion. A stale lock requires human QA cleanup review.
 const lock=path.join(os.tmpdir(),'mg-webstudio-v135-one-shot-'+e.MG_AUTH_QA_PROJECT_REF+'.lock');
 let lockFd;
 try{lockFd=fs.openSync(lock,'wx',0o600);}
 catch{process.stderr.write('V135 BLOCKED: CONCURRENT_OR_STALE_LOCK_REVIEW_QA\n');return 2;}
 try{
  const caPem=fs.readFileSync(e.MG_V135_CA_PATH,'utf8');
  const passwords=envRoleNames.map(k=>e[k]);
  const failedRole=await checkPrivateRoleConnections({Pool,caPem,passwords});
  if(failedRole){
   process.stdout.write('V135 BLOCKED: '+failedRole+
    '; stage=PG_PREFLIGHT; cleanup=NOT_NEEDED; production=NO_GO\n');
   return 1;
  }
  process.stdout.write('V135_PRIVATE_ROLES_PRECHECK: 3/3 PASS\n');
  const admin=createClient(e.MG_AUTH_QA_URL,e.MG_AUTH_QA_ADMIN_KEY,authOptions);
  const user=createClient(e.MG_AUTH_QA_URL,e.MG_AUTH_QA_PUBLISHABLE_KEY,authOptions);
  const outcome=await executeWith({admin,user,Pool,caPem,passwords});
  process.stdout.write('V135 RESULT: '+(outcome.passed?'PASS':'BLOCKED')+
   '; stage='+outcome.stage+'; cleanup='+outcome.cleanup+'; production=NO_GO\n');
  return outcome.passed?0:1;
 }finally{
  try{fs.closeSync(lockFd);}catch{}
  try{fs.unlinkSync(lock);}catch{}
 }
}
if(require.main===module){
 main().then(code=>{process.exitCode=code;}).catch(()=>{
  process.stderr.write('V135 BLOCKED: UNHANDLED_FAILURE_REVIEW_QA\n');
  process.exitCode=1;
 });
}
module.exports={main,preflight,checkPrivateRoleConnections,executeWith,CONSENT};
