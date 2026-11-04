'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHmac}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {createV121TrustedMfaProofGateway}=require('../server/v121-trusted-mfa-proof-gateway.cjs');
const NOW=2000000000;
const SUBJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REF='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SECRET=Buffer.alloc(32,17);
const accepted=Object.freeze({ok:true,atomicCommitConfirmed:true,productionAuthorized:false,formalV67Pass:0});
const denied=Object.freeze({ok:false,atomicCommitConfirmed:false,productionAuthorized:false,formalV67Pass:0});
function proof(extra={}){
 return {checkedAtSec:NOW,factorOwnershipVerified:true,method:'totp',
  provenanceReviewed:true,sessionBoundByAuthorizedFlow:true,sessionId:SESSION,
  subject:SUBJECT,verified:true,verifiedAtSec:NOW-10,...extra};
}
const request=(extra={})=>({action:'publish',organizationId:ORG,proofReference:REF,siteId:SITE,...extra});
function fixture({getProof,operation,now=()=>NOW,secret=SECRET}={}){
 const state={reads:[],calls:[]};
 const readTrustedMfaProof=async input=>{
  state.reads.push(input);
  return getProof?getProof(input,state):proof();
 };
 const runAtomicOperation=async input=>{
  state.calls.push(input);
  return operation?operation(input,state):accepted;
 };
 return {state,api:createV121TrustedMfaProofGateway({
  authenticatedSubject:SUBJECT,authenticatedSessionId:SESSION,
  readTrustedMfaProof,runAtomicOperation,ledgerHmacKey:secret,nowSec:now
 })};
}
function expectedKey(p=proof(),key=SECRET){
 const message=['mg-v109-mfa-event-v1',SUBJECT,SESSION,p.method,p.verifiedAtSec].join('|');
 return createHmac('sha256',key).update(message).digest('hex');
}
test('V121 constructor requires strong shared HMAC, server identity and injected providers',()=>{
 assert.throws(()=>createV121TrustedMfaProofGateway(),TypeError);
 assert.throws(()=>createV121TrustedMfaProofGateway({authenticatedSubject:SUBJECT}),TypeError);
 assert.throws(()=>fixture({secret:Buffer.alloc(8)}),TypeError);
 assert.throws(()=>fixture({secret:'not-a-secret'}),TypeError);
});
test('V121 readiness remains backend-only and explicitly NO_GO',()=>{
 assert.deepEqual(fixture().api.readiness,{
  backendOnly:true,liveProofProviderIntegrated:false,realSessionRevocationVerified:false,
  businessOperationIntegrated:false,productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 });
});
test('server resolves proof with authenticated subject and session, never caller-supplied claims',async()=>{
 const {api,state}=fixture();
 assert.deepEqual(await api.execute(request()),accepted);
 assert.deepEqual(state.reads,[{proofReference:REF,subject:SUBJECT,sessionId:SESSION}]);
 assert.equal(state.calls.length,1);
 assert.deepEqual(state.calls[0],{
  action:'publish',eventKey:expectedKey(),organizationId:ORG,
  sessionId:SESSION,siteId:SITE,subject:SUBJECT,verifiedAtSec:NOW-10
 });
 assert.equal(Object.isFrozen(state.calls[0]),true);
 assert.equal(state.calls[0].eventKey.length,64);
});
test('the HMAC event key follows V109 and never varies by action, tenant or site',async()=>{
 const state=[];
 const {api}=fixture({operation:async x=>{state.push(x);return accepted;}});
 await api.execute(request());
 await api.execute(request({action:'members',organizationId:SITE,siteId:ORG}));
 await api.execute(request({action:'billing',siteId:ORG}));
 assert.equal(state.length,3);
 assert.deepEqual(state.map(x=>x.eventKey),[expectedKey(),expectedKey(),expectedKey()]);
});
test('replay across actions and tenants is rejected by one shared ledger key',async()=>{
 const keys=new Set();
 const {api}=fixture({operation:async x=>{
  if(keys.has(x.eventKey))return denied;
  keys.add(x.eventKey);return accepted;
 }});
 assert.deepEqual(await api.execute(request()),accepted);
 assert.deepEqual(await api.execute(request({action:'billing',organizationId:SITE})),denied);
 assert.equal(keys.size,1);
});
test('caller cannot supply eventKey, subject, sessionId, JWT or extra arbitrary SQL',async()=>{
 const {api,state}=fixture();
 for(const extra of [
  {eventKey:'f'.repeat(64)},{subject:SUBJECT},{sessionId:SESSION},
  {jwt:'fake.jwt'},{role:'postgres'},{sql:'COMMIT'},{verifiedAtSec:NOW}
 ])assert.deepEqual(await api.execute(request(extra)),denied);
 assert.equal(state.reads.length,0);
 assert.equal(state.calls.length,0);
});
test('invalid proof reference, action, organization or site is denied without resolution',async()=>{
 const {api,state}=fixture();
 for(const extra of [
  {proofReference:'not-an-opaque-id'},{action:'admin'},
  {organizationId:'invalid'},{siteId:'invalid'},{proofReference:null}
 ])assert.deepEqual(await api.execute(request(extra)),denied);
 assert.equal(state.reads.length,0);
});
test('untrusted or mismatched subject/session proof cannot consume an event',async()=>{
 for(const forged of [{subject:ORG},{sessionId:SITE},{subject:'not-a-uuid'},{sessionId:null}]){
  const {api,state}=fixture({getProof:async()=>proof(forged)});
  assert.deepEqual(await api.execute(request()),denied);
  assert.equal(state.calls.length,0);
 }
});
test('proof provenance, ownership, authorization flow and verification are mandatory',async()=>{
 for(const field of ['factorOwnershipVerified','provenanceReviewed','sessionBoundByAuthorizedFlow','verified']){
  const {api,state}=fixture({getProof:async()=>proof({[field]:false})});
  assert.deepEqual(await api.execute(request()),denied);
  assert.equal(state.calls.length,0);
 }
});
test('unreviewed MFA methods, extra proof fields or non-object proof fail closed',async()=>{
 for(const p of [proof({method:'sms'}),proof({access_token:'abc'}),null,[],{...proof(),unknown:true}]){
  const {api,state}=fixture({getProof:async()=>p});
  assert.deepEqual(await api.execute(request()),denied);
  assert.equal(state.calls.length,0);
 }
});
test('proof checkedAt must be fresh and verifiedAt within 300 second window',async()=>{
 for(const bad of [
  {checkedAtSec:NOW-3},{checkedAtSec:NOW+1},
  {verifiedAtSec:NOW-301},{verifiedAtSec:NOW+1},
  {verifiedAtSec:0},{checkedAtSec:0}
 ]){
  const {api,state}=fixture({getProof:async()=>proof(bad)});
  assert.deepEqual(await api.execute(request()),denied);
  assert.equal(state.calls.length,0);
 }
});
test('failed proof provider and malformed wall clock never call the atomic DB provider',async()=>{
 const {api,state}=fixture({getProof:async()=>{throw Error('trusted proof service unavailable');}});
 assert.deepEqual(await api.execute(request()),denied);
 assert.equal(state.calls.length,0);
 for(const now of [()=>0,()=>undefined,()=>3.5,()=>{throw Error('clock unavailable');}]){
  const x=fixture({now});
  assert.deepEqual(await x.api.execute(request()),denied);
  assert.equal(x.state.calls.length,0);
 }
});
test('proof expiry during asynchronous provider delay is denied before atomic execution',async()=>{
 let t=NOW;
 const {api,state}=fixture({
  now:()=>t,
  getProof:async()=>{t=NOW+4;return proof();}
 });
 assert.deepEqual(await api.execute(request()),denied);
 assert.equal(state.calls.length,0);
});
test('proof becoming stale between validation and DB handoff denies before side effects',async()=>{
 let ticks=0;
 const {api,state}=fixture({now:()=>{ticks++;return ticks>=2?NOW+3:NOW;}});
 assert.deepEqual(await api.execute(request()),denied);
 assert.equal(state.calls.length,0);
});
test('malformed provider response or fake production authorization never promotes success',async()=>{
 for(const result of [
  {ok:true,atomicCommitConfirmed:true,productionAuthorized:true,formalV67Pass:0},
  {ok:true,atomicCommitConfirmed:true,productionAuthorized:false,formalV67Pass:32},
  {ok:true,atomicCommitConfirmed:false,productionAuthorized:false,formalV67Pass:0},
  {...accepted,unexpected:true},undefined
 ]){
  const {api}=fixture({operation:async()=>result});
  assert.deepEqual(await api.execute(request()),denied);
 }
});
test('atomic operation errors deny, without disclosing proof or shared HMAC key',async()=>{
 const {api}=fixture({operation:async()=>{throw Error('transaction unavailable');}});
 assert.deepEqual(await api.execute(request()),denied);
 assert.equal(JSON.stringify(api).includes(expectedKey()),false);
});
test('HMAC key is copied at construction so mutation does not change derived event identity',async()=>{
 const key=Buffer.alloc(32,11),copy=Buffer.from(key);
 const {api,state}=fixture({secret:key});
 key.fill(0);
 assert.deepEqual(await api.execute(request()),accepted);
 assert.equal(state.calls[0].eventKey,expectedKey(proof(),copy));
});
test('source stays offline with no Supabase/PG client imports, secrets, dynamic SQL or production GO',()=>{
 const code=readFileSync(resolve(__dirname,'../server/v121-trusted-mfa-proof-gateway.cjs'),'utf8');
 for(const disallowed of ["require('pg')","require('@supabase/supabase-js')",
  'process.env','fetch(','SELECT * FROM auth.sessions','CREATE ROLE',
  'SECURITY DEFINER','service_role','productionAuthorized:true','console.log('])
  assert.equal(code.includes(disallowed),false,disallowed);
});
