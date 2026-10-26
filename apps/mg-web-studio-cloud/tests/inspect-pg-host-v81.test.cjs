'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {collectHostSnapshotV81,main}=require('../scripts/inspect-pg-host-v81.cjs');
const NAME='supabase_db_bazar_online_4r_local_only';
const ps=()=>JSON.stringify({platform:'win32',cpuCount:8,totalRamMiB:7864,
 availableRamMiB:799,systemFreeMiB:17203,targetFreeMiB:17203,
 sameVolume:true,targetBusType:'SATA',targetFilesystem:'NTFS'});
function harness({docker=true,psOutput=ps(),dockerOutput=JSON.stringify({
 Names:NAME,Status:'Up 38 hours (healthy)'})}={}){
 const commands=[];
 const run=(file,args)=>{commands.push({file,args});
  if(file==='powershell.exe')return psOutput;
  if(file==='docker.exe') {
    if(!docker)throw Error('Docker inaccessible secret details');
    return dockerOutput+'\n';
  }
  throw Error('Unexpected process invoked');
 };
 return {run,commands};
}
test('valid C preflight reads only PowerShell metrics and Docker ps',()=>{
 const h=harness();const s=collectHostSnapshotV81({run:h.run});
 assert.equal(s.protectedContainer.health,'healthy');
 assert.equal(s.availableRamMiB,799);
 assert.equal(h.commands.length,2);
 assert.deepEqual(h.commands.map(x=>x.file),['powershell.exe','docker.exe']);
 assert.deepEqual(h.commands[1].args,[
  'ps','--filter','name='+NAME,'--format','{{json .}}']);
});
test('powershell arguments disallow profiles and do not use shell',()=>{
 const h=harness();collectHostSnapshotV81({run:h.run});
 const p=h.commands[0];
 assert.deepEqual(p.args.slice(0,3),['-NoProfile','-NonInteractive','-Command']);
 assert.ok(p.args[3].includes('Get-CimInstance Win32_OperatingSystem'));
 assert.ok(p.args[3].includes('Get-Volume -DriveLetter C'));
 assert.ok(p.args[3].includes('Get-Disk'));
 assert.ok(!p.args[3].includes('Stop-Process'));
});
test('E is inspected strictly using same read-only commands and detected as USB',()=>{
 const h=harness({psOutput:JSON.stringify({platform:'win32',cpuCount:8,totalRamMiB:7864,
  availableRamMiB:799,systemFreeMiB:17203,targetFreeMiB:102170,
  sameVolume:false,targetBusType:'USB',targetFilesystem:'exFAT'})});
 const s=collectHostSnapshotV81({drive:'E',run:h.run});
 assert.equal(s.targetBusType,'USB');assert.equal(s.sameVolume,false);
 assert.ok(h.commands[0].args[3].includes('Get-Partition -DriveLetter E'));
});
test('untrusted drive name is rejected before subprocess execution',()=>{
 for(const drive of ['C;Write-Host','c','E:\\','\\\\server','',123,null]){
  const h=harness();
  assert.equal(collectHostSnapshotV81({drive,run:h.run}),null);
  assert.equal(h.commands.length,0);
 }
});
test('docker unavailable yields unavailable observation without exposing errors',()=>{
 const h=harness({docker:false});
 assert.equal(collectHostSnapshotV81({run:h.run}),null);
});
test('Docker ps empty results never claim protected BAZAR healthy',()=>{
 const h=harness({dockerOutput:''});const s=collectHostSnapshotV81({run:h.run});
 assert.equal(s.protectedContainer.state,'unknown');
 assert.equal(s.protectedContainer.health,'unknown');
});
test('unhealthy Docker container cannot be called healthy',()=>{
 const h=harness({dockerOutput:JSON.stringify({Names:NAME,Status:'Up 2 hours (unhealthy)'})});
 const s=collectHostSnapshotV81({run:h.run});
 assert.equal(s.protectedContainer.health,'unknown');
});
test('a different container name never qualifies for BAZAR protection',()=>{
 const h=harness({dockerOutput:JSON.stringify({Names:'other',Status:'Up (healthy)'})});
 const s=collectHostSnapshotV81({run:h.run});
 assert.equal(s.protectedContainer.health,'unknown');
});
test('PowerShell error and arbitrary output fail closed',()=>{
 for(const psOutput of ['', 'secret password','[]','null']){
  const h=harness({psOutput});const s=collectHostSnapshotV81({run:h.run});
  // Invalid shapes can reach the pure evaluator but cannot be approved.
  if(s!==null) {
    const {assessPgHostFeasibilityV81}=require('../server/pg-host-feasibility-v81.cjs');
    assert.equal(assessPgHostFeasibilityV81(s).resourceCandidate,false);
  }
 }
});
test('help and unknown flag never probe resources',()=>{
 let t='';const out=x=>t+=x;
 assert.equal(main(['--help'],out,{run:()=>{throw Error('must not call')}}),0);
 assert.match(t,/SOLO LECTURA/);
 t='';
 assert.equal(main(['--run-docker'],out,{run:()=>{throw Error('must not call')}}),2);
});
test('valid synthetic CLI reports only sanitized capacity, not command strings',()=>{
 const h=harness();let output='';
 const rc=main(['--target-drive=C'],x=>output+=x,{run:h.run});
 const res=JSON.parse(output);
 assert.equal(rc,0);assert.equal(res.drive,'C');
 assert.equal(res.observation.availableRamMiB,799);
 assert.equal(res.assessment.decision,'NO_GO');
 assert.equal(res.assessment.resourceCandidate,false);
 assert.ok(!output.includes('powershell.exe'));
 assert.equal(h.commands.length,2);
});
test('missing Docker returns no observation and NO_GO',()=>{
 const h=harness({docker:false});let output='';
 const rc=main([],x=>output+=x,{run:h.run});
 assert.equal(rc,1);const r=JSON.parse(output);
 assert.equal(r.observation,null);assert.equal(r.assessment.decision,'NO_GO');
});
test('PowerShell and Docker access never changes BAZAR or other resources',()=>{
 const h=harness();collectHostSnapshotV81({run:h.run});
 assert.equal(h.commands[1].args[0],'ps');
 for(const x of h.commands){
  assert.ok(!x.args.some(y=>['stop','rm','start','restart','exec','run','volume','compose'].includes(y)));
 }
});

