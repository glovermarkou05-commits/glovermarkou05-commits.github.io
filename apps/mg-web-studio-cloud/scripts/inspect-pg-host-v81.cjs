#!/usr/bin/env node
'use strict';

// Windows-only, EXPLICIT INVOCATION. Read-only CIM and volume queries plus
// "docker ps". No profiles, state changes, sockets, installs or SQL.
const {execFileSync}=require('node:child_process');
const {assessPgHostFeasibilityV81}=require('../server/pg-host-feasibility-v81.cjs');
const NAME='supabase_db_bazar_online_4r_local_only';
// On a memory-constrained Windows host, WMI/CIM and Storage cmdlets may
// legitimately take longer than 8 seconds. Keep finite timeouts and no shell.
const COMMAND_TIMEOUT_MS=Object.freeze({powershell:30000,docker:12000});
const invokeReadOnlyV81=(file,args,exec=execFileSync)=>{
  if(file!=='powershell.exe'&&file!=='docker.exe')
    throw Error('unsupported read-only executable');
  return exec(file,args,{timeout:file==='powershell.exe'?
    COMMAND_TIMEOUT_MS.powershell:COMMAND_TIMEOUT_MS.docker,
    encoding:'utf8',windowsHide:true,maxBuffer:1024*128,
    shell:false,stdio:['ignore','pipe','pipe']});
};
const pass=(file,args)=>invokeReadOnlyV81(file,args);
const psForDrive=drive=>[
 "$ErrorActionPreference='Stop'",
 "$os=Get-CimInstance Win32_OperatingSystem",
 "$cpu=(Get-CimInstance Win32_Processor | Measure-Object -Property NumberOfLogicalProcessors -Sum).Sum",
 "$sys=Get-Volume -DriveLetter C",
 "$target=Get-Volume -DriveLetter "+drive,
 "$disk=Get-Partition -DriveLetter "+drive+" | Get-Disk",
 "$obj=[ordered]@{",
 "platform='win32';",
 "cpuCount=[int]$cpu;",
 "totalRamMiB=[int][math]::Floor($os.TotalVisibleMemorySize/1024);",
 "availableRamMiB=[int][math]::Floor($os.FreePhysicalMemory/1024);",
 "systemFreeMiB=[int][math]::Floor($sys.SizeRemaining/1MB);",
 "targetFreeMiB=[int][math]::Floor($target.SizeRemaining/1MB);",
 "sameVolume=('"+drive+"' -eq 'C');",
 "targetBusType=[string]$disk.BusType;",
 "targetFilesystem=[string]$target.FileSystem",
 "}",
 "$obj | ConvertTo-Json -Compress"
].join('\n');
function collectHostSnapshotV81({drive='C',run=pass,onDiagnostic=()=>{}}={}) {
  const signal=code=>{
    if(typeof onDiagnostic==='function')onDiagnostic(code);
  };
  if(typeof drive!=='string'||!/^[A-Z]$/.test(drive)||typeof run!=='function'){
    signal('INVALID_ARGUMENTS');
    return null;
  }
  let stage='WINDOWS_QUERY';
  try {
    const raw=run('powershell.exe',[
      '-NoProfile','-NonInteractive','-Command',psForDrive(drive)]);
    stage='WINDOWS_JSON';
    // Some PowerShell hosts may prefix UTF-8 output with a BOM.
    const source=JSON.parse(raw.replace(/^\uFEFF/,'').trim());
    if(!source||typeof source!=='object'||Array.isArray(source))
      throw Error('invalid observation');
    stage='DOCKER_QUERY';
    const containers=run('docker.exe',['ps','--filter','name='+NAME,
      '--format','{{json .}}']);
    stage='DOCKER_JSON';
    const record=containers.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x))
      .find(x=>x.Names===NAME);
    return {
      source:'READ_ONLY_WINDOWS_PROBE',
      platform:source.platform,cpuCount:source.cpuCount,
      totalRamMiB:source.totalRamMiB,availableRamMiB:source.availableRamMiB,
      systemFreeMiB:source.systemFreeMiB,targetFreeMiB:source.targetFreeMiB,
      sameVolume:source.sameVolume,targetBusType:source.targetBusType,
      targetFilesystem:source.targetFilesystem,
      protectedContainer:{name:NAME,state:record?'running':'unknown',
        health:record && /\(healthy\)/.test(record.Status)?'healthy':'unknown'}
    };
  }catch{
    // Stage only. Never forward native exception, stderr, environment or raw JSON.
    signal(stage);
    return null;
  }
}
const HELP='V81 — Diagnostico Windows y BAZAR (SOLO LECTURA)\n'+
 'Uso: node scripts/inspect-pg-host-v81.cjs [--target-drive=C|D|E...]\n'+
 'NO instala PostgreSQL; NO modifica Docker; NO abre conexiones SQL.\n';
function main(args=process.argv.slice(2),write=x=>process.stdout.write(x),opts={}) {
  if(args.length===1&&args[0]==='--help'){write(HELP);return 0;}
  if(args.length>1||(args.length===1&&!/^--target-drive=[A-Z]$/.test(args[0]))){
    write(HELP);return 2;
  }
  const drive=args.length?args[0].slice(-1):'C';
  let diagnosticStage=null;
  const originalDiagnostic=opts.onDiagnostic;
  const obs=collectHostSnapshotV81({...opts,drive,onDiagnostic:code=>{
    diagnosticStage=code;
    if(typeof originalDiagnostic==='function')originalDiagnostic(code);
  }});
  const report=assessPgHostFeasibilityV81(obs);
  // Only normalized fields and fixed issue codes leave this CLI.
  write(JSON.stringify({drive,diagnosticStage,observation:report.observationShapeValid?{
    cpuCount:obs.cpuCount,totalRamMiB:obs.totalRamMiB,
    availableRamMiB:obs.availableRamMiB,systemFreeMiB:obs.systemFreeMiB,
    targetFreeMiB:obs.targetFreeMiB,sameVolume:obs.sameVolume,
    targetBusType:obs.targetBusType,targetFilesystem:obs.targetFilesystem,
    protectedContainerHealthy:obs.protectedContainer.health==='healthy'
  }:null,
  assessment:{resourceCandidate:report.resourceCandidate,
    issueCodes:report.issueCodes,decision:report.decision,
    databaseStartAuthorized:false,v67Pending:report.v67OperationalPending}},null,2)+'\n');
  return report.observationShapeValid?0:1;
}
if(require.main===module)process.exitCode=main();
module.exports={collectHostSnapshotV81,main,invokeReadOnlyV81,COMMAND_TIMEOUT_MS};
