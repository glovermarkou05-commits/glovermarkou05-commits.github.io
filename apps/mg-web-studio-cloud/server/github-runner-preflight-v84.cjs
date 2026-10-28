'use strict';

// V84: GitHub-hosted Linux runner capacity preflight only.
// No HTTP, sockets, SQL, PostgreSQL, Docker, subprocess, deployment or secrets.
// Runner-context variables are checked, not printed or treated as attestation.
// Resource readiness never grants operational permissions.
const os=require('node:os');
const fs=require('node:fs');

const REPOSITORY='glovermarkou05-commits/glovermarkou05-commits.github.io';
const REF='refs/heads/feature/mg-digital-v5-web-services';
const GiB=1024n**3n;
const MiB=1024n**2n;
const LIMITS=Object.freeze({
  minCpuCount:2,minTotalRamMiB:6144,minAvailableRamMiB:3072,
  minWorkspaceFreeMiB:4096
});
const FIELDS=Object.freeze(['source','linux','x64','githubActions','expectedRepository',
  'expectedBranch','githubHosted','cpuCount','totalRamMiB',
  'availableRamMiB','workspaceFreeMiB']);
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(x))&&
  Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
const safeMiB=x=>Number.isSafeInteger(x)&&x>=0&&x<=16777216;
function assessGithubRunnerV84(snapshot){
  let valid=exact(snapshot,FIELDS);
  if(valid)valid=snapshot.source==='GITHUB_RUNNER_READ_ONLY'&&
    ['linux','x64','githubActions','expectedRepository',
      'expectedBranch','githubHosted'].every(k=>typeof snapshot[k]==='boolean')&&
    ['cpuCount','totalRamMiB','availableRamMiB','workspaceFreeMiB']
      .every(k=>safeMiB(snapshot[k]))&&
    snapshot.cpuCount>=1&&snapshot.cpuCount<=1024&&
    snapshot.totalRamMiB>=1&&snapshot.availableRamMiB<=snapshot.totalRamMiB;
  const issues=[];
  if(!valid)issues.push('OBSERVATION_INVALID');
  else{
    if(!(snapshot.linux&&snapshot.x64&&snapshot.githubActions&&
      snapshot.expectedRepository&&snapshot.expectedBranch&&snapshot.githubHosted))
      issues.push('RUNNER_CONTEXT_NOT_CONFIRMED');
    if(snapshot.cpuCount<LIMITS.minCpuCount)issues.push('CPU_BELOW_PLAN');
    if(snapshot.totalRamMiB<LIMITS.minTotalRamMiB)issues.push('TOTAL_RAM_BELOW_PLAN');
    if(snapshot.availableRamMiB<LIMITS.minAvailableRamMiB)
      issues.push('AVAILABLE_RAM_BELOW_PLAN');
    if(snapshot.workspaceFreeMiB<LIMITS.minWorkspaceFreeMiB)
      issues.push('WORKSPACE_DISK_BELOW_PLAN');
  }
  return Object.freeze({
    observationValid:valid,
    // A resource candidate is not a permission, SQL readiness or proof of isolation.
    resourceCandidate:issues.length===0,
    issueCodes:Object.freeze(issues),
    limits:LIMITS,
    environmentSelection:'GITHUB_ACTIONS_APPROVED_FOR_READ_ONLY_PREFLIGHT',
    postgresInstalled:false,postgresStarted:false,portsOpened:false,
    databaseConnected:false,dockerTouched:false,externalHttpTested:false,
    productionTouched:false,syntheticFixturesCreated:false,
    permissionsV78:'SIX_PENDING',v67Pending:32,v67Passed:0,
    decision:'NO_GO'
  });
}
function collectGithubRunnerV84({osApi=os,fsApi=fs,env=process.env,
  cwd=process.cwd()}={}){
  try{
    // Never inspect arbitrary local machines as if they were authorized runners.
    if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!==REPOSITORY||
      env.GITHUB_REF!==REF||env.RUNNER_ENVIRONMENT!=='github-hosted'||
      env.RUNNER_OS!=='Linux')return assessGithubRunnerV84(null);
    const f=fsApi.statfsSync(cwd,{bigint:true});
    const free=BigInt(f.bavail)*BigInt(f.bsize);
    if(free<0n||free>BigInt(Number.MAX_SAFE_INTEGER))throw Error('invalid filesystem');
    const total=BigInt(osApi.totalmem());
    const available=BigInt(osApi.freemem());
    const snapshot={
      source:'GITHUB_RUNNER_READ_ONLY',linux:osApi.platform()==='linux',
      x64:osApi.arch()==='x64',
      githubActions:true,expectedRepository:true,expectedBranch:true,
      githubHosted:true,cpuCount:osApi.availableParallelism(),
      totalRamMiB:Number(total/MiB),
      availableRamMiB:Number(available/MiB),
      workspaceFreeMiB:Number(free/MiB)
    };
    return Object.freeze({...assessGithubRunnerV84(snapshot),
      observation:Object.freeze({
        cpuCount:snapshot.cpuCount,totalRamMiB:snapshot.totalRamMiB,
        availableRamMiB:snapshot.availableRamMiB,
        workspaceFreeMiB:snapshot.workspaceFreeMiB,
        linux:snapshot.linux,x64:snapshot.x64,
        repositoryAndBranchMatch:true
      })});
  }catch{
    // Do not expose paths, environment variables, hostnames or error messages.
    return assessGithubRunnerV84(null);
  }
}
module.exports={assessGithubRunnerV84,collectGithubRunnerV84,LIMITS};
