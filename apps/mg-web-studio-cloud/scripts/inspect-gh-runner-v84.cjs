#!/usr/bin/env node
'use strict';

// This CLI measures ONLY its current GitHub-hosted runner.
// It performs no requests, listens on no port and does not touch databases.
const {collectGithubRunnerV84}=require('../server/github-runner-preflight-v84.cjs');

function main(args=process.argv.slice(2),write=x=>process.stdout.write(x),opts={}){
  if(args.length===1&&args[0]==='--help'){
    write('V84: mide RAM/CPU/disco disponibles en GitHub Actions sin instalar ni iniciar PostgreSQL.\n');
    return 0;
  }
  if(args.length!==0 && !(args.length===1&&args[0]==='--json')){
    write('Argumentos no permitidos. --help o --json\n');
    return 2;
  }
  const report=collectGithubRunnerV84(opts);
  write(JSON.stringify({
    version:'V84',mode:'GITHUB_RUNNER_READ_ONLY_PREFLIGHT',
    observation:report.observation||null,
    assessment:{
      observationValid:report.observationValid,
      resourceCandidate:report.resourceCandidate,
      issueCodes:report.issueCodes,
      planningLimits:report.limits,
      postgresInstalled:false,postgresStarted:false,portsOpened:false,
      databaseConnected:false,productionTouched:false,
      permissionsV78:'SIX_PENDING',v67Pending:32,v67Passed:0,
      decision:'NO_GO'
    }
  },null,2)+'\n');
  return report.observationValid&&report.issueCodes.length===0?0:1;
}
if(require.main===module)process.exitCode=main();
module.exports={main};
