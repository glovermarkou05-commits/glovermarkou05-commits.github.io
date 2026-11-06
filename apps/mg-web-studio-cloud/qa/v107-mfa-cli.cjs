#!/usr/bin/env node
'use strict';
// MG V107. Execute LOCALLY in a trusted terminal, never in CI or a web app.
// Without --execute + explicit environment confirmation this NEVER connects.
// Secrets are obtained ONLY from local environment, never echoed or persisted.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {validateScope,createOneShotMfaQaV107,PROJECT_NAME}
 =require('./v107-mfa-one-shot.cjs');
const CLI_APPROVAL='YES_ONE_SYNTHETIC_TOTP_USER_DELETE_AFTER_TEST';
const PINNED_SDK='2.118.0';

function preflight(env){
 const scope={projectRef:env.MG_AUTH_QA_PROJECT_REF,
   projectUrl:env.MG_AUTH_QA_URL,projectName:PROJECT_NAME};
 if(!validateScope(scope))return {ok:false,code:'WRONG_PROJECT_SCOPE'};
 if(env.MG_AUTH_QA_CONFIRMATION!==CLI_APPROVAL)
   return {ok:false,code:'EXECUTION_APPROVAL_NOT_PRESENT'};
 if(typeof env.MG_AUTH_QA_ADMIN_KEY!=='string'||
    env.MG_AUTH_QA_ADMIN_KEY.length<30||
    typeof env.MG_AUTH_QA_PUBLISHABLE_KEY!=='string'||
    env.MG_AUTH_QA_PUBLISHABLE_KEY.length<20||
    env.MG_AUTH_QA_ADMIN_KEY===env.MG_AUTH_QA_PUBLISHABLE_KEY)
   return {ok:false,code:'BACKEND_KEYS_NOT_AVAILABLE'};
 const lockFile=path.join(__dirname,'package-lock.json');
 try{
  const lock=JSON.parse(fs.readFileSync(lockFile,'utf8'));
  if(lock.lockfileVersion!==3||
   lock.packages?.['']?.dependencies?.['@supabase/supabase-js']!==PINNED_SDK||
   lock.packages?.['node_modules/@supabase/supabase-js']?.version!==PINNED_SDK||
   !lock.packages?.['node_modules/@supabase/supabase-js']?.integrity)
   return {ok:false,code:'DEPENDENCY_LOCK_NOT_VERIFIED'};
 }catch{return {ok:false,code:'MISSING_PACKAGE_LOCK'};}
 return {ok:true,scope};
}
async function main({args=process.argv.slice(2),env=process.env}={}){
 if(args.length===1&&args[0]==='--dry-run'){
  process.stdout.write('V107 DRY_RUN: no network, no users, no MFA, no SQL.\n');
  return 0;
 }
 if(args.length!==1||args[0]!=='--execute'){
  process.stderr.write('V107 BLOCKED: use --dry-run or --execute.\n');
  return 2;
 }
 const p=preflight(env);
 if(!p.ok){process.stderr.write('V107 BLOCKED: '+p.code+'\n');return 2;}
 if(Number(process.versions.node.split('.')[0])<22){
  process.stderr.write('V107 BLOCKED: NODE_22_REQUIRED\n');return 2;
 }
 // This file is in local temp only. No project ref/identity/secret is saved.
 const lock=path.join(os.tmpdir(),'mg-v107-qa-'+
  createHash('sha256').update(p.scope.projectRef).digest('hex').slice(0,16)+'.lock');
 let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}
 catch{process.stderr.write('V107 BLOCKED: ANOTHER_RUN_OR_STALE_LOCK\n');return 2;}
 try{
  let createClient;
  try{({createClient}=require('@supabase/supabase-js'));}
  catch{process.stderr.write('V107 BLOCKED: SDK_NOT_INSTALLED_USE_NPM_CI\n');return 2;}
  const opts={auth:{persistSession:false,autoRefreshToken:false,
   detectSessionInUrl:false}};
  const admin=createClient(p.scope.projectUrl,env.MG_AUTH_QA_ADMIN_KEY,opts);
  const user=createClient(p.scope.projectUrl,env.MG_AUTH_QA_PUBLISHABLE_KEY,opts);
  const trial=createOneShotMfaQaV107({admin,user,scope:p.scope});
  const outcome=await trial.run();
  // Never print thrown network errors, access tokens, OTPs or user identities.
  process.stdout.write('V107 RESULT: '+(outcome.passed?'PASS':'BLOCKED')+
    '; stage='+outcome.stage+'; cleanup='+outcome.cleanup+'; V67=NO_GO\n');
  return outcome.passed?0:1;
 }catch{
  process.stderr.write('V107 BLOCKED: INTERNAL_FAILURE_SEE_CLEANUP_PLAN\n');
  return 1;
 }finally{
  if(fd!==undefined){try{fs.closeSync(fd);}catch{}}
  try{fs.unlinkSync(lock);}catch{}
 }
}
if(require.main===module){
 for(const sig of ['SIGINT','SIGTERM']){
  process.on(sig,()=>{process.exitCode=1;});
 }
 main().then(code=>{process.exitCode=code;})
 .catch(()=>{process.stderr.write('V107 BLOCKED: UNHANDLED_FAILURE\n');process.exitCode=1;});
}
module.exports={main,preflight,CLI_APPROVAL};
