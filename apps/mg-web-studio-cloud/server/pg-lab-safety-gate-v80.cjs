'use strict';

// V80 offline/synthetic planning gate ONLY. It cannot launch PostgreSQL,
// inspect Docker or prove host readiness. A passing resource threshold never
// constitutes permission to start a container or modify any real database.
const {assessLocalCapacityV79}=require('./lab-capacity-v79.cjs');
const GiB=1024**3;
const REQUIREMENTS=Object.freeze({minAvailableMemoryGiB:2,
  minTotalMemoryGiB:6,minSystemDiskGiB:8,minWorkspaceDiskGiB:12,
  minAvailableCpus:2});
const TOP=Object.freeze(['origin','capacity','storage','runningProject','approvalState']);
const STORAGE=Object.freeze(['media','filesystem','mountVerified','workspaceDefined']);
const BAZAR=Object.freeze(['container','state','modificationPermitted']);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(x));
const shape=(x,keys)=>plain(x)&&Object.keys(x).length===keys.length&&
  keys.every(k=>Object.hasOwn(x,k));
const DENIED=Object.freeze({evidenceSource:'SYNTHETIC_CAPACITY_ONLY',
  actualHostVerified:false,actualDiskTypeVerified:false,
  bazarUnaffectedByExecution:true,postgresConnected:false,
  labProvisioned:false,dockerTouched:false,installAuthorized:false,
  credentialsIssued:false,operationalV67Passed:0,operationalV67Pending:32,
  productionAuthorized:false,decision:'NO_GO'});
function reviewLowFootprintCandidateV80(input) {
  const issues=[];
  if(!shape(input,TOP))issues.push('INVALID_PLANNING_INPUT');
  else {
    if(input.origin!=='SYNTHETIC_V80_CAPACITY')issues.push('REAL_EVIDENCE_NOT_SUPPORTED');
    const c=assessLocalCapacityV79(input.capacity);
    if(!c.measurementShapeValid)issues.push('HOST_CAPACITY_INVALID');
    else {
      const m=input.capacity;
      if(m.freeMemoryBytes<REQUIREMENTS.minAvailableMemoryGiB*GiB)
        issues.push('HOST_MEMORY_HEADROOM_LOW');
      if(m.totalMemoryBytes<REQUIREMENTS.minTotalMemoryGiB*GiB)
        issues.push('HOST_TOTAL_RAM_LOW');
      if(m.availableCpus<REQUIREMENTS.minAvailableCpus)
        issues.push('HOST_CPU_LOW');
      if(m.systemDiskFreeBytes<REQUIREMENTS.minSystemDiskGiB*GiB)
        issues.push('HOST_SYSTEM_DISK_LOW');
      if(m.workspaceDiskFreeBytes<REQUIREMENTS.minWorkspaceDiskGiB*GiB)
        issues.push('LAB_WORKSPACE_DISK_LOW');
    }
    const d=input.storage;
    if(!shape(d,STORAGE))issues.push('STORAGE_EVIDENCE_INVALID');
    else {
      if(d.media!=='FIXED_INTERNAL' || d.filesystem!=='NTFS' ||
         d.mountVerified!==false || d.workspaceDefined!==false)
         issues.push('STORAGE_NOT_ACCEPTED_FOR_PLANNING');
    }
    const b=input.runningProject;
    if(!shape(b,BAZAR))issues.push('BAZAR_PROTECTION_UNKNOWN');
    else if(b.container!=='supabase_db_bazar_online_4r_local_only'||
      b.state!=='HEALTHY_PROTECTED'||b.modificationPermitted!==false)
      issues.push('BAZAR_PROTECTION_REQUIRED');
    if(input.approvalState!=='ALL_PENDING')issues.push('APPROVAL_NOT_GRANTED');
  }
  const codes=Object.freeze([...new Set(issues)].sort());
  return Object.freeze({syntheticCandidateMeetsThresholds:codes.length===0,
    issueCodes:codes,...DENIED});
}
function createSyntheticLowFootprintInputV80(){
  return Object.freeze({
    origin:'SYNTHETIC_V80_CAPACITY',
    capacity:Object.freeze({source:'LOCAL_READ_ONLY_MEASUREMENT',platform:'win32',
      availableCpus:8,totalMemoryBytes:8*GiB,freeMemoryBytes:3*GiB,
      systemDiskFreeBytes:20*GiB,workspaceDiskFreeBytes:20*GiB,sameDisk:true}),
    storage:Object.freeze({media:'FIXED_INTERNAL',filesystem:'NTFS',
      mountVerified:false,workspaceDefined:false}),
    runningProject:Object.freeze({container:'supabase_db_bazar_online_4r_local_only',
      state:'HEALTHY_PROTECTED',modificationPermitted:false}),
    approvalState:'ALL_PENDING'
  });
}
module.exports={reviewLowFootprintCandidateV80,createSyntheticLowFootprintInputV80,REQUIREMENTS};
