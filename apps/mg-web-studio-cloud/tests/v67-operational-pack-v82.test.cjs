'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createV67Checklist}=require('../server/security-acceptance-v67.cjs');
const {createOperationalPacketV82,auditOperationalPacketV82}=
  require('../server/v67-operational-pack-v82.cjs');
const p=()=>structuredClone(createOperationalPacketV82());
test('V82 preserves exact V67 32 canonical IDs in original order',()=>{
 const old=createV67Checklist().tests;
 const next=p().tests;
 assert.equal(next.length,32);
 assert.deepEqual(next.map(t=>t.id),old.map(t=>t.id));
 assert.deepEqual(next.map(t=>t.evidenceType),old.map(t=>t.evidenceType));
});
test('descriptions and expected outcomes are sourced from the original catalog',()=>{
 const old=createV67Checklist().tests,items=p().tests;
 for(let i=0;i<items.length;i++){
  assert.equal(items[i].description,old[i].description);
  assert.equal(items[i].expected,old[i].expected);
  assert.equal(items[i].group,old[i].group);
 }
});
test('phases partition all 32 tests exactly once',()=>{
 const packet=p(),ids=packet.phases.flatMap(x=>x.ids);
 assert.deepEqual(packet.phases.map(x=>x.ids.length),[2,4,14,3,3,2,4]);
 assert.equal(ids.length,32);
 assert.equal(new Set(ids).size,32);
 assert.deepEqual(new Set(ids),new Set(packet.tests.map(x=>x.id)));
});
test('operator prompts are individually distinct and non-empty',()=>{
 const packet=p();
 assert.equal(new Set(packet.tests.map(x=>x.operatorInstruction)).size,32);
 for(const c of packet.tests){
  assert.ok(c.operatorInstruction.length>=30,c.id);
  assert.ok(c.evidenceToCollect.length>=25,c.id);
  assert.ok(c.expected.length>=12,c.id);
  assert.equal(c.execution,'MANUAL_ONLY_AFTER_AUTHORIZATION');
 }
});
test('initial operational status stays 32 PENDING and no fake evidence or reviewer',()=>{
 const packet=p();
 assert.equal(packet.totalTests,32);
 assert.equal(packet.pendingTests,32);
 assert.equal(packet.passedOperationalTests,0);
 assert.ok(packet.tests.every(x=>x.status==='PENDING'&&x.evidenceRef===null&&x.reviewer===null));
});
test('all six V78 permission dimensions remain ungranted',()=>{
 const a=p().approvals;
 assert.deepEqual(a,{database:'PENDING',network:'PENDING',sqlRead:'PENDING',
   tenantFixtures:'PENDING',restore:'PENDING',production:'PENDING'});
});
test('each test declares exactly one review/approval dependency',()=>{
 const names=Object.keys(p().approvals);
 for(const c of p().tests){
  assert.ok([...names,'review'].includes(c.requiredSeparateApproval),c.id);
 }
});
test('production approval never implied by OPS-02 planning entry',()=>{
 const packet=p();
 assert.equal(packet.tests.find(t=>t.id==='OPS-02').requiredSeparateApproval,'production');
 assert.equal(packet.approvals.production,'PENDING');
 assert.equal(packet.productionModified,false);
 assert.equal(packet.decision,'NO_GO');
});
test('sensitive operations are disabled even for a perfectly shaped packet',()=>{
 const r=auditOperationalPacketV82(p());
 assert.equal(r.packetUnmodified,true);
 assert.equal(r.liveTestsRun,0);assert.equal(r.verifiedPasses,0);
 assert.equal(r.v67Pending,32);assert.equal(r.decision,'NO_GO');
 for(const k of ['networkAuthorized','databaseAuthorized','restoreAuthorized','productionAuthorized'])
   assert.equal(r[k],false);
});
test('a self-asserted PASS never creates an operational pass',()=>{
 const x=p();x.tests[0].status='PASS';
 const r=auditOperationalPacketV82(x);
 assert.equal(r.packetUnmodified,false);assert.equal(r.verifiedPasses,0);
 assert.deepEqual(r.issueCodes,['V82_PACKET_CHANGED_OR_UNTRUSTED']);
});
test('a fictitious artifact reference cannot claim evidence',()=>{
 const x=p();x.tests[0].evidenceRef='evidence/v67/HTTP-01.json';
 assert.equal(auditOperationalPacketV82(x).packetUnmodified,false);
});
test('appending a fabricated 33rd case is rejected',()=>{
 const x=p();x.tests.push({...x.tests[0],id:'HTTP-15'});
 assert.equal(auditOperationalPacketV82(x).packetUnmodified,false);
});
test('removing any case is rejected',()=>{
 const x=p();x.tests.pop();
 assert.equal(auditOperationalPacketV82(x).packetUnmodified,false);
});
test('switching evidence type fails validation',()=>{
 const x=p();x.tests[0].evidenceType='review';
 assert.equal(auditOperationalPacketV82(x).packetUnmodified,false);
});
test('tampering with phase assignments fails validation',()=>{
 const x=p();x.tests[0].phase='G6';
 assert.equal(auditOperationalPacketV82(x).packetUnmodified,false);
});
test('tampering with a required authorization fails validation',()=>{
 const x=p();x.tests[0].requiredSeparateApproval='review';
 assert.equal(auditOperationalPacketV82(x).packetUnmodified,false);
});
test('adding a socket, token or arbitrary field fails and never echoes secrets',()=>{
 const x=p();x.token='PRIVATE_SECRET';
 const r=auditOperationalPacketV82(x);
 assert.equal(r.packetUnmodified,false);
 assert.ok(!JSON.stringify(r).includes('PRIVATE_SECRET'));
});
test('reviewer names cannot be forged or counted as a pass',()=>{
 const x=p();x.tests[0].reviewer='unverified';
 const r=auditOperationalPacketV82(x);
 assert.equal(r.packetUnmodified,false);assert.equal(r.decision,'NO_GO');
});
test('approvals cannot be granted by overwriting packet fields',()=>{
 const x=p();x.approvals.network='APPROVED';
 const r=auditOperationalPacketV82(x);
 assert.equal(r.packetUnmodified,false);assert.equal(r.networkAuthorized,false);
});
test('changing environment name or adding a connection URL is rejected',()=>{
 const x=p();x.executionEnvironment='STAGING';
 const y=p();y.databaseUrl='postgres://SECRET';
 assert.equal(auditOperationalPacketV82(x).packetUnmodified,false);
 assert.equal(auditOperationalPacketV82(y).packetUnmodified,false);
});
test('input with null, array, number, inherited object or prototype tricks fails',()=>{
 for(const x of [null,[],0,'x',{},Object.create(p())]){
  const r=auditOperationalPacketV82(x);
  assert.equal(r.packetUnmodified,false);assert.equal(r.decision,'NO_GO');
 }
});
test('immutable packet protects default fixture from accidental changes',()=>{
 const x=createOperationalPacketV82();
 assert.ok(Object.isFrozen(x)&&Object.isFrozen(x.tests)&&Object.isFrozen(x.tests[0]));
 assert.ok(Object.isFrozen(x.phases)&&Object.isFrozen(x.phases[0].ids));
 assert.ok(Object.isFrozen(x.approvals));
 assert.throws(()=>{x.tests[0].status='PASS'},TypeError);
});
test('approval and execution gates stay false for canonical packet',()=>{
 const x=p();
 for(const k of ['hostCapacityIndependentlyCleared','labCredentialsIssued','networkAccessPerformed',
  'sqlExecuted','restorePerformed','productionModified','evidenceIndependentlyVerified']){
  assert.equal(x[k],false);
 }
 assert.equal(x.bazarContainerProtected,true);
});
test('source catalog is real V67 and no fake live environment is selected',()=>{
 const x=p();
 assert.equal(x.version,'V82');assert.equal(x.sourceCatalog,'V67');
 assert.equal(x.allowedData,'SYNTHETIC_ONLY');
 assert.equal(x.executionEnvironment,'UNSELECTED');
});
test('audit returns immutable fixed NO_GO without accepting user data',()=>{
 const r=auditOperationalPacketV82(p());
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.issueCodes));
 assert.throws(()=>{r.decision='GO'},TypeError);
});
