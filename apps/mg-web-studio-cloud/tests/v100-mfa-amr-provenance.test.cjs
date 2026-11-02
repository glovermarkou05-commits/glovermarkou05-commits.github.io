'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createVerifiedMfaAmrProvenanceV100}=require('../server/v100-mfa-amr-provenance.cjs');
const now=2000000000;
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const second='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const session='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const otherSession='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const token='signed.jwt.with.amr.for.lab';
const input=p=>({subject:actor,sessionId:session,accessToken:token,...p});
const signed=p=>({
 verified:true,issuerVerified:true,audienceVerified:true,aal:'aal2',
 subject:actor,sessionId:session,exp:now+3600,
 amr:[{method:'totp',timestamp:now-30},{method:'password',timestamp:now-600}],
 ...p
});
const event=p=>({
 subject:actor,sessionId:session,method:'totp',
 verifiedAtSec:now-30,checkedAtSec:now-1,
 origin:'INDEPENDENT_AUTH_VERIFICATION_EVENT',freshnessSemanticsVerified:true,
 ...p
});
function setup(override={}){
 const calls={verify:0,event:0,proofArg:null};
 const x={
  nowSec:()=>now,
  verifySignedJwtAmr:async()=>{calls.verify++;return signed();},
  readAuthoritativeMfaEvent:async arg=>{calls.event++;calls.proofArg=arg;return event();},
  ...override
 };
 return {checker:createVerifiedMfaAmrProvenanceV100(x),calls};
}
test('dual verified sources agree on exact method/timestamp/session and produce V98-compatible proof',async()=>{
 const {checker,calls}=setup();
 const result=await checker.readAuthoritativeFactor(input());
 assert.deepEqual(result,{
  subject:actor,sessionId:session,source:'AUTH_SERVER_VERIFIED_MFA',
  aal:'aal2',factorType:'totp',factorVerified:true,
  checkedAtSec:now-1,factorConfirmedAtSec:now-30
 });
 assert.deepEqual([calls.verify,calls.event],[1,1]);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(calls.proofArg));
 assert.deepEqual(Object.keys(calls.proofArg).sort(),
  ['subject','sessionId','method','verifiedAtSec','signal'].sort());
 assert.equal(calls.proofArg.verifiedAtSec,now-30);
});
test('requires both source callbacks and bounded strict settings',()=>{
 assert.throws(()=>createVerifiedMfaAmrProvenanceV100(),TypeError);
 assert.throws(()=>createVerifiedMfaAmrProvenanceV100({
   verifySignedJwtAmr:async()=>signed()
 }),TypeError);
 for(const config of [
  {verifySignedJwtAmr:null,readAuthoritativeMfaEvent:async()=>event()},
  {maxRecentFactorSec:0},{maxRecentFactorSec:301},
  {maxEvidenceAgeSec:0},{maxEvidenceAgeSec:4},{nowSec:null}
 ]) {
  assert.throws(()=>createVerifiedMfaAmrProvenanceV100({
   verifySignedJwtAmr:async()=>signed(),
   readAuthoritativeMfaEvent:async()=>event(),...config
  }),/TypeError/);
 }
});
test('cannot authorize using JWT aal2 without AMR second-factor entry',async()=>{
 for(const amr of [
  [],[{method:'password',timestamp:now-3}],
  [{method:'magiclink',timestamp:now-2}],
  [{method:'oauth',timestamp:now-2}],
 ]){
  const {checker,calls}=setup({verifySignedJwtAmr:async()=>signed({amr})});
  assert.equal(await checker.readAuthoritativeFactor(input()),null);
  assert.equal(calls.event,0);
 }
});
test('reject unsigned JWT AMR, wrong issuer/audience, other session and expired token',async()=>{
 for(const change of [
  {verified:false},{issuerVerified:false},{audienceVerified:false},
  {subject:second},{sessionId:otherSession},{exp:now},{exp:now-10},
  {aal:'aal1'},{aal:null},{verified:'true'}
 ]){
  const {checker,calls}=setup({verifySignedJwtAmr:async()=>signed(change)});
  assert.equal(await checker.readAuthoritativeFactor(input()),null,JSON.stringify(change));
  assert.equal(calls.event,0);
 }
});
test('reject old AMR and future AMR, regardless of aal2',async()=>{
 for(const timestamp of [now-301,now-100000,now+1,0,1.2,'today',null]){
  const {checker,calls}=setup({verifySignedJwtAmr:async()=>signed({
   amr:[{method:'totp',timestamp}]
  })});
  assert.equal(await checker.readAuthoritativeFactor(input()),null,String(timestamp));
  assert.equal(calls.event,0);
 }
});
test('reject duplicate supported MFA methods and ambiguous AMR entries',async()=>{
 for(const amr of [
  [{method:'totp',timestamp:now-20},{method:'totp',timestamp:now-25}],
  [{method:'totp',timestamp:now-20},{method:'phone',timestamp:now-20}],
  [{method:'totp',timestamp:now-20},{method:'totp',timestamp:now-20}],
  Array.from({length:9},()=>({method:'password',timestamp:now-30}))
 ]){
  const {checker,calls}=setup({verifySignedJwtAmr:async()=>signed({amr})});
  assert.equal(await checker.readAuthoritativeFactor(input()),null);
  assert.equal(calls.event,0);
 }
});
test('a valid phone method works if independent verification matches',async()=>{
 const {checker}=setup({
  verifySignedJwtAmr:async()=>signed({amr:[{method:'mfa/phone',timestamp:now-3}]}),
  readAuthoritativeMfaEvent:async()=>event({
   method:'mfa/phone',verifiedAtSec:now-3
  })
 });
 const r=await checker.readAuthoritativeFactor(input());
 assert.equal(r?.factorType,'phone');
 assert.equal(r?.factorConfirmedAtSec,now-3);
});
test('independent event missing or not matching method/time fails closed',async()=>{
 for(const value of [
  null,{},[],false,
  event({method:'phone'}),event({verifiedAtSec:now-31}),
  event({verifiedAtSec:now}),event({sessionId:otherSession}),
  event({subject:second})
 ]){
  const {checker}=setup({readAuthoritativeMfaEvent:async()=>value});
  assert.equal(await checker.readAuthoritativeFactor(input()),null);
 }
});
test('unreviewed auth.mfa_amr_claims created_at semantics do not grant MFA',async()=>{
 for(const variant of [
  event({freshnessSemanticsVerified:false}),
  event({freshnessSemanticsVerified:null}),
  event({origin:'AUTH_MFA_AMR_CREATED_AT_UNVERIFIED'}),
  event({origin:'JWT_AMR_ONLY'}),
  event({source:'not reviewed'})
 ]){
  const {checker}=setup({readAuthoritativeMfaEvent:async()=>variant});
  assert.equal(await checker.readAuthoritativeFactor(input()),null);
 }
});
test('reject stale, future, invalid independent proof check',async()=>{
 for(const checkedAtSec of [now-3,now+1,0,null,'now',1.5]){
  const {checker}=setup({readAuthoritativeMfaEvent:async()=>event({checkedAtSec})});
  assert.equal(await checker.readAuthoritativeFactor(input()),null);
 }
});
test('reject non-exact source result even with plausible attributes',async()=>{
 for(const x of [
  event({user_metadata:{isAdmin:true}}),
  event({ip:'127.0.0.1'}),
  event({ownerApproved:true}),
  event({userId:actor}),
  event({factorId:'abcdef'})
 ]){
  const {checker}=setup({readAuthoritativeMfaEvent:async()=>x});
  assert.equal(await checker.readAuthoritativeFactor(input()),null);
 }
});
test('reject unknown client fields and credentials without contacting verifier',async()=>{
 const {checker,calls}=setup();
 for(const x of [
  null,[],{},'approved',input({aal:'aal2'}),input({role:'admin'}),
  input({user_metadata:{admin:true}}),input({sessionId:otherSession.slice(0,7)}),
  input({accessToken:'x'}),input({accessToken:9}),
  input({accessToken:'x'.repeat(8193)}),
  input({signal:'forged'})
 ])assert.equal(await checker.readAuthoritativeFactor(x),null);
 assert.equal(calls.verify,0);
});
test('abort before verification and during verification or independent lookup',async()=>{
 const c=new AbortController();c.abort();
 const {checker,calls}=setup();
 assert.equal(await checker.readAuthoritativeFactor(input({signal:c.signal})),null);
 assert.equal(calls.verify,0);
 for(const phase of ['verifySignedJwtAmr','readAuthoritativeMfaEvent']){
  const a=new AbortController();
  const replacement=phase==='verifySignedJwtAmr'?signed():event();
  const opts={[phase]:async()=>{a.abort();return replacement;}};
  const {checker:one}=setup(opts);
  assert.equal(await one.readAuthoritativeFactor(input({signal:a.signal})),null);
 }
});
test('all provider errors and invalid clocks fail closed without leaking details',async()=>{
 for(const key of ['verifySignedJwtAmr','readAuthoritativeMfaEvent']){
  const {checker}=setup({[key]:async()=>{throw Error('SECRET-PRIVATE');}});
  const got=await checker.readAuthoritativeFactor(input());
  assert.equal(got,null);
 }
 for(const nowSec of [()=>NaN,()=>0,()=>{throw Error('SECRET');}]){
  const {checker}=setup({nowSec});
  assert.equal(await checker.readAuthoritativeFactor(input()),null);
 }
});
test('no automatic network, SQL, clock timer, JWT decoder, logging or data persistence',()=>{
 const code=fs.readFileSync(path.resolve(__dirname,'../server/v100-mfa-amr-provenance.cjs'),'utf8');
 for(const snippet of ['fetch(', 'require(\'pg\')','createClient(',
   'createServer(', 'writeFile(', 'setInterval(','console.log(',
   'pg_query(', 'select * from ','docker run','JSON.parse(']){
  assert.equal(code.includes(snippet),false,snippet);
 }
});
test('readiness discloses unconnected provider and NO_GO',()=>{
 const {checker}=setup();
 assert.deepEqual(checker.readiness,{
  mode:'OFFLINE_INDEPENDENT_AMR_CORROBORATION_REQUIRED',
  jwtVerifierConnected:false,independentEventConnected:false,
  supabaseSandboxConnected:false,productionAuthorized:false,
  v67Approved:0,decision:'NO_GO'
 });
 assert.ok(Object.isFrozen(checker.readiness));
});
test('proof output cannot be used as a bearer, authorization or user attribute',async()=>{
 const {checker}=setup();
 const result=await checker.readAuthoritativeFactor(input());
 assert.equal(Object.hasOwn(result,'accessToken'),false);
 assert.equal(Object.hasOwn(result,'role'),false);
 assert.equal(Object.hasOwn(result,'organizationId'),false);
 assert.equal(Object.hasOwn(result,'user_metadata'),false);
 assert.equal(Object.hasOwn(result,'claims'),false);
});

