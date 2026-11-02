#!/usr/bin/env node
'use strict';
// V94-specific GitHub-hosted PR context and resource preflight.
// Reuses the unchanged V84 safety thresholds. Never accesses Docker/SQL/network.
const os=require('node:os');
const fs=require('node:fs');
const {assessGithubRunnerV84}=require('../server/github-runner-preflight-v84.cjs');
const MiB=1024n**2n;
function inspect(opts={}){
 const env=opts.env||process.env, osApi=opts.osApi||os, fsApi=opts.fsApi||fs;
 const cwd=opts.cwd||process.cwd();
 const valid=env.GITHUB_ACTIONS==='true'&&
   env.GITHUB_EVENT_NAME==='pull_request'&&
   env.GITHUB_REPOSITORY==='glovermarkou05-commits/glovermarkou05-commits.github.io'&&
   env.GITHUB_REF==='refs/pull/7/merge'&&
   env.GITHUB_HEAD_REF==='docs/mg-web-studio-v94-preflight-20261101'&&
   env.GITHUB_BASE_REF==='feature/mg-digital-v5-web-services'&&
   env.RUNNER_ENVIRONMENT==='github-hosted'&&env.RUNNER_OS==='Linux';
 if(!valid)return Object.freeze({observation:null,assessment:assessGithubRunnerV84(null)});
 try{
   const stat=fsApi.statfsSync(cwd,{bigint:true});
   const free=BigInt(stat.bavail)*BigInt(stat.bsize);
   const total=BigInt(osApi.totalmem()), available=BigInt(osApi.freemem());
   if(free<0n||free>BigInt(Number.MAX_SAFE_INTEGER)||total<0n||available<0n){
     return Object.freeze({observation:null,assessment:assessGithubRunnerV84(null)});
   }
   const cpu=osApi.availableParallelism();
   const metrics={
     cpuCount:cpu,totalRamMiB:Number(total/MiB),
     availableRamMiB:Number(available/MiB),workspaceFreeMiB:Number(free/MiB)
   };
   const assessment=assessGithubRunnerV84({
     source:'GITHUB_RUNNER_READ_ONLY',
     linux:osApi.platform()==='linux',x64:osApi.arch()==='x64',
     githubActions:true,expectedRepository:true,expectedBranch:true,githubHosted:true,
     ...metrics
   });
   return Object.freeze({observation:Object.freeze(metrics),assessment});
 }catch{
   return Object.freeze({observation:null,assessment:assessGithubRunnerV84(null)});
 }
}
function main(args=process.argv.slice(2),write=x=>process.stdout.write(x),opts={}){
 if(args.length!==1||args[0]!=='--json'){write('V94 resource preflight: only --json accepted\n');return 2;}
 const r=inspect(opts);
 write(JSON.stringify({
  version:'V94',context:'EXACT_SAME_REPO_PR_7_ONLY',
  observation:r.observation,
  resourceCandidate:r.assessment.resourceCandidate,
  issues:r.assessment.issueCodes,
  planningLimits:r.assessment.limits,
  createdContainers:false,executedSql:false,
  v67Pending:32,v67Passed:0,production:'NO_GO'
 },null,2)+'\n');
 return r.assessment.observationValid&&r.assessment.issueCodes.length===0?0:1;
}
if(require.main===module)process.exitCode=main();
module.exports={inspect,main};
