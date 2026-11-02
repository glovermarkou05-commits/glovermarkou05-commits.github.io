'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createV96PrivateObserver,sanitize}=require('../server/v96-private-observability.cjs');
const {createRequestBudget}=require('../server/request-budget-v66.cjs');
const v66=(event,status,durationBucketMs=0)=>({event,status,durationBucketMs});
function makeClock(t=0){let time=t;return {now:()=>time,set:x=>{time=x;},tick:x=>{time+=x;}};}
const observer=(clock=makeClock())=>createV96PrivateObserver({now:clock.now});

test('empty and fractional monotonic timestamps are valid; no alerts active',()=>{
 const clock=makeClock(0.12),o=observer(clock),s=o.snapshot();
 assert.equal(s.valid,true);
 assert.equal(s.total,0);
 assert.deepEqual(s.candidateSignals,{A1:false,A2:false,A3:null});
 assert.equal(s.activeAlerts,false);assert.equal(s.persisted,false);
 assert.equal(s.notificationSent,false);assert.equal(s.correlationAvailable,false);
 assert.ok(Object.isFrozen(s));assert.ok(Object.isFrozen(s.candidateSignals));
});

test('one request emits admission and completion but only completion counted',()=>{
 const o=observer();
 assert.equal(o.observe(v66('admitted',0)),true);
 assert.equal(o.observe(v66('completed',200,10)),true);
 assert.equal(o.snapshot().total,1);
 assert.equal(o.snapshot().success2xx,1);
});

test('rate-limited and over-capacity denials count once, not duplicate markers',()=>{
 const o=observer();
 o.observe(v66('rate_limited',429));
 o.observe(v66('overloaded',503));
 o.observe(v66('peer_capacity',503));
 o.observe(v66('transport_error',503));
 o.observe(v66('completed',503));
 const s=o.snapshot();
 assert.equal(s.total,4);
 assert.equal(s.server5xx,3);
 assert.equal(s.client4xx,1);
 assert.equal(s.rateLimited429,1);
 assert.equal(s.overload503,2);
});

test('reject any unapproved extra field, including IP, user, requestId, paths and headers',()=>{
 const o=observer();
 for(const field of ['ip','userId','requestId','route','path','headers','error','token','sql','origin']){
  const obj={...v66('completed',200),[field]:'SECRET-NEVER-RETAIN'};
  assert.equal(o.observe(obj),false);
 }
 const s=o.snapshot();
 assert.equal(s.total,0);
 const serialized=JSON.stringify(s);
 assert.doesNotMatch(serialized,/SECRET|ip|userId|requestId|headers|route|path|origin|token|sql/i);
});

test('strict status/event/bucket allowlist and malformed objects fail silently',()=>{
 const o=observer();
 const invalid=[
   null,[],{},'completed',{event:'completed',status:'200',durationBucketMs:0},
   v66('private',200),v66('completed',999),v66('completed',200,12345),
   v66('rate_limited',200),v66('overloaded',429),
   {event:'completed',status:200},
   {event:'completed',status:NaN,durationBucketMs:0}
 ];
 for(const x of invalid)assert.equal(o.observe(x),false);
 assert.equal(o.snapshot().total,0);
});

test('five-minute window drops previous events, no persistent history or time identifiers',()=>{
 const clock=makeClock(0.1),o=observer(clock);
 o.observe(v66('completed',200));
 clock.set(4*60000+0.1);o.observe(v66('completed',500));
 assert.equal(o.snapshot().total,2);
 clock.set(5*60000+0.1);
 const s=o.snapshot();assert.equal(s.total,1);assert.equal(s.server5xx,1);
 assert.deepEqual(Object.keys(s).filter(k=>/^(requestId|userId|timestamp|ip|path|url)$/i.test(k)),[]);
});

test('huge clock jump wipes old counters without scheduling jobs',()=>{
 const clock=makeClock(0),o=observer(clock);
 o.observe(v66('completed',200));
 clock.set(999999*60000+0.25);
 assert.equal(o.snapshot().total,0);
 o.observe(v66('completed',429));
 assert.equal(o.snapshot().total,1);
});

