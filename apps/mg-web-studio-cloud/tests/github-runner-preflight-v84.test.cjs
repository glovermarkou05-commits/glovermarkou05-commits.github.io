'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assessGithubRunnerV84,collectGithubRunnerV84,LIMITS}=
 require('../server/github-runner-preflight-v84.cjs');
const MiB=1024*1024;
const example=()=>({
 source:'GITHUB_RUNNER_READ_ONLY',linux:true,x64:true,githubActions:true,
 expectedRepository:true,expectedBranch:true,githubHosted:true,
 cpuCount:4,totalRamMiB:15360,availableRamMiB:12000,workspaceFreeMiB:9000
});
const env=()=>({
 GITHUB_ACTIONS:'true',
 GITHUB_REPOSITORY:'glovermarkou05-commits/glovermarkou05-commits.github.io',
 GITHUB_REF:'refs/heads/feature/mg-digital-v5-web-services',
 RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux'
});
function fake(){
 const calls=[];
 return {calls,osApi:{
   platform:()=>{calls.push('platform');return 'linux';},
   arch:()=>{calls.push('arch');return 'x64';},
   availableParallelism:()=>{calls.push('parallelism');return 4;},
   totalmem:()=>15360*MiB,freemem:()=>12000*MiB
 },fsApi:{
   statfsSync:(cwd,opts)=>{calls.push('statfs');assert.equal(opts.bigint,true);
    return {bavail:10240n,bsize:1048576n};}
 }};
}
test('valid bounded resources produce resource candidate but always NO_GO',()=>{
 const r=assessGithubRunnerV84(example());
 assert.equal(r.observationValid,true);
 assert.equal(r.resourceCandidate,true);
 assert.equal(r.decision,'NO_GO');
});
test('no PG, network, Docker, database or production actions are authorized',()=>{
 const r=assessGithubRunnerV84(example());
 for(const k of ['postgresInstalled','postgresStarted','portsOpened','databaseConnected',
  'dockerTouched','externalHttpTested','productionTouched','syntheticFixturesCreated'])
   assert.equal(r[k],false,k);
 assert.equal(r.permissionsV78,'SIX_PENDING');
 assert.equal(r.v67Pending,32);assert.equal(r.v67Passed,0);
});
test('runner has separate Linux capacity thresholds not V81 same-drive Windows reservation',()=>{
 assert.equal(LIMITS.minCpuCount,2);
 assert.equal(LIMITS.minAvailableRamMiB,3072);
 assert.equal(LIMITS.minWorkspaceFreeMiB,4096);
 assert.equal(LIMITS.minTotalRamMiB,6144);
});
test('resource collector reads only CPU memory and filesystem statistics',()=>{
 const f=fake();
 const r=collectGithubRunnerV84({...f,env:env(),cwd:'/tmp/workspace'});
 assert.equal(r.resourceCandidate,true);
 assert.equal(r.observation.workspaceFreeMiB,10240);
 assert.equal(r.observation.availableRamMiB,12000);
 assert.deepEqual(f.calls.sort(),['arch','parallelism','platform','statfs'].sort());
});
test('outside Actions refuses before reading filesystem or host',()=>{
 const f=fake();
 const r=collectGithubRunnerV84({...f,env:{}});
 assert.equal(r.resourceCandidate,false);
 assert.deepEqual(r.issueCodes,['OBSERVATION_INVALID']);
 assert.deepEqual(f.calls,[]);
});
test('wrong repository rejects preflight',()=>{
 const f=fake();const e=env();e.GITHUB_REPOSITORY='other/repo';
 const r=collectGithubRunnerV84({...f,env:e});
 assert.equal(r.resourceCandidate,false);assert.equal(f.calls.length,0);
});
test('wrong branch rejects preflight',()=>{
 const f=fake();const e=env();e.GITHUB_REF='refs/heads/main';
 const r=collectGithubRunnerV84({...f,env:e});
 assert.equal(r.resourceCandidate,false);assert.equal(f.calls.length,0);
});
test('self-hosted runner rejects preflight',()=>{
 const f=fake();const e=env();e.RUNNER_ENVIRONMENT='self-hosted';
 const r=collectGithubRunnerV84({...f,env:e});
 assert.equal(r.resourceCandidate,false);assert.equal(f.calls.length,0);
});
test('wrong runner OS rejects preflight',()=>{
 const f=fake();const e=env();e.RUNNER_OS='Windows';
 const r=collectGithubRunnerV84({...f,env:e});
 assert.equal(r.resourceCandidate,false);assert.equal(f.calls.length,0);
});
test('low RAM fails without granting permission',()=>{
 const x=example();x.availableRamMiB=1000;
 const r=assessGithubRunnerV84(x);
 assert.deepEqual(r.issueCodes,['AVAILABLE_RAM_BELOW_PLAN']);
 assert.equal(r.decision,'NO_GO');
});
test('low workspace disk fails without granting permission',()=>{
 const x=example();x.workspaceFreeMiB=2000;
 const r=assessGithubRunnerV84(x);
 assert.deepEqual(r.issueCodes,['WORKSPACE_DISK_BELOW_PLAN']);
 assert.equal(r.decision,'NO_GO');
});
test('CPU and total RAM below minimums both fail',()=>{
 const x=example();x.cpuCount=1;x.totalRamMiB=4000;x.availableRamMiB=3000;
 const r=assessGithubRunnerV84(x);
 assert.deepEqual(r.issueCodes,['CPU_BELOW_PLAN','TOTAL_RAM_BELOW_PLAN','AVAILABLE_RAM_BELOW_PLAN']);
});
test('malformed or extra fields are not accepted',()=>{
 for(const v of [null,[],{},123,{...example(),token:'SECRET'},Object.create(example())]){
  const r=assessGithubRunnerV84(v);
  assert.deepEqual(r.issueCodes,['OBSERVATION_INVALID']);
  assert.equal(r.decision,'NO_GO');
 }
});
test('nonboolean context and inconsistent RAM are rejected',()=>{
 const x=example();x.linux='true';
 assert.equal(assessGithubRunnerV84(x).observationValid,false);
 const y=example();y.availableRamMiB=y.totalRamMiB+1;
 assert.equal(assessGithubRunnerV84(y).observationValid,false);
});
test('collector handles unavailable statfs, never prints native errors',()=>{
 const f=fake();f.fsApi.statfsSync=()=>{throw Error('Sensitive /private/home/path');};
 const r=collectGithubRunnerV84({...f,env:env()});
 assert.equal(r.observationValid,false);
 assert.equal(r.decision,'NO_GO');
 assert.ok(!JSON.stringify(r).includes('Sensitive'));
});
test('collector rejects negative or impossible disk capacity',()=>{
 const f=fake();f.fsApi.statfsSync=()=>({bavail:-1n,bsize:4096n});
 const r=collectGithubRunnerV84({...f,env:env()});
 assert.deepEqual(r.issueCodes,['OBSERVATION_INVALID']);
});
test('collector rejects platform and architecture mismatches',()=>{
 const f=fake();f.osApi.arch=()=> 'arm64';
 const r=collectGithubRunnerV84({...f,env:env()});
 assert.equal(r.resourceCandidate,false);
 assert.deepEqual(r.issueCodes,['RUNNER_CONTEXT_NOT_CONFIRMED']);
});
test('evaluation output is immutable, no false authority from mutation',()=>{
 const r=assessGithubRunnerV84(example());
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.issueCodes));
 assert.throws(()=>{r.decision='GO'},TypeError);
});
