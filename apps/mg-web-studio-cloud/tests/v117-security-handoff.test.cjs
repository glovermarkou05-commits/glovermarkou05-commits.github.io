'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {spawnSync}=require('node:child_process');
const {assess,runFromDisk,BLOCKERS}=require('../qa/v117-security-handoff.cjs');
const root=resolve(__dirname,'..');
const manifest=JSON.parse(readFileSync(resolve(root,'proposals/v114-qa-review-manifest.json'),'utf8'));
const read=p=>readFileSync(resolve(root,p),'utf8');
const input=()=>({manifest:structuredClone(manifest),read});
test('V117 verifies actual pinned V114 SQL artifacts without executing any SQL',()=>{
 const result=runFromDisk();
 assert.equal(result.ok,true);
 assert.equal(result.sqlProposalsPinned,3);
 assert.equal(result.canApplySql,false);
 assert.equal(result.decision,'NO_GO');
 assert.equal(result.productionAuthorized,false);
 assert.equal(result.formalV67Pass,0);
});
test('V117 must report all seven real release blockers without declaring readiness',()=>{
 const result=runFromDisk();
 assert.deepEqual(result.blockers,BLOCKERS);
 assert.equal(result.blockers.length,7);
 assert.equal(result.riskStatus,'PENDING_HUMAN_REVIEW');
 assert.equal(result.postgresDriverLockfile,'PINNED_NPM_CI_WITH_INTEGRITY');
});
test('V117 admits only the correct QA project and PR review-only scope',()=>{
 const x=input();x.manifest.qaProjectRef='other-project';
 assert.equal(assess(x).ok,false);
 const y=input();y.manifest.pullRequest=8;
 assert.equal(assess(y).ok,false);
});
test('V117 rejects forged owner approval or formal V67 pass',()=>{
 for(const [key,value] of [['authorizedSql',true],['formalV67Pass',32],['production','GO']]){
  const x=input();x.manifest[key]=value;
  assert.equal(assess(x).canApplySql,false,key);
  assert.equal(assess(x).decision,'NO_GO',key);
 }
});
test('V117 rejects forged review gates',()=>{
 const x=input();x.manifest.review.dba='APPROVED';
 assert.equal(assess(x).ok,false);
});
test('V117 refuses modified SQL even if declared in manifest',()=>{
 const x=input();
 x.read=p=>p.endsWith('v111-insert-only-ledger-writer-review.sql')?
  read(p)+'\n--tamper\n':read(p);
 assert.equal(assess(x).ok,false);
});
test('V117 refuses missing or modified V116 workflow baseline',()=>{
 const x=input();
 x.read=p=>p.includes('mg-web-studio-v116-real-pg17-adapter.yml')?
  'name: replacement\n':read(p);
 const r=assess(x);
 assert.equal(r.ok,false);
 assert.equal(r.reason,'EVIDENCE_BASELINE_CHANGED_REVIEW_REQUIRED');
});
test('V117 refuses absent V115 adapter source, without any live connection',()=>{
 const x=input();x.read=p=>{
  if(p.endsWith('v115-insert-only-pg-adapter.cjs'))throw Error('missing');
  return read(p);
 };
 assert.equal(assess(x).reason,'SOURCE_MISSING_ADAPTER');
});
test('V117 blocks a tampered npm lockfile even with otherwise matching SQL',()=>{
 const x=input(); x.read=p=>p.endsWith('v116-pg-driver/package-lock.json') ? '{"lockfileVersion":3,"packages":{}}' : read(p);
 assert.equal(assess(x).reason,'DRIVER_NOT_PINNED');
});
test('V117 blocks a missing dependency integrity lockfile',()=>{
 const x=input(); x.read=p=>{if(p.endsWith('v116-pg-driver/package-lock.json'))throw Error('missing');return read(p);};
 assert.equal(assess(x).reason,'DRIVER_LOCK_MISSING_OR_INVALID');
});
test('V117 is read only and rejects execution mode',()=>{
 const file=resolve(root,'qa/v117-security-handoff.cjs');
 const p=spawnSync(process.execPath,[file,'--execute'],{encoding:'utf8'});
 assert.equal(p.status,2);
 assert.match(p.stdout,/SQL=NOT_EXECUTED/);
});
test('V117 CLI dry-run provides non-secret review-only evidence',()=>{
 const file=resolve(root,'qa/v117-security-handoff.cjs');
 const p=spawnSync(process.execPath,[file,'--dry-run'],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 const body=JSON.parse(p.stdout);
 assert.equal(body.ok,true);
 assert.equal(body.reviewOnly,true);
 assert.equal(body.canApplySql,false);
 assert.equal(body.formalV67Pass,0);
});
test('V117 does not import network, process.env secrets, Supabase SDK or SQL clients',()=>{
 const content=readFileSync(resolve(root,'qa/v117-security-handoff.cjs'),'utf8');
 for(const forbidden of ["require('pg')","require('@supabase/supabase-js')",
  'fetch(', 'process.env', 'CREATE ROLE', 'GRANT INSERT', 'SECURITY DEFINER',
  'apply_migration', 'execute_sql']){
  assert.equal(content.includes(forbidden),false,forbidden);
 }
});
