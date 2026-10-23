'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createBoundedProviderV73}=require('../server/bounded-provider-v73.cjs');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function defer(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const mk=(run=async()=>({ok:true}),opts={})=>createBoundedProviderV73({run,timeoutMs:25,...opts});

test('requires trusted run and bounded numeric policy',()=>{
  assert.throws(()=>createBoundedProviderV73(),TypeError);
  for(const x of [{maxConcurrent:0},{maxConcurrent:129},{timeoutMs:9},{timeoutMs:30001},
    {failureThreshold:0},{failureThreshold:11},{cooldownMs:99},{cooldownMs:300001},
    {nowMs:null},{onAudit:42},{timeoutMs:'25'}])assert.throws(()=>mk(async()=>1,x),TypeError);
});
test('successful operation returns actual result; status is fixed and frozen',async()=>{
  const result={ok:true};const p=mk(async()=>result);assert.equal(await p.execute('ignored'),result);
  assert.deepEqual(p.status(),{active:0,maxConcurrent:8,circuit:'closed'});
  assert.ok(Object.isFrozen(p.status()));
});
test('synchronous provider throw fails closed without propagating secret',async()=>{
  const p=mk(()=>{throw Error('SECRET_INTERNAL');});assert.equal(await p.execute('secret'),null);
});
test('asynchronous rejection fails closed and never leaks provider errors',async()=>{
  const p=mk(async()=>{throw Error('DATABASE_URL');});assert.equal(await p.execute('secret'),null);
});
test('hanging provider times out and receives aborted signal',async()=>{
  let signal;const d=defer();const p=mk((_input,ctx)=>{signal=ctx.signal;return d.promise});
  assert.equal(await p.execute({session:'secret'}),null);
  assert.equal(signal.aborted,true);
  assert.equal(p.status().active,1);
  d.resolve('too late');await sleep(0);assert.equal(p.status().active,0);
});
test('timed-out callback still occupies its slot and cannot be bypassed',async()=>{
  const d=defer();let invoked=0;const p=mk(()=>{invoked++;return d.promise},{maxConcurrent:1});
  assert.equal(await p.execute(1),null);
  assert.equal(await p.execute(2),null);assert.equal(invoked,1);
  d.resolve('late');await sleep(0);assert.equal(p.status().active,0);
});
test('overflow denies immediately without queuing unbounded callers',async()=>{
  const d=defer();const p=mk(()=>d.promise,{maxConcurrent:1,timeoutMs:100});
  const first=p.execute('first');await Promise.resolve();
  for(let i=0;i<30;i++)assert.equal(await p.execute('other'),null);
  d.resolve(true);assert.equal(await first,true);
});
test('two concurrent work items are allowed when maxConcurrent two',async()=>{
  const d=defer();let calls=0;const p=mk(()=>{calls++;return d.promise;},{maxConcurrent:2,timeoutMs:100});
  const x=p.execute(1),y=p.execute(2);await Promise.resolve();
  assert.equal(p.status().active,2);assert.equal(await p.execute(3),null);
  d.resolve('done');assert.deepEqual(await Promise.all([x,y]),['done','done']);assert.equal(calls,2);
});
test('timeout callback cannot make late result become an authorization',async()=>{
  const d=defer();const p=mk(()=>d.promise,{maxConcurrent:1});const first=p.execute('secret');
  await sleep(40);d.resolve({active:true});
  assert.equal(await first,null);await sleep(0);
});
test('callback receives only supplied input and a real AbortSignal',async()=>{
  let argumentsRead;const p=mk(async(input,{signal})=>{argumentsRead=[input,signal];return 'ok'});
  const input=Object.freeze({subject:'fake'});assert.equal(await p.execute(input),'ok');
  assert.equal(argumentsRead[0],input);assert.equal(argumentsRead[1].aborted,false);
});
test('telemetry has fixed fields, frozen, and never contains input or exception',async()=>{
  const events=[];const p=mk(async()=>{throw Error('SUPER_SECRET');},{onAudit:e=>events.push(e)});
  await p.execute({password:'SENSITIVE'});
  for(const e of events){assert.deepEqual(Object.keys(e).sort(),['active','circuit','event']);assert.ok(Object.isFrozen(e));
    assert.ok(!JSON.stringify(e).includes('SENSITIVE'));assert.ok(!JSON.stringify(e).includes('SECRET'));}
});
test('throwing telemetry does not prevent success or cause provider bypass',async()=>{
  const p=mk(async()=>({ok:true}),{onAudit:()=>{throw Error('broken logger')}});
  assert.deepEqual(await p.execute('item'),{ok:true});
});
test('threshold failures open circuit and deny until cooldown',async()=>{
  let current=100,calls=0;const p=mk(async()=>{calls++;throw Error('offline')},
    {failureThreshold:2,cooldownMs:100,nowMs:()=>current});
  assert.equal(await p.execute(),null);assert.equal(p.status().circuit,'closed');
  assert.equal(await p.execute(),null);assert.equal(p.status().circuit,'open');
  assert.equal(await p.execute(),null);assert.equal(calls,2);
  current=199;assert.equal(await p.execute(),null);assert.equal(calls,2);
});
test('successful half-open probe restores the circuit after cooldown',async()=>{
  let t=100,fails=true,calls=0;const p=mk(async()=>{calls++;if(fails)throw Error('bad');return 200},
    {failureThreshold:1,cooldownMs:100,nowMs:()=>t});
  assert.equal(await p.execute(),null);assert.equal(p.status().circuit,'open');
  t=200;fails=false;assert.equal(await p.execute(),200);assert.equal(p.status().circuit,'closed');
  assert.equal(await p.execute(),200);assert.equal(calls,3);
});
test('failed half-open probe reopens circuit without queue',async()=>{
  let t=1;const p=mk(async()=>null,{failureThreshold:1,cooldownMs:100,nowMs:()=>t});
  await p.execute();t=102;assert.equal(await p.execute(),null);assert.equal(p.status().circuit,'open');
});
test('only one half-open probe starts while provider is unresolved',async()=>{
  let t=1,calls=0;const d=defer();const p=mk(()=>{calls++;return calls===1?Promise.reject(Error('fail')):d.promise},
    {failureThreshold:1,cooldownMs:100,nowMs:()=>t,timeoutMs:100});
  assert.equal(await p.execute(),null);t=102;const probe=p.execute();await Promise.resolve();
  assert.equal(p.status().circuit,'half_open');assert.equal(await p.execute(),null);
  d.resolve(true);assert.equal(await probe,true);assert.equal(p.status().circuit,'closed');
});
test('invalid clock and rollback do not allow new provider calls',async()=>{
  let t=100,calls=0;const p=mk(async()=>{calls++;return true},{nowMs:()=>t});
  assert.equal(await p.execute(),true);t=99;assert.equal(await p.execute(),null);
  t=NaN;assert.equal(await p.execute(),null);assert.equal(calls,1);
});
test('non-successful null and undefined responses count as provider failures',async()=>{
  const p=mk(async()=>null,{failureThreshold:1});assert.equal(await p.execute(),null);assert.equal(p.status().circuit,'open');
  const q=mk(async()=>undefined,{failureThreshold:1});assert.equal(await q.execute(),null);assert.equal(q.status().circuit,'open');
});
test('late settlement after timeout emits no secrets in telemetry',async()=>{
  const d=defer(),events=[];const p=mk(()=>d.promise,{onAudit:e=>events.push(e)});
  await p.execute({token:'ABCD'});d.reject(Error('private'));await sleep(0);
  assert.ok(events.some(x=>x.event==='late_settled'));assert.ok(!JSON.stringify(events).includes('private'));
});
test('earlier in-flight success cannot close a newer open circuit or be returned', async()=>{
  let calls=0,t=500;const d=defer();
  const p=mk(()=> ++calls === 1 ? d.promise : Promise.reject(Error('down')),
    {failureThreshold:1,nowMs:()=>t,maxConcurrent:2});
  const earlier=p.execute({id:'first'});
  await Promise.resolve();assert.equal(await p.execute({id:'second'}),null);
  assert.equal(p.status().circuit,'open');
  d.resolve({ok:true});assert.equal(await earlier,null);
  assert.equal(p.status().circuit,'open');
});
