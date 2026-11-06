'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {spawnSync}=require('node:child_process');
const {blobSha,review,verifyFromDisk,BASENAMES}=require('./v114-review-package.cjs');
const root=resolve(__dirname,'../proposals');
const mpath=join(root,'v114-qa-review-manifest.json');
const fresh=()=>JSON.parse(readFileSync(mpath,'utf8'));
const fromDisk=name=>readFileSync(join(root,name),'utf8');
const edit=f=>{const x=fresh();f(x);return review(x,fromDisk);};
const original=()=>review(fresh(),fromDisk);
test('source package passes integrity but always forbids actual deployment',()=>{
 const result=original();
 assert.deepEqual(result,{
   ok:true,reason:'INTEGRITY_CHECKED',sourceFiles:3,reviewGatesPending:6,
   readyForSql:false,productionAuthorized:false,v67:'NO_GO',
   environment:'REVIEW_ONLY_OFFLINE'
 });
});
test('read from local checked-in manifest works without network',()=>{
 assert.equal(verifyFromDisk().ok,true);
});
test('blobs are pinned to exact git blob SHA including length',()=>{
 const m=fresh();
 for(const name of BASENAMES)assert.equal(blobSha(fromDisk(name)),m.expected[name]);
});
test('no plain SHA256 or arbitrary source filename can substitute for reviewed SQL',()=>{
 const x=edit(m=>{m.expected['other.sql']=m.expected[BASENAMES[0]];});
 assert.equal(x.ok,false);
});
test('wrong project reference is blocked',()=>{
 assert.equal(edit(m=>{m.qaProjectRef='not-the-qa-project';}).reason,'BAD_SCOPE');
});
test('wrong project display name is blocked',()=>{
 assert.equal(edit(m=>{m.qaProjectName='STAGING';}).reason,'BAD_SCOPE');
});
test('wrong GitHub branch is blocked',()=>{
 assert.equal(edit(m=>{m.targetBranch='main';}).reason,'BAD_SCOPE');
});
test('wrong PR number is blocked',()=>{
 assert.equal(edit(m=>{m.pullRequest=8;}).reason,'BAD_SCOPE');
});
test('cannot mark SQL authorized inside an unreviewed manifest',()=>{
 assert.equal(edit(m=>{m.authorizedSql=true;}).reason,'BAD_SCOPE');
});
test('cannot mark production GO in a QA review package',()=>{
 assert.equal(edit(m=>{m.production='GO';}).reason,'BAD_SCOPE');
});
test('cannot increment V67 formal passes via a manifest edit',()=>{
 assert.equal(edit(m=>{m.formalV67Pass=1;}).reason,'BAD_SCOPE');
});
test('all actual security gates must remain listed as pending',()=>{
 const x=edit(m=>{delete m.review.backend;});
 assert.equal(x.reason,'REVIEW_NOT_RECORDED');
});
test('a fabricated DBA approval fails the package review',()=>{
 assert.equal(edit(m=>{m.review.dba='APPROVED';}).reason,'REVIEW_NOT_RECORDED');
});
test('self-reported UI save is not treated as independent API verification',()=>{
 assert.equal(edit(m=>{m.review.dataApi='CONFIRMED_BY_SQL';}).reason,'REVIEW_NOT_RECORDED');
});
test('an extra gate may not silently replace required DBA review',()=>{
 assert.equal(edit(m=>{m.review.unsafeBypass='APPROVED';}).reason,'REVIEW_NOT_RECORDED');
});
test('missing SQL proposal is blocked before any installation is considered',()=>{
 const name=BASENAMES[0];
 const result=review(fresh(),x=>{if(x===name)throw Error('missing');return fromDisk(x);});
 assert.equal(result.reason,'SOURCE_MISSING');
});
test('one changed byte of a SQL proposal blocks the full package',()=>{
 const name=BASENAMES[1];
 const result=review(fresh(),x=>fromDisk(x)+(x===name?' ':'')); 
 assert.equal(result.reason,'SOURCE_CHANGED');
});
test('tampered Git blob SHA is rejected',()=>{
 const result=edit(m=>{m.expected[BASENAMES[0]]='0'.repeat(40);});
 assert.equal(result.reason,'SOURCE_CHANGED');
});
test('malformed Git blob SHA is rejected before file I/O',()=>{
 const result=edit(m=>{m.expected[BASENAMES[0]]='not-a-git-blob';});
 assert.equal(result.reason,'BAD_SOURCE_LIST');
});
test('missing expected SQL file entry is denied',()=>{
 const result=edit(m=>{delete m.expected[BASENAMES[2]];});
 assert.equal(result.reason,'BAD_SOURCE_LIST');
});
test('CLI supports --dry-run only, never --execute',()=>{
 const cli=join(__dirname,'v114-review-package.cjs');
 const good=spawnSync(process.execPath,[cli,'--dry-run'],{encoding:'utf8'});
 assert.equal(good.status,0,good.stderr);
 assert.match(good.stdout,/INTEGRITY_PASS/);
 assert.match(good.stdout,/SQL=NOT_EXECUTED/);
 const denied=spawnSync(process.execPath,[cli,'--execute'],{encoding:'utf8'});
 assert.equal(denied.status,2);
 assert.match(denied.stdout,/BLOCKED/);
});
test('the code contains no SQL executor or connector SDK',()=>{
 const text=readFileSync(join(__dirname,'v114-review-package.cjs'),'utf8');
 for(const banned of ['createClient(','execute_sql(','apply_migration(',
  'child_process','fetch(','https.request(','DATABASE_URL','process.env.SUPABASE_',
  'CREATE TABLE','SECURITY DEFINER','execFileSync(','execSync(']){
  assert.equal(text.includes(banned),false,banned);
 }
});
test('result remains explicitly no-go even with a complete valid package',()=>{
 const o=original();
 assert.equal(o.readyForSql,false);
 assert.equal(o.productionAuthorized,false);
 assert.equal(o.v67,'NO_GO');
});
