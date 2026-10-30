'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createRequestBudget}=require('../server/request-budget-v66.cjs');
const {sanitizeV66Event,createOfflineTelemetryReview,EVENTS,BUCKETS,
 MAX_OBSERVATIONS}=require('../server/v92-offline-observability-review.cjs');
const packet=JSON.parse(fs.readFileSync(
 path.join(__dirname,'../docs/V92-PAQUETE-REVISION-OBSERVABILIDAD.json'),'utf8'));
const v67=JSON.parse(fs.readFileSync(
 path.join(__dirname,'../docs/V67-EVIDENCIAS-PENDIENTES.json'),'utf8'));
const v91=JSON.parse(fs.readFileSync(
 path.join(__dirname,'../docs/V91-MATRIZ-COBERTURA-V67.json'),'utf8'));
const good=(event='completed',status=200,bucket=100)=>
 ({event,status,durationBucketMs:bucket});
function fakeRequest(addr='127.0.0.1'){
 return {socket:{remoteAddress:addr},headers:{
   authorization:'Bearer private-DO-NOT-LOG','x-forwarded-for':'203.0.113.35'},
   url:'/api/very-private/path',body:{password:'VERY-SECRET'}};
}
function fakeResponse(){
 return {headersSent:false,writableEnded:false,destroyed:false,
  writeHead(status){this.status=status;this.headersSent=true;},
  end(body){this.body=body;this.writableEnded=true;}};
}
test('V92 accepts only the exact immutable three-field V66 schema',()=>{
 const r=sanitizeV66Event(good());
 assert.deepEqual(r,good());
 assert.equal(Object.isFrozen(r),true);
 assert.deepEqual(Object.keys(r),['event','status','durationBucketMs']);
});
test('six current V66 event names and five duration buckets are pinned',()=>{
 assert.deepEqual(EVENTS,['admitted','rate_limited','overloaded','peer_capacity',
  'completed','transport_error']);
 assert.deepEqual(BUCKETS,[0,10,100,1000,10000]);
});
test('each event has exactly the documented safe status contract',()=>{
 for(const [event,status] of [
  ['admitted',0],['rate_limited',429],['overloaded',503],
  ['peer_capacity',503],['transport_error',503],['completed',null],
  ['completed',200],['completed',503]
 ])assert.ok(sanitizeV66Event(good(event,status,0)),event);
});
test('unrecognized event, unsafe status, and unbucketed time rejected',()=>{
 for(const x of [good('exfiltrate'),good('admitted',200),
  good('rate_limited',200),good('completed',0),
  good('completed',700),good('completed','200'),
  good('completed',200,11),good('completed',200,-1),
  good('completed',200,Infinity),good('completed',200,null)]){
  assert.equal(sanitizeV66Event(x),null,JSON.stringify(x));
 }
});
test('reject additional sensitive fields instead of attempting masking',()=>{
 for(const key of ['token','authorization','url','ip','headers','userId','payload',
  'sql','stack','cookie','email','requestId']){
  assert.equal(sanitizeV66Event({...good(),[key]:'PRIVATE_VALUE'}),null,key);
 }
});
test('reject arrays, class instances and inherited properties',()=>{
 assert.equal(sanitizeV66Event(null),null);
 assert.equal(sanitizeV66Event([]),null);
 assert.equal(sanitizeV66Event(new Date()),null);
 class Weird{constructor(){Object.assign(this,good());}}
 assert.equal(sanitizeV66Event(new Weird()),null);
 const inherited=Object.create({event:'completed'});
 Object.assign(inherited,{status:200,durationBucketMs:0});
 assert.equal(sanitizeV66Event(inherited),null);
});
test('normalizer returns no input reference or hidden hostile payload',()=>{
 const input=good();
 const result=sanitizeV66Event(input);
 assert.notEqual(result,input);
 input.status=500;
 assert.equal(result.status,200);
});
test('bounded in-memory aggregation has no raw log sink or network',()=>{
 const agg=createOfflineTelemetryReview({maxObservations:5});
 assert.equal(agg.inspect(good()),true);
 assert.equal(agg.inspect({...good(),password:'PRIVATE'}),false);
 const report=agg.summary();
 assert.deepEqual(report.counts,{admitted:0,rate_limited:0,overloaded:0,
  peer_capacity:0,completed:1,transport_error:0});
 assert.equal(report.observationsAccepted,1);
 assert.equal(report.observationsRejected,1);
 assert.equal(report.inputStored,false);
 assert.equal(report.rawEventStored,false);
 assert.equal(report.hasPersistentLogs,false);
 assert.equal(report.alertsConfigured,false);
 assert.equal(report.productionAuthorized,false);
});
test('event counts are bounded and memory cannot grow from arbitrary identities',()=>{
 const agg=createOfflineTelemetryReview({maxObservations:2});
 assert.equal(agg.inspect(good()),true);
 assert.equal(agg.inspect(good()),true);
 for(let i=0;i<8;i++)assert.equal(agg.inspect(good()),false);
 assert.equal(agg.summary().observationsAccepted,2);
 assert.equal(agg.summary().observationsOverCapacity,8);
 assert.equal(Object.keys(agg.summary().counts).length,6);
 assert.equal(MAX_OBSERVATIONS,256);
});
test('refuse invalid or runaway capacity arguments',()=>{
 for(const capacity of [0,-1,257,1.5,'256',Infinity,NaN,null]){
  assert.throws(()=>createOfflineTelemetryReview({maxObservations:capacity}),TypeError);
 }
});
test('a real V66 admission event is filtered in memory with no secrets',async()=>{
 const aggregate=createOfflineTelemetryReview();
 const gate=createRequestBudget({
  serve:async()=>200,maxConcurrent:2,maxRequestsPerPeer:1,
  windowMs:1000,maxPeers:2,
  now:()=>0,observe:event=>aggregate.inspect(event)
 });
 const req=fakeRequest(),a=fakeResponse(),b=fakeResponse();
 assert.equal(await gate(req,a),200);
 assert.equal(await gate(req,b),429);
 const report=aggregate.summary();
 assert.equal(report.counts.admitted,1);
 assert.equal(report.counts.completed,1);
 assert.equal(report.counts.rate_limited,1);
 const flat=JSON.stringify(report);
 for(const secret of ['Bearer','VERY-SECRET','private','203.0.113',
  '/api/very-private','127.0.0.1'])assert.ok(!flat.includes(secret),secret);
});
test('review packet covers exact four official OBS IDs in V67 order',()=>{
 assert.deepEqual(packet.controls.map(x=>x.id),
  ['OBS-01','OBS-02','OBS-03','OBS-04']);
 const official=v67.cases.filter(x=>x.id.startsWith('OBS-'));
 assert.deepEqual(packet.controls.map(x=>x.id),official.map(x=>x.id));
});
test('review packet inherits V91 coverage without changing it',()=>{
 for(const x of packet.controls){
  assert.equal(x.v91Coverage,v91.controls.find(y=>y.id===x.id).coverage);
  assert.equal(x.proposedStatus,'DRAFT_UNREVIEWED');
  assert.equal(x.reviewer,'UNASSIGNED');
  assert.equal(x.signed,false);
 }
});
test('retention, encryption and access control are draft, not implemented',()=>{
 assert.equal(packet.retentionPolicy.status,'PROPOSED_NOT_CONFIGURED');
 assert.equal(packet.retentionPolicy.aggregateRetentionDaysProposed,30);
 assert.equal(packet.retentionPolicy.encryptionAtRest,'REQUIRED_NOT_VERIFIED');
 assert.equal(packet.retentionPolicy.encryptionInTransit,'REQUIRED_NOT_VERIFIED');
 assert.equal(packet.retentionPolicy.deletionAutomation,'NOT_CONFIGURED');
 assert.equal(packet.retentionPolicy.storageLocation,'UNSELECTED');
});
test('alert proposals are unarmed, ownership and escalation unapproved',()=>{
 assert.equal(packet.observability.alertEngine,'NONE');
 assert.equal(packet.proposedAlerts.length,3);
 assert.ok(packet.proposedAlerts.every(x=>x.active===false&&
  x.owner==='UNASSIGNED'&&x.escalation==='REVIEW_REQUIRED'));
});
test('packet refuses to claim V66 has real cross-layer correlation',()=>{
 assert.equal(packet.observability.correlation,'UNAVAILABLE_FOR_V66_REJECTIONS');
 assert.match(packet.controls[1].evidenceStillNeeded,/correlation/);
});
test('canonical V67 remains 32 pending; nothing can approve production',()=>{
 assert.equal(v67.cases.length,32);
 assert.ok(v67.cases.every(c=>c.status==='PENDING'&&c.evidenceRef===null));
 assert.equal(v67.decision,'NO_GO');
 assert.equal(packet.gate.formalV67Pending,32);
 assert.equal(packet.gate.independentlyApproved,0);
 assert.equal(packet.gate.observabilityFormalPending,4);
 assert.equal(packet.gate.productionAuthorized,false);
 assert.equal(packet.gate.decision,'NO_GO');
});
test('independent reviewer has not been assigned or signed anything',()=>{
 assert.equal(packet.reviewProcedure.reviewer,'UNASSIGNED');
 assert.equal(packet.reviewProcedure.signOff,'MISSING');
 assert.equal(packet.reviewProcedure.policyApproval,'NOT_REQUESTED');
 assert.equal(packet.reviewProcedure.independentOfAuthor,'REQUIRED_NOT_VERIFIED');
});
test('V92 utility returns no pathways to wire log collector or storage',()=>{
 const m=require('../server/v92-offline-observability-review.cjs');
 assert.deepEqual(Object.keys(m).sort(),
  ['sanitizeV66Event','createOfflineTelemetryReview','EVENTS','BUCKETS','MAX_OBSERVATIONS'].sort());
 assert.equal(typeof m.connect,'undefined');
 assert.equal(typeof m.publish,'undefined');
});
