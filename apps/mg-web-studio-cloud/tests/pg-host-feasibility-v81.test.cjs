'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assessPgHostFeasibilityV81,createRecordedWindowsSnapshotV81,LIMITS}
  =require('../server/pg-host-feasibility-v81.cjs');
const G=1024;
const healthy=()=>({
 source:'READ_ONLY_WINDOWS_PROBE',platform:'win32',cpuCount:8,
 totalRamMiB:8192,availableRamMiB:3072,
 systemFreeMiB:30*G,targetFreeMiB:30*G,sameVolume:true,
 targetBusType:'NVMe',targetFilesystem:'NTFS',
 protectedContainer:{name:'supabase_db_bazar_online_4r_local_only',
   state:'running',health:'healthy'}
});
const rejected=(change,code)=>{
 const o=healthy();change(o);const r=assessPgHostFeasibilityV81(o);
 assert.equal(r.resourceCandidate,false);
 assert.ok(r.issueCodes.includes(code),JSON.stringify(r.issueCodes));
 assert.equal(r.decision,'NO_GO');
};
test('healthy synthetic host can be a resource candidate but remains NO_GO',()=>{
 const r=assessPgHostFeasibilityV81(healthy());
 assert.equal(r.resourceCandidate,true);assert.equal(r.observationShapeValid,true);
 assert.equal(r.productionAuthorized,false);assert.equal(r.hostReadinessApproved,false);
 assert.equal(r.postgresInstalled,false);assert.equal(r.decision,'NO_GO');
});
test('recorded user RAM and C space lead to conservative blocker',()=>{
 const r=assessPgHostFeasibilityV81(createRecordedWindowsSnapshotV81());
 for(const c of ['FREE_RAM_INSUFFICIENT','TARGET_NOT_CONFIRMED_INTERNAL',
   'SYSTEM_RESERVE_INSUFFICIENT']) assert.ok(r.issueCodes.includes(c));
 assert.equal(r.resourceCandidate,false);assert.equal(r.actualHostIndependentlyVerified,false);
});
test('same-volume reserve combines 8 GiB Windows and 12 GiB lab',()=>{
 assert.equal(LIMITS.minSystemReserveMiB,8192);
 assert.equal(LIMITS.minLabWorkspaceMiB,12288);
 assert.equal(assessPgHostFeasibilityV81(healthy()).sameDiskCombinedReserveMiB,20480);
});
test('same-volume 16.8 GiB cannot count the free space twice',()=>{
 rejected(x=>{x.systemFreeMiB=17203;x.targetFreeMiB=17203;},'SYSTEM_RESERVE_INSUFFICIENT');
});
test('different volumes use separate headroom checks',()=>{
 const x=healthy();x.sameVolume=false;x.systemFreeMiB=10*G;x.targetFreeMiB=13*G;
 const r=assessPgHostFeasibilityV81(x);assert.equal(r.resourceCandidate,true);
});
test('same physical device on different volumes need not share a counter',()=>{
 const x=healthy();x.sameVolume=false;x.targetFreeMiB=13*G;
 assert.equal(assessPgHostFeasibilityV81(x).observationShapeValid,true);
});
test('mismatched measurements for same filesystem volume are denied',()=>{
 const x=healthy();x.targetFreeMiB-=G;
 assert.deepEqual(assessPgHostFeasibilityV81(x).issueCodes,['OBSERVATION_MALFORMED']);
});
test('USB SD volume is never a candidate despite ample space',()=>{
 rejected(x=>x.targetBusType='USB','TARGET_NOT_CONFIRMED_INTERNAL');
});
test('unknown or virtual disk is not presumed internal',()=>{
 for(const type of ['UNKNOWN','VIRTUAL','SD','MMC','iSCSI','']){
  rejected(x=>x.targetBusType=type,'TARGET_NOT_CONFIRMED_INTERNAL');
 }
});
test('SATA RAID SAS and NVMe are candidate buses, subject to independent review',()=>{
 for(const type of ['SATA','RAID','SAS','NVMe']){
  const x=healthy();x.targetBusType=type;
  assert.equal(assessPgHostFeasibilityV81(x).resourceCandidate,true);
 }
});
test('exFAT and FAT32 cannot host the proposed NTFS volume',()=>{
 for(const fs of ['exFAT','FAT32','ReFS','Unknown']){
  rejected(x=>x.targetFilesystem=fs,'TARGET_NOT_NTFS');
 }
});
test('low free RAM is different from total physical RAM',()=>{
 rejected(x=>x.availableRamMiB=799,'FREE_RAM_INSUFFICIENT');
});
test('exact 2 GiB available RAM is candidate, not authorization',()=>{
 const x=healthy();x.availableRamMiB=2048;
 const r=assessPgHostFeasibilityV81(x);assert.equal(r.resourceCandidate,true);
 assert.equal(r.decision,'NO_GO');
});
test('total RAM under 6 GiB fails without attempting connection',()=>{
 rejected(x=>{x.totalRamMiB=5000;x.availableRamMiB=3000;},'TOTAL_RAM_INSUFFICIENT');
});
test('CPU below two blocked',()=>{
 rejected(x=>x.cpuCount=1,'CPU_INSUFFICIENT');
});
test('system reserve below 8 GiB denied on distinct volume',()=>{
 rejected(x=>{x.sameVolume=false;x.systemFreeMiB=7*G;},'SYSTEM_RESERVE_INSUFFICIENT');
});
test('lab target below 12 GiB denied',()=>{
 rejected(x=>{x.sameVolume=false;x.targetFreeMiB=11*G;},'TARGET_SPACE_INSUFFICIENT');
});
test('BAZAR must report healthy without assuming safety if missing',()=>{
 for(const [state,health] of [['unknown','unknown'],['running','unhealthy'],['stopped','healthy']]){
  rejected(x=>{x.protectedContainer.state=state;x.protectedContainer.health=health;},
   'BAZAR_HEALTH_NOT_CONFIRMED');
 }
});
test('a different DB cannot stand in for the protected BAZAR database',()=>{
 rejected(x=>x.protectedContainer.name='other','BAZAR_HEALTH_NOT_CONFIRMED');
});
test('forged URL username host path and extra fields fail closed without echo',()=>{
 const x=healthy();x.password='PRIVATE_DATABASE_URL';
 const r=assessPgHostFeasibilityV81(x);
 assert.deepEqual(r.issueCodes,['OBSERVATION_MALFORMED']);
 assert.ok(!JSON.stringify(r).includes('PRIVATE_DATABASE_URL'));
});
test('bad payloads cannot trick evaluator into GO',()=>{
 for(const x of [null,undefined,{},[],3,'secret',Object.create(healthy())]){
  const r=assessPgHostFeasibilityV81(x);
  assert.equal(r.resourceCandidate,false);assert.equal(r.decision,'NO_GO');
 }
});
test('unsafe negative, fractional, NaN and string measurements fail closed',()=>{
 for(const v of [-1,Infinity,NaN,1.5,'8192',Number.MAX_SAFE_INTEGER]){
  const x=healthy();x.totalRamMiB=v;
  assert.equal(assessPgHostFeasibilityV81(x).observationShapeValid,false);
 }
});
test('RAM available above total means measurements are inconsistent',()=>{
 const x=healthy();x.availableRamMiB=x.totalRamMiB+1;
 assert.equal(assessPgHostFeasibilityV81(x).observationShapeValid,false);
});
test('flags always refuse deployment and preserve 32 V67 checks',()=>{
 const r=assessPgHostFeasibilityV81(healthy());
 assert.equal(r.v67OperationalPassed,0);assert.equal(r.v67OperationalPending,32);
 assert.equal(r.networkAuthorized,false);assert.equal(r.sqlAuthorized,false);
 assert.equal(r.storageProvisioned,false);assert.equal(r.protectedContainerModified,false);
});
test('plan and findings are frozen',()=>{
 const r=assessPgHostFeasibilityV81(healthy());
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.issueCodes)&&Object.isFrozen(r.planningLimits));
 assert.throws(()=>{r.decision='GO'},TypeError);
});
