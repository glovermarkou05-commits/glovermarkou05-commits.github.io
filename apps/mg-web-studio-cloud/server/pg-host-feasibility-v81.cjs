'use strict';

// V81: assessment of strictly shaped, caller-supplied LOCAL READ-ONLY observations.
// This has no direct I/O, cannot install PostgreSQL or change existing Docker state.
// Even an apparently healthy host cannot authorize lab creation/production.
const MiB = 1024*1024;
const LIMITS = Object.freeze({
  minAvailableRamMiB:2048,minTotalRamMiB:6144,minCpuCount:2,
  minSystemReserveMiB:8192,minLabWorkspaceMiB:12288
});
const KEYS=Object.freeze(['source','platform','cpuCount','totalRamMiB','availableRamMiB',
  'systemFreeMiB','targetFreeMiB','samePhysicalDisk','targetBusType',
  'targetFilesystem','protectedContainer']);
const CONTAINER_KEYS=Object.freeze(['name','state','health']);
const NAME='supabase_db_bazar_online_4r_local_only';
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(o));
const exact=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length&&
  keys.every(k=>Object.hasOwn(o,k));
const pos=x=>Number.isSafeInteger(x)&&x>=0&&x<=10485760;
const FLAGS=Object.freeze({actualHostIndependentlyVerified:false,
  hostReadinessApproved:false,postgresInstalled:false,dockerChanged:false,
  protectedContainerModified:false,networkAuthorized:false,sqlAuthorized:false,
  storageProvisioned:false,v67OperationalPassed:0,v67OperationalPending:32,
  productionAuthorized:false,decision:'NO_GO'});
function assessPgHostFeasibilityV81(snapshot) {
  const codes=[];
  if(!exact(snapshot,KEYS)||snapshot.source!=='READ_ONLY_WINDOWS_PROBE'||
    snapshot.platform!=='win32'||!pos(snapshot.cpuCount)||snapshot.cpuCount>1024||
    !['totalRamMiB','availableRamMiB','systemFreeMiB','targetFreeMiB'].every(k=>pos(snapshot[k]))||
    snapshot.totalRamMiB<1||snapshot.availableRamMiB>snapshot.totalRamMiB||
    typeof snapshot.samePhysicalDisk!=='boolean'||
    (snapshot.samePhysicalDisk&&snapshot.systemFreeMiB!==snapshot.targetFreeMiB)||
    typeof snapshot.targetBusType!=='string'||snapshot.targetBusType.length>20||
    typeof snapshot.targetFilesystem!=='string'||snapshot.targetFilesystem.length>20||
    !exact(snapshot.protectedContainer,CONTAINER_KEYS)) {
    codes.push('OBSERVATION_MALFORMED');
  } else {
    if(snapshot.availableRamMiB<LIMITS.minAvailableRamMiB) codes.push('FREE_RAM_INSUFFICIENT');
    if(snapshot.totalRamMiB<LIMITS.minTotalRamMiB) codes.push('TOTAL_RAM_INSUFFICIENT');
    if(snapshot.cpuCount<LIMITS.minCpuCount) codes.push('CPU_INSUFFICIENT');
    if(snapshot.targetBusType.toUpperCase()==='USB'||
       !['SATA','NVME','RAID','SAS'].includes(snapshot.targetBusType.toUpperCase()))
      codes.push('TARGET_NOT_CONFIRMED_INTERNAL');
    if(snapshot.targetFilesystem.toUpperCase()!=='NTFS') codes.push('TARGET_NOT_NTFS');
    if(snapshot.targetFreeMiB<LIMITS.minLabWorkspaceMiB)
      codes.push('TARGET_SPACE_INSUFFICIENT');
    // If the target and Windows share one physical disk, subtract BOTH reserves
    // from the SAME free-space counter. A previous V80 minimum did not do this.
    const reserve=LIMITS.minSystemReserveMiB+
      (snapshot.samePhysicalDisk?LIMITS.minLabWorkspaceMiB:0);
    if(snapshot.systemFreeMiB<reserve) codes.push('SYSTEM_RESERVE_INSUFFICIENT');
    const p=snapshot.protectedContainer;
    if(p.name!==NAME||p.state!=='running'||p.health!=='healthy')
      codes.push('BAZAR_HEALTH_NOT_CONFIRMED');
  }
  const issues=Object.freeze([...new Set(codes)].sort());
  return Object.freeze({
    observationShapeValid:!issues.includes('OBSERVATION_MALFORMED'),
    resourceCandidate:issues.length===0,
    issueCodes:issues,planningLimits:LIMITS,
    sameDiskCombinedReserveMiB:LIMITS.minSystemReserveMiB+LIMITS.minLabWorkspaceMiB,
    ...FLAGS
  });
}
function createRecordedWindowsSnapshotV81() {
  // Previously user-reported observations, NOT a current live measurement.
  // C: internal BusType is deliberately UNKNOWN until verified.
  return Object.freeze({
    source:'READ_ONLY_WINDOWS_PROBE',platform:'win32',
    cpuCount:8,totalRamMiB:7864,availableRamMiB:799,
    systemFreeMiB:17203,targetFreeMiB:17203,samePhysicalDisk:true,
    targetBusType:'UNKNOWN',targetFilesystem:'NTFS',
    protectedContainer:Object.freeze({name:NAME,state:'running',health:'healthy'})
  });
}
module.exports={assessPgHostFeasibilityV81,createRecordedWindowsSnapshotV81,LIMITS};
