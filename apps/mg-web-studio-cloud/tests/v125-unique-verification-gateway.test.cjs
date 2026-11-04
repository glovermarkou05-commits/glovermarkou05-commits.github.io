'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {createV125UniqueVerificationGateway}=require('../server/v125-unique-verification-gateway.cjs');
const NOW=2000000000;
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REF='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REF2='ffffffff-ffff-4fff-8fff-ffffffffffff';
const ID1='11111111-1111-4111-8111-111111111111';
const ID2='22222222-2222-4222-8222-222222222222';
const KEY=Buffer.alloc(32,41);
const accept={ok:true,atomicCommitConfirmed:true,productionAuthorized:false,formalV67Pass:0};
const deny={ok:false,atomicCommitConfirmed:false,productionAuthorized:false,formalV67Pass:0};
const request=(a={})=>({action:'publish',organizationId:ORG,proofReference:REF,siteId:SITE,...a});
const proof=(a={})=>({checkedAtSec:NOW,eventId:ID1,eventIdBoundToVerification:true,
 factorOwnershipVerified:true,method:'totp',proofReference:REF,provenanceReviewed:true,
 sessionBoundByAuthorizedFlow:true,sessionId:SID,subject:USER,verified:true,verifiedAtSec:NOW-10,...a});
const hmac=(id=ID1,key=KEY)=>createHmac('sha256',key).update('mg-v125-mfa-event-v2|'+id.toLowerCase()).digest('hex');
function fixture({reader,operation,clock=()=>NOW,key=KEY}={}){
 const state={lookups:[],actions:[]};
 const api=createV125UniqueVerificationGateway({
  authenticatedSubject:USER,authenticatedSessionId:SID,ledgerHmacKey:key,nowSec:clock,
  readTrustedVerifiedEvent:async x=>{state.lookups.push(x);return reader?reader(x):proof();},
  runAtomicOperation:async x=>{state.actions.push(x);return operation?operation(x):accept;}
 });
 return {api,state};
}
test('requires trusted backend identity, stable event issuer, HMAC and business provider',()=>{
 assert.throws(()=>createV125UniqueVerificationGateway(),TypeError);
 assert.throws(()=>fixture({key:Buffer.alloc(8)}),TypeError);
 assert.throws(()=>fixture({key:'secret'}),TypeError);
});
test('happy path uses server-derived eventId-only domain-separated HMAC',async()=>{
 const {api,state}=fixture();
 assert.deepEqual(await api.execute(request()),accept);
 assert.deepEqual(state.lookups,[{proofReference:REF,subject:USER,sessionId:SID}]);
 assert.deepEqual(state.actions,[{action:'publish',eventKey:hmac(),organizationId:ORG,
  sessionId:SID,siteId:SITE,subject:USER,verifiedAtSec:NOW-10}]);
 assert.ok(Object.isFrozen(state.lookups[0]));assert.ok(Object.isFrozen(state.actions[0]));
});
test('two independently verified MFA events in the SAME second use different keys',async()=>{
 const actions=[];const {api}=fixture({reader:async x=>proof({eventId:x.proofReference===REF?ID1:ID2,proofReference:x.proofReference}),
 operation:async x=>{actions.push(x);return accept;}});
 assert.deepEqual(await api.execute(request()),accept);
 assert.deepEqual(await api.execute(request({proofReference:REF2})),accept);
 assert.deepEqual(actions.map(x=>x.eventKey),[hmac(ID1),hmac(ID2)]);
 assert.notEqual(actions[0].eventKey,actions[1].eventKey);
});
test('one verified event is replay-stable even if timestamp or method differs',async()=>{
 let count=0;const actions=[];
 const {api}=fixture({reader:async()=>proof({verifiedAtSec:NOW-10+(count++),method:count===1?'totp':'mfa/phone'}),
 operation:async x=>{actions.push(x);return accept;}});
 assert.equal((await api.execute(request())).ok,true);
 assert.equal((await api.execute(request())).ok,true);
 assert.equal(actions[0].eventKey,actions[1].eventKey);
});
test('shared-unique ledger rejects replay across tenants, operations and proof references',async()=>{
 const ids=new Set();const {api}=fixture({reader:async x=>proof({proofReference:x.proofReference}),operation:async x=>{
  if(ids.has(x.eventKey))return deny;ids.add(x.eventKey);return accept;
 }});
 assert.deepEqual(await api.execute(request()),accept);
 assert.deepEqual(await api.execute(request({action:'billing',organizationId:SITE})),deny);
 assert.deepEqual(await api.execute(request({proofReference:REF2,action:'members'})),deny);
 assert.equal(ids.size,1);
});
test('caller cannot supply event id, HMAC, claims, role, proof or JWT metadata',async()=>{
 const {api,state}=fixture();
 for(const extra of [{eventId:ID2},{eventKey:'f'.repeat(64)},{sessionId:SID},
  {verifiedAtSec:NOW},{jwt:'fake'},{role:'postgres'},{user_metadata:{role:'admin'}},
  {sql:'DROP TABLE auth.sessions'}])assert.deepEqual(await api.execute(request(extra)),deny);
 assert.equal(state.lookups.length,0);assert.equal(state.actions.length,0);
});
test('unknown action, bad proof reference, invalid tenant/site refuse before read',async()=>{
 const {api,state}=fixture();
 for(const x of [{action:'superadmin'},{proofReference:'bad'},{organizationId:'bad'},
  {siteId:'bad'},{proofReference:null}])assert.deepEqual(await api.execute(request(x)),deny);
 assert.equal(state.lookups.length,0);
});
test('event IDs must be v4 UUID and backend-bound to successful verification',async()=>{
 for(const mod of [{eventId:'not-a-uuid'},{eventId:'11111111-1111-1111-8111-111111111111'},
  {eventId:'11111111-1111-4111-0111-111111111111'},
  {eventIdBoundToVerification:false}]){
  const {api,state}=fixture({reader:async()=>proof(mod)});
  assert.deepEqual(await api.execute(request()),deny);assert.equal(state.actions.length,0);
 }
});
test('exact proofReference binding prevents borrowed event references',async()=>{
 const {api,state}=fixture({reader:async()=>proof({proofReference:REF2})});
 assert.deepEqual(await api.execute(request()),deny);assert.equal(state.actions.length,0);
});
test('different subject and session are denied regardless of valid event ID',async()=>{
 for(const mod of [{subject:ORG},{sessionId:SITE},{subject:null},{sessionId:123}]){
  const {api,state}=fixture({reader:async()=>proof(mod)});
  assert.deepEqual(await api.execute(request()),deny);assert.equal(state.actions.length,0);
 }
});
test('trusted provider must attest factor, provenance and authorized binding',async()=>{
 for(const field of ['verified','factorOwnershipVerified','provenanceReviewed','sessionBoundByAuthorizedFlow']){
  const {api,state}=fixture({reader:async()=>proof({[field]:false})});
  assert.deepEqual(await api.execute(request()),deny);assert.equal(state.actions.length,0);
 }
});
test('unknown MFA method, extra fields, null and arrays are denied',async()=>{
 for(const p of [proof({method:'email'}),proof({user_metadata:{role:'owner'}}),null,[],{...proof(),issuer:'unknown'}]){
  const {api,state}=fixture({reader:async()=>p});
  assert.deepEqual(await api.execute(request()),deny);assert.equal(state.actions.length,0);
 }
});
test('stale, expired, future and invalid checked timestamps fail closed',async()=>{
 for(const fields of [{checkedAtSec:NOW-3},{checkedAtSec:NOW+1},
  {verifiedAtSec:NOW-301},{verifiedAtSec:NOW+1},{verifiedAtSec:0}]){
  const {api,state}=fixture({reader:async()=>proof(fields)});
  assert.deepEqual(await api.execute(request()),deny);assert.equal(state.actions.length,0);
 }
});
test('provider outage and invalid clock never execute business callback',async()=>{
 const a=fixture({reader:async()=>{throw Error('issuer offline');}});
 assert.deepEqual(await a.api.execute(request()),deny);assert.equal(a.state.actions.length,0);
 for(const clock of [()=>0,()=>undefined,()=>NaN,()=>{throw Error('clock');}]){
  const b=fixture({clock});assert.deepEqual(await b.api.execute(request()),deny);
  assert.equal(b.state.actions.length,0);
 }
});
test('issuer delay greater than two seconds causes a fail-closed decision',async()=>{
 let clock=NOW;
 const f=fixture({clock:()=>clock,reader:async()=>{clock=NOW+3;return proof();}});
 assert.deepEqual(await f.api.execute(request()),deny);assert.equal(f.state.actions.length,0);
});
test('business provider failure or forged production approval cannot pass',async()=>{
 const a=fixture({operation:async()=>{throw Error('lost commit result');}});
 assert.deepEqual(await a.api.execute(request()),deny);
 for(const result of [{...accept,productionAuthorized:true},{...accept,formalV67Pass:1},
  {...accept,extra:true},{...accept,atomicCommitConfirmed:false},null]){
  const f=fixture({operation:async()=>result});assert.deepEqual(await f.api.execute(request()),deny);
 }
});
test('mutating supplied HMAC key cannot rotate the trusted event identity',async()=>{
 const secret=Buffer.alloc(32,21),copy=Buffer.from(secret);
 const f=fixture({key:secret});secret.fill(0);
 assert.deepEqual(await f.api.execute(request()),accept);
 assert.equal(f.state.actions[0].eventKey,hmac(ID1,copy));
});
test('readiness flags real issuer, Auth, business, revocation and publication as unavailable',()=>{
 assert.deepEqual(fixture().api.readiness,{
  labOnly:true,realTrustedEventIssuerConnected:false,immutableEventIssuanceVerifiedInQA:false,
  liveAuthSessionReaderConnected:false,revocationLinearizable:false,
  businessOperationReal:false,productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 });
});
test('backend source cannot access network, credentials, SQL, session or production',()=>{
 const source=readFileSync(resolve(__dirname,'../server/v125-unique-verification-gateway.cjs'),'utf8');
 for(const forbidden of ['process.env',"require('pg')",'fetch(','SELECT *',
  'GRANT SELECT','CREATE ROLE','service_role','SECURITY DEFINER',
  'productionAuthorized:true','console.log('])assert.equal(source.includes(forbidden),false,forbidden);
});