'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspect,main}=require('../scripts/inspect-gh-runner-v94.cjs');
function opts(envExtra={}){
 const env={
  GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'pull_request',
  GITHUB_REPOSITORY:'glovermarkou05-commits/glovermarkou05-commits.github.io',
  GITHUB_REF:'refs/pull/7/merge',
  GITHUB_HEAD_REF:'docs/mg-web-studio-v94-preflight-20261101',
  GITHUB_BASE_REF:'feature/mg-digital-v5-web-services',
  RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',
  ...envExtra
 };
 return {
  env,cwd:'/tmp/v94-fixture',
  osApi:{
   platform:()=> 'linux',arch:()=> 'x64',availableParallelism:()=>4,
   totalmem:()=>16*1024**3,freemem:()=>10*1024**3
  },
  fsApi:{statfsSync:()=>({bavail:12n*1024n,bsize:1048576n})}
 };
}
test('accept exact authorized PR context only for resource candidate',()=>{
 const out=inspect(opts());
 assert.equal(out.assessment.observationValid,true);
 assert.equal(out.assessment.resourceCandidate,true);
 assert.equal(out.assessment.decision,'NO_GO');
});
test('reject every mismatched origin and scope before reading metrics',()=>{
 for(const env of [
 {GITHUB_ACTIONS:'false'},{GITHUB_REF:'refs/heads/main'},
 {GITHUB_HEAD_REF:'feature/other'},{GITHUB_BASE_REF:'main'},
 {GITHUB_EVENT_NAME:'push'},{GITHUB_REPOSITORY:'other/repo'},
 {RUNNER_ENVIRONMENT:'self-hosted'}
 ]){
   const x=opts(env);
   x.fsApi.statfsSync=()=>{throw Error('must never inspect mismatched host')};
   const out=inspect(x);
   assert.equal(out.assessment.observationValid,false);
   assert.equal(out.assessment.resourceCandidate,false);
 }
});
test('fails if memory below 3 GiB available',()=>{
 const x=opts();x.osApi.freemem=()=>1024**3;
 const r=inspect(x);
 assert.equal(r.assessment.resourceCandidate,false);
 assert.ok(r.assessment.issueCodes.includes('AVAILABLE_RAM_BELOW_PLAN'));
});
test('fails if free disk below 4 GiB',()=>{
 const x=opts();x.fsApi.statfsSync=()=>({bavail:1024n,bsize:1048576n});
 const r=inspect(x);
 assert.equal(r.assessment.resourceCandidate,false);
 assert.ok(r.assessment.issueCodes.includes('WORKSPACE_DISK_BELOW_PLAN'));
});
test('success report does not authorize SQL, production or Docker',()=>{
 let output='';
 const status=main(['--json'],x=>output+=x,opts());
 const j=JSON.parse(output);
 assert.equal(status,0);assert.equal(j.createdContainers,false);
 assert.equal(j.executedSql,false);assert.equal(j.production,'NO_GO');
 assert.equal(j.v67Passed,0);assert.equal(j.v67Pending,32);
});
test('refuses invalid CLI flags',()=>{
 let out='';assert.equal(main(['--start'],x=>out+=x,opts()),2);
 assert.match(out,/only --json/);
});
