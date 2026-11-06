'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createV136DualChannelPreview}=require('../server/v136-dual-channel-preview.cjs');
function snap({total=20,server5xx=0,rateLimited429=0}={}){
  if(server5xx+rateLimited429>total)throw Error('test fixture invalid');
  return {valid:true,intervalMinutes:5,persisted:false,notificationSent:false,
    activeAlerts:false,correlationAvailable:false,countedRequestEvents:total,
    total,success2xx:total-server5xx-rateLimited429,redirect3xx:0,
    client4xx:rateLimited429,server5xx,rateLimited429,overload503:0,
    candidateSignals:{A1:total>=20&&server5xx>=Math.ceil(total/20),
      A2:total>=20&&rateLimited429>=Math.ceil(total/10),A3:null},
    proposedAlertStatus:'DRY_RUN_ONLY_NO_OWNER_OR_DELIVERY',
    missingTelemetryStatus:'NOT_EVALUABLE_WITHOUT_INDEPENDENT_CONFIRMED_TRAFFIC',
    limitations:'TRANSPORT_ERROR_WITHOUT_COMPLETED_NOT_COUNTED;NO_REAL_PROXY_OR_SINK'};
}
test('no signal gives no notifications; no delivery regardless of input',()=>{
  const r=createV136DualChannelPreview(snap());
  assert.equal(r.validInput,true);assert.deepEqual(r.notifications,[]);
  assert.equal(r.decision,'REVIEW_ONLY_NO_GO');
  assert.equal(r.deliveryAuthorized,false);assert.equal(r.notificationSent,false);
  assert.equal(r.persistentQueue,false);assert.equal(r.destinationsConfigured,false);
});
test('5xx boundary requires at least 20 requests and five percent',()=>{
  assert.equal(createV136DualChannelPreview(snap({total:19,server5xx:1})).notifications.length,0);
  const r=createV136DualChannelPreview(snap({total:20,server5xx:1}));
  assert.deepEqual(r.notifications.map(x=>x.signal),['A1']);
  assert.equal(r.notifications[0].severity,'HIGH');
});
test('429 threshold requires 10 percent and 20 events',()=>{
  assert.equal(createV136DualChannelPreview(snap({total:20,rateLimited429:1})).notifications.length,0);
  assert.deepEqual(createV136DualChannelPreview(snap({total:20,rateLimited429:2})).notifications.map(x=>x.signal),['A2']);
});
test('both signals preview both channels independently, no sends',()=>{
  const r=createV136DualChannelPreview(snap({total:20,server5xx:1,rateLimited429:2}));
  assert.deepEqual(r.notifications.map(x=>x.signal),['A1','A2']);
  for(const notification of r.notifications){
    assert.deepEqual(notification.transports.map(x=>x.channel),['WHATSAPP_BUSINESS_PLATFORM','TRANSACTIONAL_EMAIL']);
    assert.ok(notification.transports.every(x=>x.status==='NOT_CONFIGURED_NOT_SENT'));
    assert.doesNotMatch(notification.text, /https?:\/\/|@|\+593|password|token|JWT|phone/i);
    assert.ok(Object.isFrozen(notification));assert.ok(Object.isFrozen(notification.transports));
  }
});
test('invalid, forged or PII-enriched snapshots are rejected without echo',()=>{
  const valid=snap({server5xx:1});
  const invalid=[null,{},[],true,'string',
    {...valid,client4xx:3},{...valid,notificationSent:true},
    {...valid,activeAlerts:true},{...valid,persisted:true},
    {...valid,intervalMinutes:10},{...valid,total:100},
    {...valid,rateLimited429:3},
    {...valid,candidateSignals:{...valid.candidateSignals,A1:false}},
    {...valid,candidateSignals:{...valid.candidateSignals,A3:true}},
    {...valid,email:'private@example.com'},
    {...valid,token:'secret'},
    {...valid,total:NaN},
    {...valid,server5xx:Number.MAX_SAFE_INTEGER}
  ];
  for(const sample of invalid){
    const r=createV136DualChannelPreview(sample);
    assert.equal(r.validInput,false);assert.deepEqual(r.notifications,[]);
    assert.doesNotMatch(JSON.stringify(r),/private@example\.com|secret/);
  }
});
test('A3 cannot be inferred from V96 and remains explicitly untestable',()=>{
  const r=createV136DualChannelPreview(snap({total:0}));
  assert.match(r.signalA3,/NOT_EVALUABLE/);
  assert.deepEqual(r.notifications,[]);
});
test('snapshot may carry forged sensitive text in inert field; output excludes it',()=>{
  const input=snap({server5xx:1});input.limitations='PHONE:+593999999999;email:PRIVATE@EXAMPLE.COM';
  const out=JSON.stringify(createV136DualChannelPreview(input));
  assert.doesNotMatch(out,/PRIVATE|999999999|EXAMPLE/);
});
test('output is immutable and no recipients or addresses can be supplied',()=>{
  const r=createV136DualChannelPreview(snap({server5xx:1}));
  assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.notifications));
  assert.throws(()=>{r.notifications[0].transports[0].channel='ATTACK';},TypeError);
  assert.doesNotMatch(JSON.stringify(r),/recipient|phone|emailAddress|apiKey|apiToken|webhook/i);
});
test('source is pure with no code paths for transport, timer, env, filesystem or logs',()=>{
  const src=fs.readFileSync(path.resolve(__dirname,'../server/v136-dual-channel-preview.cjs'),'utf8');
  for(const token of ['fetch(', 'require(\'node:http\')','require(\'node:https\')','process.env',
    'setTimeout(', 'setInterval(', 'createServer(', 'fs.writeFile', 'console.log(', 'https.request(']){
    assert.equal(src.includes(token),false,token);
  }
});
