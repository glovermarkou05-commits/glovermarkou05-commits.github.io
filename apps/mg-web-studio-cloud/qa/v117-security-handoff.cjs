'use strict';
// V117 is a READ-ONLY evidence and gate report, not a deployment preflight.
// It can never grant approval. No network, credentials, live DB, or SQL execution.
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {review}=require('./v114-review-package.cjs');
const PROJECT='MG WEB STUDIO AUTH QA';
const REF='tbfhiqkivsoeuudlpkgi';
const BLOCKERS=Object.freeze([
 'INDEPENDENT_DBA_AND_SECURITY_SIGNOFF',
 'BACKEND_IDENTITY_ROLE_MEMBERSHIP_AND_POOL_DESIGN',
 'AUTHORITATIVE_AUTH_SESSION_REVOCATION_CHECK',
 'BUSINESS_ACTION_IDEMPOTENCY_AND_RECOVERY',
 'SUPABASE_QA_DATA_API_RECHECK_AND_OWNER_DDL_APPROVAL',
 'SUPPLY_CHAIN_LOCKFILE_AND_IMAGE_DIGEST_REVIEW',
 'FORMAL_V67_32_CONTROLS_ACCEPTANCE'
]);
const REQUIRED=Object.freeze({
 adapter:'server/v115-insert-only-pg-adapter.cjs',
 integration:'tests/v116-pg17-adapter-real.test.cjs',
 workflow:'../../.github/workflows/mg-web-studio-v116-real-pg17-adapter.yml'
});
function deny(reason){
 return Object.freeze({ok:false,reason,reviewOnly:true,canApplySql:false,
  productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'});
}
function assess({manifest,read}={}){
 if(typeof read!=='function')return deny('NO_SOURCE_READER');
 const audited=review(manifest,name=>read('proposals/'+name));
 if(!audited.ok)return deny('V114_'+audited.reason);
 const parts={};
 for(const [name,path] of Object.entries(REQUIRED)){
  try{parts[name]=read(path);}
  catch{return deny('SOURCE_MISSING_'+name.toUpperCase());}
  if(typeof parts[name]!=='string'||parts[name].length===0)
   return deny('SOURCE_EMPTY_'+name.toUpperCase());
 }
 if(!parts.adapter.includes('current_user')||
    !parts.adapter.includes('COMMIT')||
    !parts.adapter.includes('ROLLBACK')||
    !parts.adapter.includes('productionAuthorized:false')||
    !parts.integration.includes('sixteen physically independent PG17 sessions')||
    !parts.integration.includes('lost COMMIT acknowledgement')||
    !parts.workflow.includes('image: postgres:17')||
    !parts.workflow.includes('github.event.pull_request.number == 7')||
    !parts.workflow.includes('permissions:\n  contents: read'))
   return deny('EVIDENCE_BASELINE_CHANGED_REVIEW_REQUIRED');
 // This confirms only expected repository artifacts, not runtime deployment safety.
 const result={
  ok:true,reviewOnly:true,project:PROJECT,projectRef:REF,
  evidence:'REPOSITORY_CONSISTENCY_ONLY',
  verifiedSourceFiles:3,sqlProposalsPinned:3,
  v116Pg17Integration:'11_PASS_CI_HISTORY_NOT_RERUN_BY_V117',
  postgresDriverLockfile:'MISSING_IN_V116',
  currentUserWriterDesign:'NOLOGIN_REQUIRES_REVIEWED_SERVER_PRINCIPAL',
  riskStatus:'PENDING_HUMAN_REVIEW',
  blockers:[...BLOCKERS],
  canApplySql:false,productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 };
 return Object.freeze(result);
}
function runFromDisk(){
 const root=resolve(__dirname,'..');
 const manifest=JSON.parse(readFileSync(resolve(root,'proposals/v114-qa-review-manifest.json'),'utf8'));
 return assess({manifest,read:p=>{
  const absolute=p.startsWith('../../.github/')?
   resolve(root,p):resolve(root,p);
  return readFileSync(absolute,'utf8');
 }});
}
if(require.main===module){
 if(process.argv.length!==3||process.argv[2]!=='--dry-run'){
  process.stdout.write('V117 BLOCKED: only --dry-run is allowed. SQL=NOT_EXECUTED; NO_GO\n');
  process.exitCode=2;
 }else{
  let result;
  try{result=runFromDisk();}
  catch{result=deny('SOURCES_UNREADABLE');}
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!result.ok)process.exitCode=1;
 }
}
module.exports={assess,runFromDisk,BLOCKERS,deny,REQUIRED};
