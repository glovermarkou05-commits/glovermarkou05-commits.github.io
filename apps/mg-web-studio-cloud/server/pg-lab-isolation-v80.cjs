'use strict';

// V80 descriptive blueprint, deliberately NOT a Docker Compose file or command.
// Fixed identifiers are RESERVED IDEAS, not a proof of name/port availability.
// V78 approvals remain all PENDING and no PG image/volume/port is provisioned.
const {createPgLabAuthorizationRequestV78,reviewPgLabAuthorizationRequestV78}=
  require('./pg-lab-authorization-v78.cjs');
const KEYS=Object.freeze(['source','projectName','containerName','protectedContainer',
  'postgresMajor','maxContainerMemoryMiB','maxContainerCpus','dbSharedBuffersMiB',
  'dbWorkMemMiB','dbMaxConnections','hostBind','suggestedHostPort',
  'storage','credentials','image','network','operations','authorization']);
const STORAGE_KEYS=Object.freeze(['volumeName','location','media',
  'bazarMountsAllowed','projectMountsAllowed']);
const OPERATIONS=Object.freeze(['launch','imagePull','volumeCreate','sqlExecution',
  'bazarStop','bazarRestart','bazarRemove','productionDeploy']);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(x));
const same=(a,b)=>plain(a)&&Object.keys(a).length===Object.keys(b).length&&
  Object.keys(b).every(k=>Object.hasOwn(a,k)&&a[k]===b[k]);
const noGo=Object.freeze({syntheticBlueprintAccepted:false,realHostValidated:false,
  realContainerNameChecked:false,hostPortChecked:false,dockerLimitsEnforced:false,
  databaseStarted:false,volumeCreated:false,networkOpened:false,credentialsIssued:false,
  bazarModified:false,operationsAuthorized:false,v67OperationalPassed:0,
  v67OperationalPending:32,productionAuthorized:false,decision:'NO_GO'});
function createIsolatedLabBlueprintV80(){
  return Object.freeze({
    source:'SYNTHETIC_ISOLATION_BLUEPRINT',
    projectName:'mg_web_studio_cloud_lab_v80',
    containerName:'mg_web_studio_pg17_lab_v80',
    protectedContainer:'supabase_db_bazar_online_4r_local_only',
    postgresMajor:17,
    // Planning ceilings only; do not assert this fits PostgreSQL/WSL in practice.
    maxContainerMemoryMiB:512,maxContainerCpus:1,
    dbSharedBuffersMiB:64,dbWorkMemMiB:2,dbMaxConnections:12,
    hostBind:'127.0.0.1',suggestedHostPort:25480,
    storage:Object.freeze({
      volumeName:'mg_web_studio_lab_pgdata_v80_UNCREATED',
      location:'UNASSIGNED_INTERNAL_DISK',media:'UNVERIFIED',
      bazarMountsAllowed:false,projectMountsAllowed:false}),
    credentials:'NOT_ISSUED',image:'NOT_SELECTED_OR_PULLED',network:'NOT_CONFIGURED',
    operations:Object.freeze(Object.fromEntries(OPERATIONS.map(key=>[key,'FORBIDDEN']))),
    authorization:createPgLabAuthorizationRequestV78()
  });
}
function reviewIsolatedLabBlueprintV80(input){
  const expected=createIsolatedLabBlueprintV80();
  const issues=[];
  if(!plain(input)||Object.keys(input).length!==KEYS.length||
     KEYS.some(k=>!Object.hasOwn(input,k)))issues.push('INVALID_BLUEPRINT');
  else {
    for(const k of KEYS.filter(k=>!['storage','operations','authorization'].includes(k))){
      if(input[k]!==expected[k]){issues.push('ISOLATION_SETTINGS_CHANGED');break;}
    }
    if(!same(input.storage,expected.storage)||!same(input.operations,expected.operations))
      issues.push('VOLUME_OR_OPERATION_UNSAFE');
    const approval=reviewPgLabAuthorizationRequestV78(input.authorization);
    if(!approval.syntheticPlanningShapeValid)issues.push('APPROVAL_MANIFEST_UNSAFE');
  }
  const codes=Object.freeze([...new Set(issues)].sort());
  return Object.freeze({...noGo,syntheticBlueprintAccepted:codes.length===0,issueCodes:codes});
}
module.exports={createIsolatedLabBlueprintV80,reviewIsolatedLabBlueprintV80};
