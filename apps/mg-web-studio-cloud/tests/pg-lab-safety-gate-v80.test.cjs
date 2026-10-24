'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reviewLowFootprintCandidateV80,createSyntheticLowFootprintInputV80,REQUIREMENTS}
  =require('../server/pg-lab-safety-gate-v80.cjs');
const GiB=1024**3;
const make=()=>structuredClone(createSyntheticLowFootprintInputV80());
function reject(change,reason){
 const obj=make();change(obj);
 const r=reviewLowFootprintCandidateV80(obj);
 assert.equal(r.syntheticCandidateMeetsThresholds,false);
 assert.ok(r.issueCodes.includes(reason),JSON.stringify(r.issueCodes));
 assert.equal(r.decision,'NO_GO');
}
test('synthetic generous host can meet thresholds but never launch',()=>{
 const result=reviewLowFootprintCandidateV80(make());
 assert.equal(result.syntheticCandidateMeetsThresholds,true);
 assert.deepEqual(result.issueCodes,[]);
 assert.equal(result.actualHostVerified,false);
 assert.equal(result.labProvisioned,false);
 assert.equal(result.installAuthorized,false);
 assert.equal(result.productionAuthorized,false);
 assert.equal(result.decision,'NO_GO');
});
test('candidate minima require conservative headroom, not PostgreSQL hardware guarantee',()=>{
 assert.deepEqual(REQUIREMENTS,{minAvailableMemoryGiB:2,minTotalMemoryGiB:6,
   minSystemDiskGiB:8,minWorkspaceDiskGiB:12,minAvailableCpus:2});
});
test('actual user-like 0.78 GiB free scenario is blocked',()=>{
 reject(x=>x.capacity.freeMemoryBytes=Math.floor(0.78*GiB),'HOST_MEMORY_HEADROOM_LOW');
});
test('less than 2 GiB free blocks a hypothetical start',()=>{
 reject(x=>x.capacity.freeMemoryBytes=2*GiB-1,'HOST_MEMORY_HEADROOM_LOW');
});
test('exactly 2 GiB available is only a candidate, not permission',()=>{
 const x=make();x.capacity.freeMemoryBytes=2*GiB;
 const r=reviewLowFootprintCandidateV80(x);
 assert.equal(r.syntheticCandidateMeetsThresholds,true);assert.equal(r.decision,'NO_GO');
});
test('less than 6 GiB total RAM blocks',()=>{
 const x=make();x.capacity.totalMemoryBytes=5*GiB;x.capacity.freeMemoryBytes=3*GiB;
 const r=reviewLowFootprintCandidateV80(x);
 assert.ok(r.issueCodes.includes('HOST_TOTAL_RAM_LOW'));
});
test('fewer than 2 available processors block',()=>{
 reject(x=>x.capacity.availableCpus=1,'HOST_CPU_LOW');
});
test('low system disk space blocks even when workspace has plenty',()=>{
 reject(x=>x.capacity.systemDiskFreeBytes=7*GiB,'HOST_SYSTEM_DISK_LOW');
});
test('less than 12 GiB workspace space blocks',()=>{
 reject(x=>x.capacity.workspaceDiskFreeBytes=11*GiB,'LAB_WORKSPACE_DISK_LOW');
});
test('invalid or fabricated CPU/RAM shape fails closed',()=>{
 reject(x=>x.capacity.availableCpus='eight','HOST_CAPACITY_INVALID');
 reject(x=>x.capacity.freeMemoryBytes=-1,'HOST_CAPACITY_INVALID');
 reject(x=>x.capacity.password='secret','HOST_CAPACITY_INVALID');
});
test('removable USB SD target is never accepted as lab DB volume',()=>{
 reject(x=>x.storage.media='USB_REMOVABLE','STORAGE_NOT_ACCEPTED_FOR_PLANNING');
});
test('unverified media type is not silently treated as internal',()=>{
 reject(x=>x.storage.media='UNKNOWN','STORAGE_NOT_ACCEPTED_FOR_PLANNING');
});
test('FAT32, exFAT and other filesystems are not accepted in this Windows blueprint',()=>{
 for(const name of ['exFAT','FAT32','UNKNOWN','ext4'])
  reject(x=>x.storage.filesystem=name,'STORAGE_NOT_ACCEPTED_FOR_PLANNING');
});
test('claiming disk verification is forbidden in synthetic planning',()=>{
 reject(x=>x.storage.mountVerified=true,'STORAGE_NOT_ACCEPTED_FOR_PLANNING');
});
test('preassigning a workspace path is forbidden before host review',()=>{
 reject(x=>x.storage.workspaceDefined=true,'STORAGE_NOT_ACCEPTED_FOR_PLANNING');
});
test('storage cannot contain paths, tokens or extra unspecified fields',()=>{
 reject(x=>x.storage.path='E:\\PRIVATE','STORAGE_EVIDENCE_INVALID');
 reject(x=>delete x.storage.media,'STORAGE_EVIDENCE_INVALID');
});
test('BAZAR-ONLINE protected running container is mandatory',()=>{
 reject(x=>x.runningProject.state='STOPPED','BAZAR_PROTECTION_REQUIRED');
 reject(x=>x.runningProject.state='UNKNOWN','BAZAR_PROTECTION_REQUIRED');
});
test('other containers do not replace the protected project',()=>{
 reject(x=>x.runningProject.container='postgres','BAZAR_PROTECTION_REQUIRED');
});
test('operations that modify BAZAR are always denied',()=>{
 reject(x=>x.runningProject.modificationPermitted=true,'BAZAR_PROTECTION_REQUIRED');
});
test('never accept extra BAZAR stop or restart flags',()=>{
 reject(x=>x.runningProject.stop=true,'BAZAR_PROTECTION_UNKNOWN');
});
test('approval must remain pending even if host has resources',()=>{
 reject(x=>x.approvalState='APPROVED','APPROVAL_NOT_GRANTED');
});
test('claiming real catalog measurements is not synthetic evidence',()=>{
 reject(x=>x.origin='REAL_HOST_APPROVED','REAL_EVIDENCE_NOT_SUPPORTED');
});
test('malformed, null, array, inherited root or missing fields rejected',()=>{
 for(const x of [undefined,null,{},[],Object.create(make()),{...make(),storage:undefined}]){
  const r=reviewLowFootprintCandidateV80(x);
  assert.equal(r.syntheticCandidateMeetsThresholds,false);
  assert.equal(r.decision,'NO_GO');
 }
});
test('only fixed issue codes reported, never copy secret input',()=>{
 const x=make();x.connection='postgresql://SECRET';
 const r=JSON.stringify(reviewLowFootprintCandidateV80(x));
 assert.ok(!r.includes('SECRET'));assert.match(r,/INVALID_PLANNING_INPUT/);
});
test('results and shared snapshots are immutable',()=>{
 const r=reviewLowFootprintCandidateV80(make()),s=createSyntheticLowFootprintInputV80();
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.issueCodes));
 assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.storage));
 assert.throws(()=>{r.decision='GO'},TypeError);
});
test('V67 remains 32 pending even for eligible synthetic host',()=>{
 const r=reviewLowFootprintCandidateV80(make());
 assert.equal(r.operationalV67Passed,0);assert.equal(r.operationalV67Pending,32);
 assert.equal(r.dockerTouched,false);assert.equal(r.postgresConnected,false);
});
