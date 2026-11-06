'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createMfaRowCorroboratorV101}=require('../server/v101-mfa-row-corroboration.cjs');
const {createVerifiedMfaAmrProvenanceV100}=require('../server/v100-mfa-amr-provenance.cjs');
const NOW=2000000000;
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_SESSION='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TOK='signed.mock.token.20261102';
const IN=(m='totp')=>({subject:USER,sessionId:SESSION,method:m,verifiedAtSec:NOW-20});
const ROW=(p={})=>({
 subject:USER,sessionId:SESSION,method:'totp',
 createdAtSec:NOW-20000,updatedAtSec:NOW-20,checkedAtSec:NOW-1,
 primaryRead:true,sessionOwnershipVerified:true,...p
});
const CHALLENGE=(p={})=>({
 subject:USER,sessionId:SESSION,method:'totp',verifiedAtSec:NOW-21,
 checkedAtSec:NOW-1,verified:true,factorOwnershipVerified:true,
 provenanceReviewed:true,sessionBoundByAuthorizedFlow:true,...p
});
function fixture(mods={}){
 const calls={row:0,challenge:0,params:null};
 const providers={
  nowSec:()=>NOW,
  readPrimaryAmrRow:async p=>{calls.row++;calls.params=p;return ROW();},
  readVerifiedChallenge:async()=>{calls.challenge++;return CHALLENGE();},
  ...mods
 };
 return {audit:createMfaRowCorroboratorV101(providers),calls};
}
test('requires two independent trusted callbacks and narrow policy',()=>{
 assert.throws(()=>createMfaRowCorroboratorV101(),TypeError);
 assert.throws(()=>createMfaRowCorroboratorV101({readPrimaryAmrRow:async()=>ROW()}),TypeError);
 for(const bad of [
  {readPrimaryAmrRow:null},{readVerifiedChallenge:null},
  {maxObservationAgeSec:0},{maxObservationAgeSec:5},
  {maxClockSkewSec:-1},{maxClockSkewSec:6},{nowSec:null}
 ]){
  assert.throws(()=>createMfaRowCorroboratorV101({
   readPrimaryAmrRow:async()=>ROW(),
   readVerifiedChallenge:async()=>CHALLENGE(),...bad
  }),TypeError);
 }
});
test('matching updated_at, valid challenge and session link yield trusted V100 event',async()=>{
 const {audit,calls}=fixture();
 const out=await audit.readAuthoritativeMfaEvent(IN());
 assert.deepEqual(out,{
  checkedAtSec:NOW,freshnessSemanticsVerified:true,method:'totp',
  origin:'INDEPENDENT_AUTH_VERIFICATION_EVENT',
  sessionId:SESSION,subject:USER,verifiedAtSec:NOW-20
 });
 assert.deepEqual([calls.row,calls.challenge],[1,1]);
 assert.deepEqual(Object.keys(calls.params).sort(),['method','sessionId','signal','subject']);
 assert.ok(Object.isFrozen(out));assert.ok(Object.isFrozen(calls.params));
});
test('repeat verification updates updated_at while created_at remains old',async()=>{
 const {audit}=fixture({readPrimaryAmrRow:async()=>ROW({createdAtSec:NOW-123456,updatedAtSec:NOW-20})});
 assert.equal((await audit.readAuthoritativeMfaEvent(IN()))?.verifiedAtSec,NOW-20);
});
test('created_at cannot be substituted for last MFA verification',async()=>{
 const {audit,calls}=fixture({readPrimaryAmrRow:async()=>ROW({
  createdAtSec:NOW-20,updatedAtSec:NOW-120
 })});
 assert.equal(await audit.readAuthoritativeMfaEvent(IN()),null);
 assert.equal(calls.challenge,0);
});
test('a raw DB row cannot prove completed MFA challenge',async()=>{
 for(const change of [
   {verified:false},{factorOwnershipVerified:false},
   {provenanceReviewed:false},{sessionBoundByAuthorizedFlow:false},
   {sessionBoundByAuthorizedFlow:'true'},
   {verifiedAtSec:null}
 ]){
  const {audit}=fixture({readVerifiedChallenge:async()=>CHALLENGE(change)});
  assert.equal(await audit.readAuthoritativeMfaEvent(IN()),null,JSON.stringify(change));
 }
});
test('challenge has no intrinsic session id; mismatch is rejected',async()=>{
 for(const change of [
   {sessionId:OTHER_SESSION},{subject:OTHER},
   {method:'mfa/phone'},{verifiedAtSec:NOW-25}
 ]){
  const {audit}=fixture({readVerifiedChallenge:async()=>CHALLENGE(change)});
  assert.equal(await audit.readAuthoritativeMfaEvent(IN()),null,JSON.stringify(change));
 }
});
test('read must prove session ownership independently, not just a matching UUID',async()=>{
 for(const change of [
   {subject:OTHER},{sessionId:OTHER_SESSION},
   {primaryRead:false},{sessionOwnershipVerified:false},
   {sessionOwnershipVerified:'yes'}, {method:'mfa/phone'}
 ]){
  const {audit,calls}=fixture({readPrimaryAmrRow:async()=>ROW(change)});
  assert.equal(await audit.readAuthoritativeMfaEvent(IN()),null);
  assert.equal(calls.challenge,0);
 }
});
test('reject stale, future, unbounded or nonsensical update and check times',async()=>{
 for(const change of [
  {createdAtSec:NOW},{updatedAtSec:NOW+1},
  {createdAtSec:NOW-10,updatedAtSec:NOW-20},
  {updatedAtSec:NOW-19},{updatedAtSec:'2000000000'},
  {checkedAtSec:NOW-3},{checkedAtSec:NOW+1},
  {checkedAtSec:null},{createdAtSec:0}
 ]){
  const {audit}=fixture({readPrimaryAmrRow:async()=>ROW(change)});
  assert.equal(await audit.readAuthoritativeMfaEvent(IN()),null,JSON.stringify(change));
 }
});
test('reject stale or future challenge read, and gap above three seconds',async()=>{
 for(const change of [
  {checkedAtSec:NOW-3},{checkedAtSec:NOW+1},
  {verifiedAtSec:NOW-24},{verifiedAtSec:NOW+1},
  {verifiedAtSec:0},{checkedAtSec:'2026-11-02'}
 ]){
  const {audit}=fixture({readVerifiedChallenge:async()=>CHALLENGE(change)});
  assert.equal(await audit.readAuthoritativeMfaEvent(IN()),null,JSON.stringify(change));
 }
});
test('fail closed on extra unexpected fields from Auth SQL or audit providers',async()=>{
 for(const change of [{ip:'127.0.0.1'},{token:'SECRET'},{challengeId:'private'},
  {factorSecret:'private'},{raw_user_meta_data:{role:'admin'}}]){
  assert.equal(await fixture({readPrimaryAmrRow:async()=>ROW(change)}).audit.readAuthoritativeMfaEvent(IN()),null);
  assert.equal(await fixture({readVerifiedChallenge:async()=>CHALLENGE(change)}).audit.readAuthoritativeMfaEvent(IN()),null);
 }
});
test('canonical phone method is mfa/phone not plain phone',async()=>{
 const {audit}=fixture({
  readPrimaryAmrRow:async()=>ROW({method:'mfa/phone'}),
  readVerifiedChallenge:async()=>CHALLENGE({method:'mfa/phone'})
 });
 const out=await audit.readAuthoritativeMfaEvent(IN('mfa/phone'));
 assert.equal(out?.method,'mfa/phone');
 assert.equal(await audit.readAuthoritativeMfaEvent(IN('phone')),null);
});
test('input does not accept a bearer token, extra fields or unknown methods',async()=>{
 const {audit,calls}=fixture();
 for(const x of [
   null,[],{},'request',
   {...IN(),role:'SUPERADMIN'},
   {...IN(),accessToken:TOK},
   {...IN(),method:'phone'}, {...IN(),method:'oauth'},
   {...IN(),sessionId:'invalid'},
   {...IN(),verifiedAtSec:NOW+1},
   {...IN(),verifiedAtSec:NOW-400},
   {...IN(),signal:'fake'}
 ]){
  assert.equal(await audit.readAuthoritativeMfaEvent(x),null);
 }
 assert.equal(calls.row,0);
});
test('rejected abort signal prevents providers from being called',async()=>{
 const ctrl=new AbortController();ctrl.abort();
 const {audit,calls}=fixture();
 assert.equal(await audit.readAuthoritativeMfaEvent({...IN(),signal:ctrl.signal}),null);
 assert.equal(calls.row,0);assert.equal(calls.challenge,0);
});
test('cancelled or failing remote adapter drops evidence, never raises exception',async()=>{
 for(const phase of ['readPrimaryAmrRow','readVerifiedChallenge']){
  const ctr=new AbortController();
  const changes={[phase]:async()=>{ctr.abort();return phase==='readPrimaryAmrRow'?ROW():CHALLENGE();}};
  const {audit}=fixture(changes);
  assert.equal(await audit.readAuthoritativeMfaEvent({...IN(),signal:ctr.signal}),null);
  const f=fixture({[phase]:async()=>{throw Error('PRIVATE_AUTH_LOG');}});
  assert.equal(await f.audit.readAuthoritativeMfaEvent(IN()),null);
 }
});
test('clock invalid or monotonic progress beyond observation bound fails closed',async()=>{
 const f=fixture({nowSec:()=>NaN});
 assert.equal(await f.audit.readAuthoritativeMfaEvent(IN()),null);
 let t=NOW;
 const f2=fixture({nowSec:()=>t,readVerifiedChallenge:async()=>{t+=6;return CHALLENGE();}});
 assert.equal(await f2.audit.readAuthoritativeMfaEvent(IN()),null);
});
test('V101 evidence plugged into V100 signed AMR verifier; JWT source remains independent',async()=>{
 const {audit}=fixture();
 const v100=createVerifiedMfaAmrProvenanceV100({
  nowSec:()=>NOW,
  verifySignedJwtAmr:async()=>({
   verified:true,issuerVerified:true,audienceVerified:true,aal:'aal2',
   subject:USER,sessionId:SESSION,exp:NOW+90,
   amr:[{method:'totp',timestamp:NOW-20}]
  }),
  readAuthoritativeMfaEvent:audit.readAuthoritativeMfaEvent
 });
 const proof=await v100.readAuthoritativeFactor({
   subject:USER,sessionId:SESSION,accessToken:TOK
 });
 assert.equal(proof?.source,'AUTH_SERVER_VERIFIED_MFA');
 assert.equal(proof?.factorConfirmedAtSec,NOW-20);
});
test('V101 denies unknown proof of challenge/session link even if JWT is aal2',async()=>{
 const {audit}=fixture({readVerifiedChallenge:async()=>CHALLENGE({
  sessionBoundByAuthorizedFlow:false
 })});
 const v100=createVerifiedMfaAmrProvenanceV100({
  nowSec:()=>NOW,
  verifySignedJwtAmr:async()=>({
   verified:true,issuerVerified:true,audienceVerified:true,aal:'aal2',
   subject:USER,sessionId:SESSION,exp:NOW+90,
   amr:[{method:'totp',timestamp:NOW-20}]
  }),
  readAuthoritativeMfaEvent:audit.readAuthoritativeMfaEvent
 });
 assert.equal(await v100.readAuthoritativeFactor({
   subject:USER,sessionId:SESSION,accessToken:TOK
 }),null);
});
test('source never opens DB, network or logs secrets; no RLS alteration or migration',()=>{
 const content=fs.readFileSync(path.resolve(__dirname,'../server/v101-mfa-row-corroboration.cjs'),'utf8');
 for(const bad of ['require(\'pg\')','fetch(', 'createClient(', 'execFile(', 'console.log(', 
   'writeFile(', 'setInterval(', 'CREATE POLICY','GRANT SELECT','supabase.auth.',
   'JSON.parse(', 'createServer(']){
   assert.equal(content.includes(bad),false,bad);
 }
});
test('readiness remains NO_GO, with no Supabase connection or formal V67 pass',()=>{
 const {audit}=fixture();
 assert.deepEqual(audit.readiness,{
  mode:'OFFLINE_INDEPENDENT_CHALLENGE_PROOF_REQUIRED',
  supabaseConnected:false,remoteAuthQueried:false,
  challengeSessionLinkProven:false,productionAuthorized:false,
  formalV67Approved:0,decision:'NO_GO'
 });
 assert.ok(Object.isFrozen(audit.readiness));
});