test('V100 feeds V98 which feeds V97 with trusted token context and tenant check',async()=>{
 const {createTrustedAssuranceAdapterV98}=require('../server/v98-trusted-assurance-adapter.cjs');
 const {createSensitiveOperationGateV97}=require('../server/v97-sensitive-operation-gate.cjs');
 const {checker}=setup();
 const auth=createTrustedAssuranceAdapterV98({
  nowSec:()=>now,
  verifyBoundJwt:async()=>({
   verified:true,issuerVerified:true,audienceVerified:true,
   subject:actor,sessionId:session,aal:'aal2',iat:now-60,exp:now+600
  }),
  readPrimarySession:async()=>({
   subject:actor,sessionId:session,active:true,primaryRead:true,
   revocationChecked:true,checkedAtSec:now-1,expiresAtSec:now+10
  }),
  readAuthoritativeFactor:checker.readAuthoritativeFactor
 });
 const gate=createSensitiveOperationGateV97({
  nowSec:()=>now,
  verifyAccessToken:async()=>({verified:true,subject:actor}),
  readTrustedAssurance:auth.readTrustedAssurance,
  authorizeResource:async()=>true
 });
 const outcome=await gate.check({
  authorization:'Bearer '+token,
  organizationId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  siteId:'ffffffff-ffff-4fff-8fff-ffffffffffff',action:'publish'
 });
 assert.deepEqual(outcome,{ok:true,stepUp:'verified'});
});
test('full V97/V98/V100 chain refuses unreviewed MFA record semantics',async()=>{
 const {createTrustedAssuranceAdapterV98}=require('../server/v98-trusted-assurance-adapter.cjs');
 const {createSensitiveOperationGateV97}=require('../server/v97-sensitive-operation-gate.cjs');
 const {checker}=setup({
  readAuthoritativeMfaEvent:async()=>event({freshnessSemanticsVerified:false})
 });
 const auth=createTrustedAssuranceAdapterV98({
  nowSec:()=>now,
  verifyBoundJwt:async()=>({
   verified:true,issuerVerified:true,audienceVerified:true,
   subject:actor,sessionId:session,aal:'aal2',iat:now-60,exp:now+600
  }),
  readPrimarySession:async()=>({
   subject:actor,sessionId:session,active:true,primaryRead:true,
   revocationChecked:true,checkedAtSec:now-1,expiresAtSec:now+10
  }),
  readAuthoritativeFactor:checker.readAuthoritativeFactor
 });
 const gate=createSensitiveOperationGateV97({
  nowSec:()=>now,
  verifyAccessToken:async()=>({verified:true,subject:actor}),
  readTrustedAssurance:auth.readTrustedAssurance,
  authorizeResource:async()=>true
 });
 const outcome=await gate.check({
  authorization:'Bearer '+token,
  organizationId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  siteId:'ffffffff-ffff-4fff-8fff-ffffffffffff',action:'publish'
 });
 assert.deepEqual(outcome,{ok:false,status:403,code:'STEP_UP_REQUIRED'});
});
