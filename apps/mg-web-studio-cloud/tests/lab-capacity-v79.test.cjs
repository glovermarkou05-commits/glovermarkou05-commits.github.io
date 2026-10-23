'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assessLocalCapacityV79,collectLocalCapacityV79,MIN}=require('../server/lab-capacity-v79.cjs');
const G=1024**3;
const good=()=>({source:'LOCAL_READ_ONLY_MEASUREMENT',platform:'win32',availableCpus:4,
 totalMemoryBytes:16*G,freeMemoryBytes:8*G,systemDiskFreeBytes:12*G,
 workspaceDiskFreeBytes:20*G,sameDisk:false});
const source=(p={},fsChange={})=>{
 const calls=[];
 const osApi={platform:()=>p.platform??'win32',availableParallelism:()=>p.cpus??4,
 totalmem:()=>p.totalmem??16*G,freemem:()=>p.freemem??8*G};
 const fsApi={statfsSync:(root,opt)=>{calls.push({root,opt});if(fsChange.fail)throw Error('PRIVATE_PATH');
 return {bavail:BigInt(root.toLowerCase().startsWith('c:')?12:20)*BigInt(G),bsize:1n};}};
 const pathApi={win32:{parse:()=>({root:p.workspaceRoot??'E:\\'})},parse:()=>({root:'/'})};
 return {out:collectLocalCapacityV79({osApi,fsApi,pathApi,env:{SystemDrive:p.systemDrive??'C:'},
 cwd:'private-directory'}),calls};
};
test('minimums match V78 planning 10GiB workspace, 4GiB available memory and 2 CPUs',()=>{
 assert.equal(MIN.workspaceFreeGiB,10);assert.equal(MIN.systemFreeGiB,4);
 assert.equal(MIN.availableMemoryGiB,4);assert.equal(MIN.availableCpus,2);
});
test('healthy synthetic machine has resource candidate only and NO_GO',()=>{
 const r=assessLocalCapacityV79(good());assert.equal(r.measurementShapeValid,true);
 assert.equal(r.resourceThresholdsMet,true);assert.deepEqual(r.issueCodes,[]);
 assert.equal(r.decision,'NO_GO');assert.equal(r.operatorConfirmed,false);
 assert.equal(r.databaseConnectionAuthorized,false);
});
test('result is immutable including metrics, issue codes and capabilities',()=>{
 const r=assessLocalCapacityV79(good());assert.ok(Object.isFrozen(r));
 assert.ok(Object.isFrozen(r.metrics)&&Object.isFrozen(r.issueCodes));
 assert.throws(()=>{r.decision='GO'},TypeError);
});
test('free workspace disk below 10 GiB raises explicit warning',()=>{
 const x=good();x.workspaceDiskFreeBytes=9*G;
 const r=assessLocalCapacityV79(x);assert.ok(r.issueCodes.includes('WORKSPACE_DISK_BELOW_MINIMUM'));
 assert.equal(r.resourceThresholdsMet,false);
});
test('system disk lower than four GiB is not a candidate, even with space on E',()=>{
 const x=good();x.systemDiskFreeBytes=2*G;
 const r=assessLocalCapacityV79(x);assert.ok(r.issueCodes.includes('SYSTEM_DISK_BELOW_MINIMUM'));
});
test('memory free is checked independently of installed RAM',()=>{
 const x=good();x.freeMemoryBytes=3*G;
 const r=assessLocalCapacityV79(x);assert.ok(r.issueCodes.includes('AVAILABLE_MEMORY_BELOW_MINIMUM'));
});
test('total RAM below four GiB rejects even if readings otherwise synthetic',()=>{
 const x=good();x.totalMemoryBytes=3*G;x.freeMemoryBytes=2*G;
 const r=assessLocalCapacityV79(x);assert.ok(r.issueCodes.includes('TOTAL_MEMORY_BELOW_MINIMUM'));
});
test('single CPU raises a specific code',()=>{
 const x=good();x.availableCpus=1;
 const r=assessLocalCapacityV79(x);assert.deepEqual(r.issueCodes,['CPU_BELOW_MINIMUM']);
});
test('exact thresholds are inclusive',()=>{
 const x=good();x.availableCpus=2;x.totalMemoryBytes=4*G;x.freeMemoryBytes=4*G;
 x.systemDiskFreeBytes=4*G;x.workspaceDiskFreeBytes=10*G;
 assert.equal(assessLocalCapacityV79(x).resourceThresholdsMet,true);
});
test('invalid, negative, unsafe or fractional resource numbers fail closed',()=>{
 for(const v of [-1,Infinity,NaN,3.5,'10',{},null,Number.MAX_SAFE_INTEGER+2]){
  const x=good();x.systemDiskFreeBytes=v;
  assert.equal(assessLocalCapacityV79(x).measurementShapeValid,false);
 }
});
test('free memory cannot exceed total memory',()=>{
 const x=good();x.freeMemoryBytes=17*G;
 assert.equal(assessLocalCapacityV79(x).measurementShapeValid,false);
});
test('same disk measurements must agree',()=>{
 const x=good();x.sameDisk=true;
 assert.equal(assessLocalCapacityV79(x).measurementShapeValid,false);
 x.workspaceDiskFreeBytes=x.systemDiskFreeBytes;
 assert.equal(assessLocalCapacityV79(x).measurementShapeValid,true);
});
test('extra hostname, user, token or target path field is refused and never echoed',()=>{
 for(const key of ['hostname','username','DATABASE_URL','token']){
  const x=good();x[key]='SECRET';const r=assessLocalCapacityV79(x);
  assert.equal(r.measurementShapeValid,false);assert.ok(!JSON.stringify(r).includes('SECRET'));
 }
});
test('only a local source marker and known platform are accepted',()=>{
 const a=good();a.source='CI_AS_USER';assert.equal(assessLocalCapacityV79(a).measurementShapeValid,false);
 const b=good();b.platform='unknown';assert.equal(assessLocalCapacityV79(b).measurementShapeValid,false);
});
test('synthetic win32 source measures C root and workspace E root, never directory contents',()=>{
 const r=source();assert.equal(r.out.measurementShapeValid,true);
 assert.equal(r.out.metrics.sameDisk,false);
 assert.deepEqual(r.calls.map(x=>x.root),['C:\\','E:\\']);
 assert.ok(r.calls.every(x=>x.opt.bigint===true));
});
test('same drive reads only one filesystem stat',()=>{
 const r=source({workspaceRoot:'C:\\'});assert.equal(r.calls.length,1);
 assert.equal(r.out.metrics.sameDisk,true);
 assert.equal(r.out.metrics.workspaceFreeGiB,r.out.metrics.systemFreeGiB);
});
test('missing or malformed SystemDrive never scans other drives',()=>{
 for(const drive of ['?', 'C:\\','\\\\host\\share',''] ){
  const r=source({systemDrive:drive});assert.equal(r.calls.length,0);
  assert.equal(r.out.measurementShapeValid,false);
 }
});
test('network shares are rejected for workspace measurement',()=>{
 const r=source({workspaceRoot:'\\\\server\\share\\'});
 assert.equal(r.out.measurementShapeValid,false);assert.equal(r.calls.length,0);
});
test('file metadata permission errors fail closed without sensitive path data',()=>{
 const r=source({}, {fail:true});assert.equal(r.out.measurementShapeValid,false);
 assert.equal(r.out.decision,'NO_GO');assert.ok(!JSON.stringify(r.out).includes('PRIVATE_PATH'));
});
test('linux fixture uses root once and does not contact a provider',()=>{
 const r=source({platform:'linux'});assert.equal(r.calls.length,1);
 assert.equal(r.calls[0].root,'/');assert.equal(r.out.metrics.platform,'linux');
});
test('unknown operating systems do not attempt filesystem access',()=>{
 const r=source({platform:'android'});assert.equal(r.out.measurementShapeValid,false);
 assert.equal(r.calls.length,0);
});
test('missing or malformed sensor values never issue approval',()=>{
 const x=good();delete x.availableCpus;const r=assessLocalCapacityV79(x);
 assert.equal(r.measurementShapeValid,false);assert.equal(r.productionAuthorized,false);
});
test('a measurement never decrements operational V67 pending count',()=>{
 const r=assessLocalCapacityV79(good());assert.equal(r.operationalV67Passed,0);
 assert.equal(r.operationalV67Pending,32);
});