test('backward and invalid clocks refuse events without poisoning state',()=>{
 const clock=makeClock(10*60000),o=observer(clock);
 o.observe(v66('completed',200));
 clock.set(9*60000);assert.equal(o.observe(v66('completed',200)),false);
 assert.equal(o.snapshot().valid,false);
 clock.set(NaN);assert.equal(o.observe(v66('completed',200)),false);
 clock.set(10*60000+50);assert.equal(o.snapshot().total,1);
});

test('signal A1 only as dry-run when >=20 counted requests and >=5% 5xx',()=>{
 const o=observer();
 for(let i=0;i<19;i++)o.observe(v66('completed',i===0?503:200));
 assert.equal(o.snapshot().candidateSignals.A1,false);
 o.observe(v66('completed',200));
 const s=o.snapshot();
 assert.equal(s.total,20);assert.equal(s.server5xx,1);
 assert.equal(s.candidateSignals.A1,true);
 assert.equal(s.activeAlerts,false);
 assert.equal(s.proposedAlertStatus,'DRY_RUN_ONLY_NO_OWNER_OR_DELIVERY');
});

test('signal A2 only in dry-run when >=10% 429, and A3 is never inferred',()=>{
 const o=observer();
 for(let i=0;i<18;i++)o.observe(v66('completed',200));
 o.observe(v66('rate_limited',429));o.observe(v66('rate_limited',429));
 const s=o.snapshot();
 assert.equal(s.rateLimited429,2);assert.equal(s.candidateSignals.A2,true);
 assert.equal(s.candidateSignals.A3,null);
 assert.match(s.missingTelemetryStatus,/NOT_EVALUABLE/);
});

test('V66 observe callback can be attached without changing V66 or opening ports',async()=>{
 const clock=makeClock(1000),o=observer(clock);
 const res={destroyed:false,writableEnded:false,headersSent:false,
   writeHead(status,headers){this.status=status;this.headers=headers;},
   end(body){this.body=body;this.writableEnded=true;}};
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{authorization:'FAKE-SECRET'}};
 const serve=createRequestBudget({
    serve:async()=>200,
    now:clock.now,
    observe:o.observe,
    maxConcurrent:1,maxRequestsPerPeer:1,windowMs:60000,maxPeers:1
 });
 assert.equal(await serve(req,res),200);
 const rejectRes={...res,writableEnded:false,status:undefined};
 assert.equal(await serve(req,rejectRes),429);
 const s=o.snapshot();
 assert.equal(s.total,2);assert.equal(s.success2xx,1);assert.equal(s.rateLimited429,1);
 assert.doesNotMatch(JSON.stringify(s),/FAKE-SECRET|127\.0\.0\.1/);
});

test('observer never logs full headers, callback may be attached without exposing a sink',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../server/v96-private-observability.cjs'),'utf8');
 for(const forbidden of ['fs.writeFile','fetch(', 'http.request','console.log(','setTimeout(','setInterval(','new WebSocket','createServer(']){
   assert.equal(src.includes(forbidden),false,'unexpected side-effect: '+forbidden);
 }
 assert.equal(typeof observer().observe,'function');
});

test('configured clock must be function and thrown clock errors fail closed',()=>{
 assert.throws(()=>createV96PrivateObserver({now:null}),TypeError);
 const o=createV96PrivateObserver({now(){throw Error('clock');}});
 assert.equal(o.observe(v66('completed',200)),false);
 assert.equal(o.snapshot().valid,false);
});

test('numbers, rates and counts reflect only a bounded, non-persistent 5-minute sample',()=>{
 const clock=makeClock(1),o=observer(clock);
 for(let i=0;i<1500;i++)o.observe(v66('completed',i%5===0?503:200));
 let s=o.snapshot();
 assert.equal(s.total,1500);
 assert.equal(s.server5xx,300);
 assert.equal(s.candidateSignals.A1,true);
 clock.tick(360000);s=o.snapshot();
 assert.equal(s.total,0);
 assert.equal(s.activeAlerts,false);
});
