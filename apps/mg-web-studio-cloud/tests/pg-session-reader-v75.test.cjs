'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createPgSessionReaderV75} = require('../server/pg-session-reader-v75.cjs');
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW=1792752000;
const row=(extra={})=>({subject:USER,sessionId:SID,notAfterEpoch:null,...extra});
const source=(rows=[row()],cfg={})=>{
 let count=0, last;
 const q=async request=>{count++;last=request;return {rows}};
 const repo=createPgSessionReaderV75({query:q,nowSec:()=>NOW,...cfg});
 return {repo,call:(input={})=>repo.readSession({subject:USER,sessionId:SID,...input}),
  count:()=>count,last:()=>last};
};
test('requires explicit trusted query',()=>{
 for(const x of [undefined,null,1,'SQL',{},[]])assert.throws(()=>createPgSessionReaderV75({query:x}),TypeError);
});
test('requires bounded proof TTL and clock',()=>{
 for(const v of [-1,0,6,2.5,'2',NaN,Infinity])assert.throws(()=>createPgSessionReaderV75({query:async()=>{},proofTtlSec:v}),TypeError);
 assert.throws(()=>createPgSessionReaderV75({query:async()=>{},nowSec:123}),TypeError);
});
test('valid membership row supplies brief attestation, never privileges',async()=>{
 const f=source(),r=await f.call();
 assert.deepEqual(r,{active:true,revocationChecked:true,subject:USER,sessionId:SID,
  checkedAtSec:NOW,expiresAtSec:NOW+2});
 assert.ok(Object.isFrozen(r));assert.equal(f.repo.readiness.decision,'NO_GO');
});
test('query is fixed SELECT on auth.sessions and parameterized',async()=>{
 const f=source();await f.call();const {text,values}=f.last();
 assert.ok(/^SELECT /i.test(text));
 assert.ok(/FROM auth\.sessions WHERE id = \$1::uuid AND user_id = \$2::uuid LIMIT 2$/.test(text));
 assert.deepEqual(values,[SID,USER]);assert.ok(Object.isFrozen(values));assert.ok(Object.isFrozen(f.last()));
 assert.ok(!text.includes(SID) && !text.includes(USER));
 assert.ok(!/\b(?:DELETE|UPDATE|INSERT|ALTER|DROP|EXECUTE|CREATE)\b/i.test(text));
});
test('no SQL or IO during construction',()=>{
 let calls=0;createPgSessionReaderV75({query:()=>{calls++}});assert.equal(calls,0);
});
test('nonexistent session is a verified negative with matching subject',async()=>{
 const f=source([]);assert.deepEqual(await f.call(),{active:false,revocationChecked:true,
  subject:USER,sessionId:SID,checkedAtSec:NOW,expiresAtSec:NOW+2});
});
test('row with not_after in future restricts attestation to earlier deadline',async()=>{
 const f=source([row({notAfterEpoch:String(NOW+1)})]);
 assert.deepEqual(await f.call(),{active:true,revocationChecked:true,subject:USER,
  sessionId:SID,checkedAtSec:NOW,expiresAtSec:NOW+1});
});
test('expired not_after fails closed as a verified negative',async()=>{
 for(const seconds of [NOW,NOW-1]){
  const f=source([row({notAfterEpoch:String(seconds)})]);
  const res=await f.call();assert.equal(res.active,false);assert.equal(res.revocationChecked,true);
 }
});
test('unknown not_after is not treated as unbounded long session',async()=>{
 const f=source();const res=await f.call();assert.equal(res.expiresAtSec,NOW+2);
});
test('row for another user fails even if the session id matches',async()=>{
 const f=source([row({subject:SID})]);assert.equal(await f.call(),null);
});
test('row for another session fails even if the user matches',async()=>{
 const f=source([row({sessionId:USER})]);assert.equal(await f.call(),null);
});
test('duplicate returned rows fail closed',async()=>{
 const f=source([row(),row()]);assert.equal(await f.call(),null);
});
test('missing rows and malformed query results fail closed',async()=>{
 for(const bad of [null,undefined,{}, {rows:null},{rows:'secret'},{rows:[1]}, {rows:{}}]){
  const a=createPgSessionReaderV75({query:async()=>bad,nowSec:()=>NOW});
  assert.equal(await a.readSession({subject:USER,sessionId:SID}),null);
 }
});
test('additional row fields are refused, not echoed',async()=>{
 const f=source([row({email:'private@test.invalid'})]);assert.equal(await f.call(),null);
});
test('missing or wrongly typed columns are refused',async()=>{
 for(const x of [ {subject:USER,sessionId:SID},row({notAfterEpoch:100}),
  row({notAfterEpoch:undefined}),row({subject:undefined}),row({sessionId:22})]){
  const f=source([x]);assert.equal(await f.call(),null);
 }
});
test('nonnumeric / noncanonical notAfterEpoch rejected',async()=>{
 for(const bad of ['0','00','-1','1.5','1e10','0x16','999999999999999999','NaN','',' 123',true,Infinity]){
  const f=source([row({notAfterEpoch:bad})]);assert.equal(await f.call(),null);
 }
});
test('upper-case and malformed UUIDs never reach database',async()=>{
 const f=source();for(const bad of ['','not-a-uuid',USER.toUpperCase(),"' OR 1=1 --",null,42,[],{}]){
  assert.equal(await f.call({subject:bad}),null);
  assert.equal(await f.call({sessionId:bad}),null);
 }
 assert.equal(f.count(),0);
});
test('missing identifiers are rejected before querying',async()=>{
 const f=source();assert.equal(await f.repo.readSession(),null);
 assert.equal(await f.repo.readSession({subject:USER}),null);assert.equal(f.count(),0);
});
test('pre-aborted AbortSignal prevents query',async()=>{
 const f=source();const ac=new AbortController();ac.abort();
 assert.equal(await f.call({signal:ac.signal}),null);assert.equal(f.count(),0);
});
test('invalid abort signals are refused',async()=>{
 const f=source();assert.equal(await f.call({signal:{aborted:false}}),null);
 assert.equal(f.count(),0);
});
test('late query after abort cannot create valid attestation',async()=>{
 const c=new AbortController();let settle;
 const p=new Promise(resolve=>settle=resolve);
 const f=createPgSessionReaderV75({query:()=>p,nowSec:()=>NOW});
 const pending=f.readSession({subject:USER,sessionId:SID,signal:c.signal});
 c.abort();settle({rows:[row()]});assert.equal(await pending,null);
});
test('query errors and promise rejections fail without leaking secrets',async()=>{
 for(const query of [()=>{throw Error('TOKEN_PRIVATE')},async()=>{throw Error('DB_PASSWORD')}] ){
  const f=createPgSessionReaderV75({query,nowSec:()=>NOW});
  assert.equal(await f.readSession({subject:USER,sessionId:SID}),null);
 }
});
test('clock throws before query and no DB read',async()=>{
 let calls=0;const f=createPgSessionReaderV75({query:()=>{calls++},nowSec:()=>{throw Error('clock')}});
 assert.equal(await f.readSession({subject:USER,sessionId:SID}),null);assert.equal(calls,0);
});
test('clock regression or invalid clock after query rejects',async()=>{
 for(const after of [NOW-1,NaN,Infinity,0,NOW+0.5]){
  let calls=0;const f=createPgSessionReaderV75({query:async()=>({rows:[row()]}) ,nowSec:()=>++calls===1?NOW:after});
  assert.equal(await f.readSession({subject:USER,sessionId:SID}),null);
 }
});
test('clock moving forward marks attestation at query completion',async()=>{
 let calls=0;const f=createPgSessionReaderV75({query:async()=>({rows:[row()]}),nowSec:()=>++calls===1?NOW:NOW+2});
 const r=await f.readSession({subject:USER,sessionId:SID});
 assert.equal(r.checkedAtSec,NOW+2);assert.equal(r.expiresAtSec,NOW+4);
});
test('overflow near integer limit never creates unsafe attestation',async()=>{
 const now=Number.MAX_SAFE_INTEGER;
 const f=createPgSessionReaderV75({query:async()=>({rows:[row()]}),nowSec:()=>now});
 assert.equal(await f.readSession({subject:USER,sessionId:SID}),null);
});
test('readiness reports no real grants, connection, revocation or production',()=>{
 const f=source();assert.deepEqual(f.repo.readiness,{source:'auth.sessions',databaseConnected:false,
  grantsVerified:false,sessionPolicyVerified:false,realRevocationVerified:false,
  productionAuthorized:false,decision:'NO_GO'});
 assert.ok(Object.isFrozen(f.repo.readiness));
});
test('does not expose SQL APIs, credentials, pool or write operations',()=>{
 const f=source();assert.deepEqual(Object.keys(f.repo),['readSession','readiness']);
 for(const name of ['connect','pool','write','insert','update','delete','serviceRole','credentials','listen'])
  assert.equal(name in f.repo,false);
});
