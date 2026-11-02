'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createAtomicMfaRedemptionV109}=require('../server/v109-atomic-mfa-redemption.cjs');
const NOW=2000000000;
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ORG2='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SITE2='ffffffff-ffff-4fff-8fff-ffffffffffff';
const KEY=Buffer.alloc(32,41);
const proof=(p={})=>({
 subject:USER,sessionId:SESSION,method:'totp',
 factorOwnershipVerified:true,provenanceReviewed:true,
 sessionBoundByAuthorizedFlow:true,verified:true,
 checkedAtSec:NOW,verifiedAtSec:NOW-10,...p
});
const session=(p={})=>({
 subject:USER,sessionId:SESSION,active:true,primaryRead:true,
 revocationChecked:true,checkedAtSec:NOW,expiresAtSec:NOW+30,...p
});
const input=(p={})=>({proof:proof(),action:'publish',
 organizationId:ORG,siteId:SITE,signal:undefined,...p});
function make({s={},allowed=true,ledger,clock=()=>NOW,key=KEY,other={}}={}){
 const calls={session:[],resource:[],ledger:[]};
 const consumed=ledger||new Map();
 const ledgerInsert=async q=>{
   calls.ledger.push(q);
   // TEST DOUBLE: map shared by two instances; uniqueness from synchronous
   // insert. This is NOT evidence of real DB transactions or isolation.
   if(consumed.has(q.eventKey))return {
     inserted:false,committed:true,shared:true,storedUntilSec:consumed.get(q.eventKey)
   };
   consumed.set(q.eventKey,q.consumeUntilSec);
   return {inserted:true,committed:true,shared:true,storedUntilSec:q.consumeUntilSec};
 };
 const props={
   readPrimarySession:async q=>{calls.session.push(q);return session(s);},
   authorizeResource:async q=>{calls.resource.push(q);return allowed;},
   consumeEventAtomically:ledgerInsert,
   ledgerHmacKey:key,nowSec:clock,...other
 };
 return {gate:createAtomicMfaRedemptionV109(props),calls,consumed};
}
test('contract requires three audited backends, a shared HMAC key and bounded clocks',()=>{
 for(const changes of [
 {readPrimarySession:null},{authorizeResource:null},
 {consumeEventAtomically:null},{ledgerHmacKey:Buffer.alloc(31)},
 {ledgerHmacKey:'hard-coded-password'},
 {nowSec:null},{maxProofAgeSec:0},{maxProofAgeSec:4},
 {maxFactorAgeSec:59},{maxFactorAgeSec:301}
 ]){
  assert.throws(()=>createAtomicMfaRedemptionV109({
   readPrimarySession:async()=>session(),authorizeResource:async()=>true,
   consumeEventAtomically:async()=>({}),
   ledgerHmacKey:KEY,...changes
  }),TypeError);
 }
});
test('synthetic success consumes event but never enables production',async()=>{
 const {gate,calls}=make();
 const result=await gate.redeem(input());
 assert.deepEqual(result,{
   ok:true,mode:'INJECTED_ATOMIC_LEDGER_CONTRACT',
   eventRedeemed:true,productionAuthorized:false,formalV67Pass:0
 });
 assert.deepEqual(calls.session.map(x=>x.subject),[USER]);
 assert.deepEqual(calls.resource.map(x=>x.action),['publish']);
 assert.equal(calls.ledger.length,1);
 assert.ok(Object.isFrozen(calls.ledger[0]));
 assert.equal(calls.ledger[0].eventKey.length,64);
 assert.equal(calls.ledger[0].eventKey.includes(USER),false);
});
test('two separate server objects sharing an atomic provider accept only one',async()=>{
 const shared=new Map();
 const a=make({ledger:shared}),b=make({ledger:shared});
 const pair=await Promise.all([a.gate.redeem(input()),b.gate.redeem(input())]);
 assert.equal(pair.filter(x=>x.ok).length,1);
 assert.equal(pair.filter(x=>!x.ok).length,1);
 assert.equal(shared.size,1);
});
test('a consumed MFA event cannot authorize a different tenant, site or action',async()=>{
 const shared=new Map();
 const a=make({ledger:shared}),b=make({ledger:shared});
 assert.equal((await a.gate.redeem(input())).ok,true);
 for(const p of [
   {organizationId:ORG2},{siteId:SITE2},{action:'members'},{action:'billing'}
 ]){
  assert.equal((await b.gate.redeem(input(p))).ok,false);
 }
 assert.equal(shared.size,1);
});
test('distinct MFA verification moments create separate keys, same moment fails closed',async()=>{
 const shared=new Map();
 const gate=make({ledger:shared}).gate;
 assert.equal((await gate.redeem(input())).ok,true);
 assert.equal((await gate.redeem(input({proof:proof({verifiedAtSec:NOW-10})}))).ok,false);
 assert.equal((await gate.redeem(input({proof:proof({verifiedAtSec:NOW-9})}))).ok,true);
 assert.equal(shared.size,2);
});
test('HMAC must be stable between servers with same key',async()=>{
 const a=make(),b=make();
 await a.gate.redeem(input());await b.gate.redeem(input());
 assert.deepEqual([...a.consumed.keys()],[...b.consumed.keys()]);
});
test('each server using a different HMAC key cannot share the same identity',async()=>{
 const a=make({key:Buffer.alloc(32,41)});
 const b=make({key:Buffer.alloc(32,42)});
 await a.gate.redeem(input());await b.gate.redeem(input());
 assert.notDeepEqual([...a.consumed.keys()],[...b.consumed.keys()]);
});
test('an extra client-provided role, token, metadata, proofKey or action denied',async()=>{
 const {gate,calls}=make();
 for(const key of ['role','user_metadata','jwt','request','storeKey','admin','headers']){
  assert.equal((await gate.redeem({...input(),[key]:'superadmin'})).ok,false);
 }
 assert.equal(calls.session.length,0);
});
test('invalid methods, stale proofs, fake provenance or changed subject deny early',async()=>{
 const invalid=[
  {verified:false},{factorOwnershipVerified:false},
  {provenanceReviewed:false},{sessionBoundByAuthorizedFlow:false},
  {subject:'bad'},{sessionId:'other'},{method:'webauthn'},
  {checkedAtSec:NOW-3},{checkedAtSec:NOW+1},
  {verifiedAtSec:NOW-301},{verifiedAtSec:NOW+1},
  {checkedAtSec:NOW,verifiedAtSec:0},
  {secret:'should-not-arrive'},{role:'admin'}
 ];
 for(const p of invalid){
  const {gate,calls}=make();
  assert.equal((await gate.redeem(input({proof:proof(p)}))).ok,false,JSON.stringify(p));
  assert.equal(calls.session.length,0);
 }
});
test('invalid route action, organization or site denied before reading session',async()=>{
 const values=[{action:'delete'},{action:'root'},{action:'PUBLISH'},
 {organizationId:'not-a-uuid'},{siteId:'not-a-uuid'},
 {siteId:SITE,signal:'fake'},{signal:null}];
 for(const p of values){
  const {gate,calls}=make();
  assert.equal((await gate.redeem(input(p))).ok,false);
  assert.equal(calls.session.length,0);
 }
});
test('cancelled request denied before or after the first live lookup',async()=>{
 const x=new AbortController();x.abort();
 const {gate,calls}=make();
 assert.equal((await gate.redeem(input({signal:x.signal}))).ok,false);
 assert.equal(calls.session.length,0);
 const y=new AbortController();
 const second=make({other:{readPrimarySession:async()=>{y.abort();return session();}}});
 assert.equal((await second.gate.redeem(input({signal:y.signal}))).ok,false);
});
test('session MUST be live and authoritatively read; signature alone not enough',async()=>{
 for(const p of [{active:false},{primaryRead:false},{revocationChecked:false},
  {subject:'other'},{sessionId:'other'},{checkedAtSec:NOW-3},
  {checkedAtSec:NOW+1},{expiresAtSec:NOW},{expiresAtSec:0},
  {extra:'untrusted'}]){
  const {gate,calls}=make({s:p});
  assert.equal((await gate.redeem(input())).ok,false,JSON.stringify(p));
  assert.equal(calls.resource.length,0);
 }
});
test('fresh current resource authorization must be strictly true',async()=>{
 for(const allowed of [false,null,{},'true',0]){
  const {gate,calls}=make({allowed});
  assert.equal((await gate.redeem(input())).ok,false);
  assert.equal(calls.ledger.length,0);
 }
});
test('if a primary lookup or resource lookup throws, ledger never burns event',async()=>{
 for(const key of ['readPrimarySession','authorizeResource']){
  const {gate,calls}=make({other:{[key]:async()=>{throw Error('SECRET!')}}});
  assert.equal((await gate.redeem(input())).ok,false);
  assert.equal(calls.ledger.length,0);
 }
});
test('atomic provider throwing or falsely claiming inserted is fail closed',async()=>{
 for(const value of [
  undefined,null,{},true,
  {committed:true,inserted:false,shared:true,storedUntilSec:NOW+300},
  {committed:false,inserted:true,shared:true,storedUntilSec:NOW+300},
  {committed:true,inserted:true,shared:false,storedUntilSec:NOW+300},
  {committed:true,inserted:true,shared:true,storedUntilSec:NOW+50},
  {committed:true,inserted:true,shared:true,storedUntilSec:NOW+300,role:'admin'}
 ]){
  const {gate}=make({other:{consumeEventAtomically:async()=>value}});
  assert.equal((await gate.redeem(input())).ok,false,JSON.stringify(value));
 }
 const {gate}=make({other:{consumeEventAtomically:async()=>{throw Error('DB deadlock')}}});
 assert.equal((await gate.redeem(input())).ok,false);
});
test('ledger tombstone retains fingerprint past full MFA eligibility window',async()=>{
 const {gate,calls}=make();
 assert.equal((await gate.redeem(input())).ok,true);
 assert.equal(calls.ledger[0].consumeUntilSec,NOW-10+300+10);
});
test('revoked primary session denies with a fresh signed MFA proof',async()=>{
 const {gate}=make({s:{active:false}});
 const outcome=await gate.redeem(input());
 assert.equal(outcome.ok,false);
 assert.equal(outcome.productionAuthorized,false);
});
test('provider must deny if authoritative read expires while awaits complete',async()=>{
 let clock=NOW;
 const gate=make({clock:()=>clock,other:{
  authorizeResource:async()=>{clock+=3;return true;}
 }}).gate;
 assert.equal((await gate.redeem(input())).ok,false);
});
test('failed store write never transforms to a business execution approval',async()=>{
 const {gate}=make({other:{consumeEventAtomically:async()=>({
  committed:false,inserted:false,shared:false,storedUntilSec:NOW+300
 })}});
 const r=await gate.redeem(input());
 assert.deepEqual(r,{ok:false,productionAuthorized:false,formalV67Pass:0});
});
test('readiness explicitly refuses all database and production claims',()=>{
 assert.deepEqual(make().gate.readiness,{
 mode:'INJECTED_ATOMIC_LEDGER_OFFLINE',primarySessionConnected:false,
 distributedStoreConnected:false,sharedKeyOperationallyVerified:false,
 businessTransactionIntegrated:false,productionAuthorized:false,
 formalV67Pass:0,decision:'NO_GO'
 });
});
test('source includes no SQL, network, secrets, raw tokens, user metadata or logging',()=>{
 const text=fs.readFileSync(path.resolve(__dirname,
  '../server/v109-atomic-mfa-redemption.cjs'),'utf8');
 for(const forbidden of [
  'fetch(','createClient(','console.log(','console.error(','writeFile(',
  'require(\'pg\')','require(\'@supabase/supabase-js\')',
  'CREATE TABLE','INSERT INTO','GRANT SELECT','SECURITY DEFINER',
  'setTimeout(','setInterval('
 ])assert.equal(text.includes(forbidden),false,forbidden);
});
