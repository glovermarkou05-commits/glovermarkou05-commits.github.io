'use strict';

// V79: local READ-ONLY resource inventory. Never creates a database or network
// socket, writes files, installs anything, or grants an approval. A GitHub runner
// reports its OWN resources, not those of a user's Windows computer.
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const GiB = 1024 ** 3;
const MIN = Object.freeze({workspaceFreeGiB:10,systemFreeGiB:4,availableMemoryGiB:4,
  totalMemoryGiB:4,availableCpus:2});
const KEYS=Object.freeze(['source','platform','availableCpus','totalMemoryBytes',
  'freeMemoryBytes','systemDiskFreeBytes','workspaceDiskFreeBytes','sameDisk']);
const plain = v => v!==null && typeof v==='object'&&!Array.isArray(v)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v));
const positive = v => Number.isSafeInteger(v)&&v>=0;
const gb = bytes => Math.round(bytes / GiB * 100)/100;
const CAPABILITY = Object.freeze({databaseConnectionAuthorized:false,networkAuthorized:false,
  installAuthorized:false,restoreAuthorized:false,productionAuthorized:false,
  actualLabProvisioned:false,operatorConfirmed:false,operationalV67Passed:0,
  operationalV67Pending:32,decision:'NO_GO'});
function assessLocalCapacityV79(snapshot) {
  const valid = plain(snapshot) && Object.keys(snapshot).length===KEYS.length &&
    KEYS.every(k=>Object.hasOwn(snapshot,k)) &&
    snapshot.source==='LOCAL_READ_ONLY_MEASUREMENT' &&
    ['win32','linux','darwin'].includes(snapshot.platform) &&
    Number.isSafeInteger(snapshot.availableCpus) && snapshot.availableCpus>0 &&
    snapshot.availableCpus<=1024 &&
    ['totalMemoryBytes','freeMemoryBytes','systemDiskFreeBytes','workspaceDiskFreeBytes']
      .every(k=>positive(snapshot[k])) && snapshot.totalMemoryBytes>0 &&
    snapshot.freeMemoryBytes<=snapshot.totalMemoryBytes &&
    typeof snapshot.sameDisk==='boolean' &&
    (!snapshot.sameDisk || snapshot.systemDiskFreeBytes===snapshot.workspaceDiskFreeBytes);
  if(!valid) return Object.freeze({measurementShapeValid:false,
    metrics:null,resourceThresholdsMet:false,
    issueCodes:Object.freeze(['INVALID_LOCAL_MEASUREMENT']),...CAPABILITY});
  const metrics=Object.freeze({platform:snapshot.platform,
    availableCpus:snapshot.availableCpus,
    totalMemoryGiB:gb(snapshot.totalMemoryBytes),
    availableMemoryGiB:gb(snapshot.freeMemoryBytes),
    systemFreeGiB:gb(snapshot.systemDiskFreeBytes),
    workspaceFreeGiB:gb(snapshot.workspaceDiskFreeBytes),sameDisk:snapshot.sameDisk});
  const codes=[];
  if(snapshot.availableCpus<MIN.availableCpus)codes.push('CPU_BELOW_MINIMUM');
  if(snapshot.totalMemoryBytes<MIN.totalMemoryGiB*GiB)codes.push('TOTAL_MEMORY_BELOW_MINIMUM');
  if(snapshot.freeMemoryBytes<MIN.availableMemoryGiB*GiB)codes.push('AVAILABLE_MEMORY_BELOW_MINIMUM');
  if(snapshot.systemDiskFreeBytes<MIN.systemFreeGiB*GiB)codes.push('SYSTEM_DISK_BELOW_MINIMUM');
  if(snapshot.workspaceDiskFreeBytes<MIN.workspaceFreeGiB*GiB)codes.push('WORKSPACE_DISK_BELOW_MINIMUM');
  return Object.freeze({measurementShapeValid:true,metrics,
    resourceThresholdsMet:codes.length===0,
    issueCodes:Object.freeze(codes),...CAPABILITY});
}
function freeBytes(fsApi,root) {
  // Reading FS statistics does NOT enumerate user files or transmit any data.
  const info=fsApi.statfsSync(root,{bigint:true});
  const available=BigInt(info.bavail)*BigInt(info.bsize);
  if(available<0n || available>BigInt(Number.MAX_SAFE_INTEGER))throw Error('invalid space');
  return Number(available);
}
function collectLocalCapacityV79({osApi=os,fsApi=fs,pathApi=path,
  env=process.env,cwd=process.cwd()}={}) {
  try {
    const platform=osApi.platform();
    if(!['win32','linux','darwin'].includes(platform))throw Error('unsupported platform');
    const systemDrive=platform==='win32'?env.SystemDrive:null;
    if(platform==='win32' &&
       (typeof systemDrive!=='string'||!/^[A-Za-z]:$/.test(systemDrive)))
      throw Error('unknown system drive');
    const systemRoot=platform==='win32'?systemDrive.toUpperCase()+'\\':'/';
    const workspaceRoot=platform==='win32'?pathApi.win32.parse(cwd).root:pathApi.parse(cwd).root;
    if(platform==='win32' && !/^[A-Za-z]:\\$/.test(workspaceRoot))
      throw Error('workspace not local drive');
    const sameDisk=systemRoot.toLowerCase()===workspaceRoot.toLowerCase();
    const systemDiskFreeBytes=freeBytes(fsApi,systemRoot);
    const workspaceDiskFreeBytes=sameDisk?systemDiskFreeBytes:freeBytes(fsApi,workspaceRoot);
    return assessLocalCapacityV79({source:'LOCAL_READ_ONLY_MEASUREMENT',platform,
      availableCpus:osApi.availableParallelism(),totalMemoryBytes:osApi.totalmem(),
      freeMemoryBytes:osApi.freemem(),systemDiskFreeBytes,workspaceDiskFreeBytes,sameDisk});
  }catch{
    return Object.freeze({measurementShapeValid:false,metrics:null,
      resourceThresholdsMet:false,
      issueCodes:Object.freeze(['MEASUREMENT_UNAVAILABLE']),...CAPABILITY});
  }
}
module.exports={assessLocalCapacityV79,collectLocalCapacityV79,MIN};