test('PowerShell command failure emits only safe diagnostic stage',()=>{
 let stage=null,output='';
 const h=harness();
 const run=(file,args)=>{if(file==='powershell.exe')throw Error('private Windows error PASSWORD123');return h.run(file,args);};
 const rc=main([],s=>output+=s,{run,onDiagnostic:s=>stage=s});
 const data=JSON.parse(output);
 assert.equal(rc,1);assert.equal(stage,'WINDOWS_QUERY');
 assert.equal(data.diagnosticStage,'WINDOWS_QUERY');
 assert.equal(data.assessment.decision,'NO_GO');
 assert.ok(!output.includes('PASSWORD123'));
});
test('Windows JSON invalid returns WINDOWS_JSON without raw value',()=>{
 let output='';
 const h=harness({psOutput:'sensitive-invalid-input'});
 main([],s=>output+=s,{run:h.run});
 const data=JSON.parse(output);
 assert.equal(data.diagnosticStage,'WINDOWS_JSON');
 assert.equal(data.observation,null);
 assert.ok(!output.includes('sensitive-invalid-input'));
});
test('Docker command failure returns DOCKER_QUERY without stderr',()=>{
 let output='';
 const h=harness({docker:false});
 main([],s=>output+=s,{run:h.run});
 const data=JSON.parse(output);
 assert.equal(data.diagnosticStage,'DOCKER_QUERY');
 assert.equal(data.assessment.decision,'NO_GO');
 assert.ok(!output.includes('secret details'));
});
test('invalid Docker JSON returns DOCKER_JSON without printing data',()=>{
 let output='';
 const h=harness({dockerOutput:'sensitive-not-json'});
 main([],s=>output+=s,{run:h.run});
 const data=JSON.parse(output);
 assert.equal(data.diagnosticStage,'DOCKER_JSON');
 assert.ok(!output.includes('sensitive-not-json'));
});
test('UTF8 BOM from PowerShell must not prevent valid observation',()=>{
 let output='';
 const h=harness({psOutput:'\uFEFF'+ps()});
 const rc=main([],s=>output+=s,{run:h.run});
 assert.equal(rc,0);
 const data=JSON.parse(output);
 assert.equal(data.diagnosticStage,null);
 assert.equal(data.observation.cpuCount,8);
 assert.equal(data.assessment.decision,'NO_GO');
});
test('arguments cannot override protected container or allow mutation',()=>{
 let output='';
 const h=harness();
 const rc=main(['--target-drive=C','--docker=stop'],s=>output+=s,{run:h.run});
 assert.equal(rc,2);assert.equal(h.commands.length,0);
 assert.ok(!output.includes('stop'));
});

test('slow Windows CIM scan gets a bounded 30 second window without shell',()=>{
 const {invokeReadOnlyV81,COMMAND_TIMEOUT_MS}=require('../scripts/inspect-pg-host-v81.cjs');
 let seen;
 const run=(file,args,opts)=>{seen={file,args,opts};return 'ok';};
 assert.equal(invokeReadOnlyV81('powershell.exe',['-NoProfile'],run),'ok');
 assert.equal(seen.opts.timeout,30000);
 assert.equal(COMMAND_TIMEOUT_MS.powershell,30000);
 assert.equal(seen.opts.shell,false);
 assert.deepEqual(seen.opts.stdio,['ignore','pipe','pipe']);
});
test('Docker ps remains time-limited and unknown commands are forbidden',()=>{
 const {invokeReadOnlyV81,COMMAND_TIMEOUT_MS}=require('../scripts/inspect-pg-host-v81.cjs');
 let call;
 invokeReadOnlyV81('docker.exe',['ps'],(file,args,opts)=>{call={file,args,opts};return '';});
 assert.equal(call.opts.timeout,12000);
 assert.equal(COMMAND_TIMEOUT_MS.docker,12000);
 assert.equal(call.opts.shell,false);
 assert.throws(()=>invokeReadOnlyV81('cmd.exe',['/c','whoami'],()=>{throw Error('must not call')}),/unsupported/);
});
