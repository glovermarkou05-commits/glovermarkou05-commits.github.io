'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createIsolatedLabBlueprintV80,reviewIsolatedLabBlueprintV80}
  =require('../server/pg-lab-isolation-v80.cjs');
const make=()=>structuredClone(createIsolatedLabBlueprintV80());
function bad(patch,code){
 const blueprint=make();patch(blueprint);
 const r=reviewIsolatedLabBlueprintV80(blueprint);
 assert.equal(r.syntheticBlueprintAccepted,false);
 assert.ok(r.issueCodes.includes(code),JSON.stringify(r.issueCodes));
 assert.equal(r.decision,'NO_GO');
}
test('unaltered synthetic blueprint is acceptable as plan, never executable',()=>{
 const r=reviewIsolatedLabBlueprintV80(make());
 assert.equal(r.syntheticBlueprintAccepted,true);
 assert.deepEqual(r.issueCodes,[]);
 for(const k of ['realHostValidated','realContainerNameChecked','hostPortChecked',
 'dockerLimitsEnforced','databaseStarted','volumeCreated','networkOpened',
 'credentialsIssued','bazarModified','operationsAuthorized','productionAuthorized']){
  assert.equal(r[k],false,k);
 }
 assert.equal(r.decision,'NO_GO');
});
test('project and container names are distinct from the protected BAZAR service',()=>{
 const b=make();assert.notEqual(b.containerName,b.protectedContainer);
 assert.equal(b.protectedContainer,'supabase_db_bazar_online_4r_local_only');
 assert.match(b.containerName,/mg_web_studio/);
 assert.match(b.projectName,/mg_web_studio/);
});
test('524288 KB planning cap is 512 MiB, not verified by Docker',()=>{
 const b=make();assert.equal(b.maxContainerMemoryMiB,512);
 assert.equal(b.maxContainerCpus,1);
 const r=reviewIsolatedLabBlueprintV80(b);
 assert.equal(r.dockerLimitsEnforced,false);
});
test('Postgres 17 settings are suggestions not tested runtime parameters',()=>{
 const b=make();assert.equal(b.postgresMajor,17);
 assert.equal(b.dbSharedBuffersMiB,64);
 assert.equal(b.dbWorkMemMiB,2);
 assert.equal(b.dbMaxConnections,12);
});
test('host bind must be loopback in inert blueprint',()=>{
 bad(x=>x.hostBind='0.0.0.0','ISOLATION_SETTINGS_CHANGED');
 bad(x=>x.hostBind='192.168.1.20','ISOLATION_SETTINGS_CHANGED');
});
test('suggested port must not be changed without manual conflict check',()=>{
 const b=make();assert.equal(b.suggestedHostPort,25480);
 bad(x=>x.suggestedHostPort=5432,'ISOLATION_SETTINGS_CHANGED');
 bad(x=>x.suggestedHostPort=54322,'ISOLATION_SETTINGS_CHANGED');
});
test('Bazar container name cannot become lab name',()=>{
 bad(x=>x.containerName=x.protectedContainer,'ISOLATION_SETTINGS_CHANGED');
});
test('Bazar protection reference is mandatory',()=>{
 bad(x=>x.protectedContainer='none','ISOLATION_SETTINGS_CHANGED');
});
test('memory, cpu, and SQL tuning cannot be escalated silently',()=>{
 bad(x=>x.maxContainerMemoryMiB=4096,'ISOLATION_SETTINGS_CHANGED');
 bad(x=>x.maxContainerCpus=4,'ISOLATION_SETTINGS_CHANGED');
 bad(x=>x.dbMaxConnections=200,'ISOLATION_SETTINGS_CHANGED');
 bad(x=>x.dbWorkMemMiB=32,'ISOLATION_SETTINGS_CHANGED');
});
test('image must not be selected or downloaded automatically',()=>{
 bad(x=>x.image='postgres:17','ISOLATION_SETTINGS_CHANGED');
});
test('no credential can be inserted in the plan',()=>{
 bad(x=>x.credentials='DATABASE_URL_SECRET','ISOLATION_SETTINGS_CHANGED');
 const r=JSON.stringify(reviewIsolatedLabBlueprintV80({...make(),credentials:'DATABASE_URL_SECRET'}));
 assert.ok(!r.includes('DATABASE_URL_SECRET'));
});
test('network is unconfigured, no port opened, no exposure authorised',()=>{
 bad(x=>x.network='LOCAL_ACTIVE','ISOLATION_SETTINGS_CHANGED');
 assert.equal(reviewIsolatedLabBlueprintV80(make()).networkOpened,false);
});
test('storage volume name is an uncreated placeholder',()=>{
 const b=make();assert.match(b.storage.volumeName,/UNCREATED$/);
 assert.equal(b.storage.location,'UNASSIGNED_INTERNAL_DISK');
 assert.equal(b.storage.media,'UNVERIFIED');
});
test('removable USB storage cannot be inserted as target',()=>{
 bad(x=>x.storage.media='USB_SD','VOLUME_OR_OPERATION_UNSAFE');
 bad(x=>x.storage.location='E:','VOLUME_OR_OPERATION_UNSAFE');
});
test('BAZAR mounts are always forbidden',()=>{
 bad(x=>x.storage.bazarMountsAllowed=true,'VOLUME_OR_OPERATION_UNSAFE');
});
test('existing project mounts are forbidden without separate audit',()=>{
 bad(x=>x.storage.projectMountsAllowed=true,'VOLUME_OR_OPERATION_UNSAFE');
});
test('delete, update, stop, restart BAZAR never allowed',()=>{
 for(const k of ['bazarStop','bazarRestart','bazarRemove']){
  bad(x=>x.operations[k]='PERMITTED','VOLUME_OR_OPERATION_UNSAFE');
 }
});
test('new PG lab operations are forbidden at this stage',()=>{
 for(const k of ['launch','imagePull','volumeCreate','sqlExecution','productionDeploy']){
  bad(x=>x.operations[k]='ALLOWED','VOLUME_OR_OPERATION_UNSAFE');
 }
});
test('no hidden arbitrary Docker commands or mounts permitted',()=>{
 bad(x=>x.operations.shell='docker rm -f','VOLUME_OR_OPERATION_UNSAFE');
 bad(x=>x.storage.externalMount='C:\\SECRET','VOLUME_OR_OPERATION_UNSAFE');
});
test('six V78 approvals must remain PENDING',()=>{
 const b=make();
 assert.equal(Object.keys(b.authorization.approvals).length,6);
 assert.ok(Object.values(b.authorization.approvals).every(x=>x==='PENDING'));
 bad(x=>x.authorization.approvals.database='APPROVED','APPROVAL_MANIFEST_UNSAFE');
 bad(x=>x.authorization.approvals.network='APPROVED','APPROVAL_MANIFEST_UNSAFE');
});
test('changing the V78 permission or recovery plan is rejected',()=>{
 bad(x=>x.authorization.recovery.restorePerformed=true,'APPROVAL_MANIFEST_UNSAFE');
 bad(x=>x.authorization.isolation.productionAccess=true,'APPROVAL_MANIFEST_UNSAFE');
});
test('all descriptive objects are frozen',()=>{
 const b=createIsolatedLabBlueprintV80(),r=reviewIsolatedLabBlueprintV80(b);
 assert.ok(Object.isFrozen(b)&&Object.isFrozen(b.storage)&&Object.isFrozen(b.operations));
 assert.ok(Object.isFrozen(b.authorization)&&Object.isFrozen(r)&&Object.isFrozen(r.issueCodes));
 assert.throws(()=>{r.decision='GO'},TypeError);
});
test('unknown, incomplete, null or inherited objects must fail closed',()=>{
 for(const b of [null,{},[],3,Object.create(make()),{...make(),storage:null}]){
  const r=reviewIsolatedLabBlueprintV80(b);
  assert.equal(r.syntheticBlueprintAccepted,false);assert.equal(r.decision,'NO_GO');
 }
});
test('safe blueprint cannot mutate or access an actual Docker service',()=>{
 const b=make(),r=reviewIsolatedLabBlueprintV80(b);
 for(const k of ['connect','start','stop','remove','query','restore','exec','deploy']){
  assert.equal(k in b,false);assert.equal(k in r,false);
 }
 assert.equal(r.bazarModified,false);
});
test('V67 32 checks remain pending and Bazar healthy status is not asserted',()=>{
 const r=reviewIsolatedLabBlueprintV80(make());
 assert.equal(r.v67OperationalPassed,0);assert.equal(r.v67OperationalPending,32);
 assert.equal(r.realHostValidated,false);
});
