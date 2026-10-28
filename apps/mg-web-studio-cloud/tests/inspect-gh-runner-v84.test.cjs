'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {main}=require('../scripts/inspect-gh-runner-v84.cjs');
function options(changes={}){
 const env={
  GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'glovermarkou05-commits/glovermarkou05-commits.github.io',
  GITHUB_REF:'refs/heads/feature/mg-digital-v5-web-services',
  RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux',...(changes.env||{})
 };
 const osApi={
  platform:()=> 'linux',arch:()=> 'x64',
  availableParallelism:()=>4,totalmem:()=>16*1024**3,freemem:()=>12*1024**3
 };
 return {env,osApi,fsApi:{statfsSync:()=>({bavail:8n*1024n,bsize:1048576n})},
  cwd:'/tmp/synthetic',...changes};
}
function capture(args=[],opts=options()){
 let output='';
 const code=main(args,x=>output+=x,opts);
 return {code,output};
}
test('CLI returns complete safe resource summary on valid synthetic host',()=>{
 const r=capture(['--json']);
 assert.equal(r.code,0);
 const j=JSON.parse(r.output);
 assert.equal(j.version,'V84');
 assert.equal(j.observation.cpuCount,4);
 assert.equal(j.observation.availableRamMiB,12*1024);
 assert.equal(j.observation.workspaceFreeMiB,8*1024);
 assert.equal(j.assessment.resourceCandidate,true);
 assert.equal(j.assessment.decision,'NO_GO');
});
test('CLI cannot issue PG start or port approval even when capable',()=>{
 const j=JSON.parse(capture().output);
 assert.equal(j.assessment.postgresInstalled,false);
 assert.equal(j.assessment.postgresStarted,false);
 assert.equal(j.assessment.portsOpened,false);
 assert.equal(j.assessment.databaseConnected,false);
 assert.equal(j.assessment.v67Pending,32);
 assert.equal(j.assessment.permissionsV78,'SIX_PENDING');
});
test('CLI refuses to operate as if on GitHub outside approved context',()=>{
 const r=capture([],options({env:{GITHUB_ACTIONS:'false'}}));
 assert.equal(r.code,1);
 const j=JSON.parse(r.output);
 assert.equal(j.observation,null);
 assert.deepEqual(j.assessment.issueCodes,['OBSERVATION_INVALID']);
});
test('CLI reports insufficient space without false GO',()=>{
 const opts=options();
 opts.fsApi.statfsSync=()=>({bavail:1024n,bsize:1048576n});
 const r=capture([],opts);
 assert.equal(r.code,1);
 const j=JSON.parse(r.output);
 assert.deepEqual(j.assessment.issueCodes,['WORKSPACE_DISK_BELOW_PLAN']);
 assert.equal(j.assessment.decision,'NO_GO');
});
test('CLI help avoids resource collection',()=>{
 let calls=0;
 const r=capture(['--help'],options({fsApi:{statfsSync:()=>{
  calls++;throw Error('must not read')}}}));
 assert.equal(r.code,0);assert.equal(calls,0);
 assert.match(r.output,/sin instalar ni iniciar PostgreSQL/);
});
test('unknown flags cannot trigger actions',()=>{
 for(const flag of ['--install','--start','--docker','--deploy','--port=5432']){
  const r=capture([flag]);
  assert.equal(r.code,2);assert.match(r.output,/Argumentos no permitidos/);
 }
});
test('CLI output does not echo repo environment or secret values',()=>{
 const o=options();
 o.env.MG_SECRET='THIS_MUST_NOT_APPEAR';
 const r=capture([],o);
 assert.equal(r.code,0);
 assert.ok(!r.output.includes('THIS_MUST_NOT_APPEAR'));
 assert.ok(!r.output.includes('GITHUB_REPOSITORY'));
 assert.ok(!r.output.includes('postgres://'));
});
