'use strict';
// V114 — review-only verification. NEVER executes SQL, opens network,
// handles a credential, deploys migrations, or connects to Supabase.
const {createHash}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const BASENAMES=Object.freeze([
 'v110-private-mfa-ledger-review-only.sql',
 'v111-insert-only-ledger-writer-review.sql',
 'v112-rollback-guarded-review-only.sql'
]);
const EXPECTED_REF='tbfhiqkivsoeuudlpkgi';
const EXPECTED_BRANCH='docs/mg-web-studio-v94-preflight-20261101';
const PENDING=Object.freeze(['dba','backend','ownerApproval','rollback','independentReview']);
const DEFAULT_MANIFEST=resolve(__dirname,'../proposals/v114-qa-review-manifest.json');
const sqlPath=name=>resolve(__dirname,'../proposals',name);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function blobSha(source){
 const bytes=Buffer.from(source,'utf8');
 return createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
}
function review(manifest,loadProposal=name=>readFileSync(sqlPath(name),'utf8')){
 function fail(code){return Object.freeze({
  ok:false,reason:code,readyForSql:false,productionAuthorized:false,v67:'NO_GO'
 });}
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))return fail('BAD_MANIFEST');
 if(manifest.version!=='V114_REVIEW_ONLY'||manifest.qaProjectRef!==EXPECTED_REF||
   manifest.qaProjectName!=='MG WEB STUDIO AUTH QA'||
   manifest.targetBranch!==EXPECTED_BRANCH||manifest.pullRequest!==7||
   manifest.authorizedSql!==false||manifest.production!=='NO_GO'||
   manifest.formalV67Pass!==0)return fail('BAD_SCOPE');
 const files=manifest.expected;
 if(!files||Object.getPrototypeOf(files)!==Object.prototype||
   Object.keys(files).length!==BASENAMES.length||
   !BASENAMES.every(x=>own(files,x)&&/^[0-9a-f]{40}$/.test(files[x])))
    return fail('BAD_SOURCE_LIST');
 const gates=manifest.review;
 if(!gates||typeof gates!=='object'||Array.isArray(gates)||
    Object.keys(gates).length!==PENDING.length+1 ||
    gates.dataApi!=='USER_REPORTED_SAVED_RECHECK_REQUIRED' ||
    !PENDING.every(x=>own(gates,x)&&gates[x]==='PENDING'))
    return fail('REVIEW_NOT_RECORDED');
 for(const name of BASENAMES){
  let sql;
  try{sql=loadProposal(name);}catch{return fail('SOURCE_MISSING');}
  if(typeof sql!=='string'||blobSha(sql)!==files[name])return fail('SOURCE_CHANGED');
  // Specific guarantees supplement strict, pinned Git blob SHA checks.
  if(name.startsWith('v110')&&
      (!sql.includes('FORCE ROW LEVEL SECURITY')||
       !sql.includes('REVOKE ALL ON SCHEMA mg_auth_ledger')))return fail('BASELINE_MISSING');
  if(name.startsWith('v111')&&
      (!sql.includes('NOLOGIN NOINHERIT')||
       !sql.includes('FOR INSERT TO mg_auth_ledger_writer')))return fail('BASELINE_MISSING');
  if(name.startsWith('v112')&&
      (!sql.includes('DROP TABLE mg_auth_ledger.mfa_redemptions RESTRICT')||
       !sql.includes('V112_ABORT_NONEMPTY_OR_FOREIGN_DEPENDENCIES')))return fail('BASELINE_MISSING');
 }
 return Object.freeze({
  ok:true,reason:'INTEGRITY_CHECKED',
  sourceFiles:BASENAMES.length,reviewGatesPending:6,
  readyForSql:false,productionAuthorized:false,
  v67:'NO_GO',environment:'REVIEW_ONLY_OFFLINE'
 });
}
function verifyFromDisk(){
 const source=readFileSync(DEFAULT_MANIFEST,'utf8');
 return review(JSON.parse(source));
}
if(require.main===module){
 if(process.argv.length!==3||process.argv[2]!=='--dry-run'){
  process.stdout.write('V114 BLOCKED: allowed argument --dry-run only. No SQL is executed.\n');
  process.exitCode=2;
 }else{
  let result;
  try{result=verifyFromDisk();}catch{result={ok:false,reason:'PACKAGE_UNREADABLE'};}
  process.stdout.write(result.ok
    ? 'V114 PACKAGE: INTEGRITY_PASS; 3 files pinned; 6 gates PENDING; SQL=NOT_EXECUTED; V67=NO_GO\n'
    : 'V114 PACKAGE: BLOCKED; reason='+result.reason+'; SQL=NOT_EXECUTED; V67=NO_GO\n');
  if(!result.ok)process.exitCode=1;
 }
}
module.exports={blobSha,review,verifyFromDisk,BASENAMES,EXPECTED_REF,EXPECTED_BRANCH};
