'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createMfaChallengeSessionTransactionV102}=require('../server/v102-challenge-session-transaction.cjs');
const {createMfaRowCorroboratorV101}=require('../server/v101-mfa-row-corroboration.cjs');
const {createVerifiedMfaAmrProvenanceV100}=require('../server/v100-mfa-amr-provenance.cjs');
const NOW=2000000000;
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_SESSION='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FACTOR='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CHALLENGE='ffffffff-ffff-4fff-8fff-ffffffffffff';
const TOKEN='signed.synthetic.original.jwt';
const NEWTOKEN='signed.synthetic.refreshed.jwt';
const CODE='654321';
const IN=patch=>({
 subject:USER,sessionId:SESSION,factorId:FACTOR,method:'totp',
 accessToken:TOKEN,code:CODE,signal:undefined,...patch
});
const PRE=patch=>({
 subject:USER,sessionId:SESSION,active:true,aal:'aal1',
 verified:true,jwtVerified:true,primaryRead:true,revocationChecked:true,
 checkedAtSec:NOW,...patch
});
const OWNED=patch=>({
 subject:USER,factorId:FACTOR,method:'totp',status:'verified',
 owned:true,checkedAtSec:NOW,...patch
});
const CH=patch=>({
 challengeId:CHALLENGE,factorId:FACTOR,providerIssued:true,
 createdAtSec:NOW-2,...patch
});
const VERIFY=patch=>({
 challengeId:CHALLENGE,factorId:FACTOR,providerVerified:true,
 refreshedAccessToken:NEWTOKEN,verifiedAtSec:NOW-1,...patch
});
const POST=patch=>({
 subject:USER,sessionId:SESSION,active:true,aal:'aal2',
 verified:true,jwtVerified:true,primaryRead:true,revocationChecked:true,
 amrMethod:'totp',amrTimestampSec:NOW-1,checkedAtSec:NOW,exp:NOW+60,
 ...patch
});
function setup(overrides={}){
 const calls={pre:0,factor:0,challenge:0,verify:0,post:0,otp:null,updatedToken:null};
 const props={
  nowSec:()=>NOW,
  readOriginalSession:async q=>{calls.pre++;return PRE();},
  readOwnedFactor:async q=>{calls.factor++;return OWNED();},
  createChallenge:async q=>{calls.challenge++;return CH();},
  verifyChallenge:async q=>{calls.verify++;calls.otp=q.code;return VERIFY();},
  readUpdatedSession:async q=>{calls.post++;calls.updatedToken=q.accessToken;return POST();},
  ...overrides
 };
 return {flow:createMfaChallengeSessionTransactionV102(props),calls};
}
const validQuery=()=>({
 subject:USER,sessionId:SESSION,method:'totp',verifiedAtSec:NOW-1
});
test('produces an empty, unforgeable and once-only in-process receipt',async()=>{
 const {flow,calls}=setup();
 const receipt=await flow.run(IN());
 assert.deepEqual(Object.keys(receipt),[]);
 assert.ok(Object.isFrozen(receipt));
 assert.deepEqual([calls.pre,calls.factor,calls.challenge,calls.verify,calls.post],[1,1,1,1,1]);
 assert.equal(calls.otp,CODE);
 assert.equal(calls.updatedToken,NEWTOKEN);
 const result=flow.consume(receipt,validQuery());
 assert.equal(result?.sessionBoundByAuthorizedFlow,true);
 assert.equal(result?.verifiedAtSec,NOW-1);
 assert.equal(result?.method,'totp');
 assert.ok(Object.isFrozen(result));
 assert.equal(flow.consume(receipt,validQuery()),null);
});
test('no raw OTP, token or challengeId appears in receipt or proof',async()=>{
 const {flow}=setup();const receipt=await flow.run(IN());
 const raw=JSON.stringify(receipt)+JSON.stringify(flow.consume(receipt,validQuery()));
 for(const secret of [CODE,TOKEN,NEWTOKEN,CHALLENGE])assert.equal(raw.includes(secret),false);
});
test('cloned and fake receipts cannot be used',async()=>{
 const {flow}=setup();const receipt=await flow.run(IN());
 for(const fake of [{},Object.freeze({}),JSON.parse(JSON.stringify(receipt)),null,
    'fake',123,[]])assert.equal(flow.consume(fake,validQuery()),null);
 assert.equal(flow.consume(receipt,validQuery())?.verified,true);
});
test('mismatch consumes the receipt to prevent online guessing',async()=>{
 const {flow}=setup();const receipt=await flow.run(IN());
 assert.equal(flow.consume(receipt,{...validQuery(),sessionId:OTHER_SESSION}),null);
 assert.equal(flow.consume(receipt,validQuery()),null);
});
test('client cannot supply roles, claims, arbitrary route fields or secrets',async()=>{
 const {flow,calls}=setup();
 for(const key of ['role','aal','user_metadata','organization','action',
   'authorization','requestId','admin','jwtClaims']){
  assert.equal(await flow.run({...IN(),[key]:'superadmin'}),null,key);
 }
 assert.equal(calls.pre,0);
});
test('reject malformed actor, session, factor and unknown MFA method',async()=>{
 const {flow,calls}=setup();
 for(const change of [{subject:'invalid'},{sessionId:'bad'},
  {factorId:'wrong'},{method:'phone'},{method:'mfa/webauthn'},
  {accessToken:'short'},{accessToken:null},{code:'abc123'},
  {code:'12345'},{code:'123456789'},{code:null},{signal:'forged'}]){
  assert.equal(await flow.run(IN(change)),null,JSON.stringify(change));
 }
 assert.equal(calls.pre,0);
});
test('original JWT must be verified against active primary session',async()=>{
 for(const bad of [{verified:false},{jwtVerified:false},{primaryRead:false},
  {revocationChecked:false},{active:false},{subject:OTHER},
  {sessionId:OTHER_SESSION},{aal:'aal3'},{checkedAtSec:NOW-3},
  {checkedAtSec:NOW+1},{role:'SUPERADMIN'}]){
  const {flow,calls}=setup({readOriginalSession:async()=>PRE(bad)});
  assert.equal(await flow.run(IN()),null,JSON.stringify(bad));
  assert.equal(calls.factor,0);
 }
});
test('factor must belong to subject and be verified before issuing challenge',async()=>{
 for(const bad of [{owned:false},{status:'unverified'},{subject:OTHER},
  {factorId:OTHER},{method:'mfa/phone'},{checkedAtSec:NOW-3},
  {checkedAtSec:NOW+1},{mfaSecret:'SECRET'}]){
  const {flow,calls}=setup({readOwnedFactor:async()=>OWNED(bad)});
  assert.equal(await flow.run(IN()),null,JSON.stringify(bad));
  assert.equal(calls.challenge,0);
 }
});
test('provider challenge must bind to exact factor with plausible creation time',async()=>{
 for(const bad of [{challengeId:'bad'},{factorId:OTHER},{providerIssued:false},
  {createdAtSec:NOW+1},{createdAtSec:NOW-10},{code:'SECRET'}]){
  const {flow,calls}=setup({createChallenge:async()=>CH(bad)});
  assert.equal(await flow.run(IN()),null,JSON.stringify(bad));
  assert.equal(calls.verify,0);
 }
});
test('verify success requires exact challenge, factor and refreshed JWT',async()=>{
 for(const bad of [{challengeId:OTHER},{factorId:OTHER},
  {providerVerified:false},{refreshedAccessToken:'wrong'},
  {verifiedAtSec:NOW+1},{verifiedAtSec:NOW-10},{otp:'SECRET'}]){
  const {flow,calls}=setup({verifyChallenge:async()=>VERIFY(bad)});
  assert.equal(await flow.run(IN()),null,JSON.stringify(bad));
  assert.equal(calls.post,0);
 }
});
test('upgraded JWT must remain the same subject/session and be aal2',async()=>{
 for(const bad of [{subject:OTHER},{sessionId:OTHER_SESSION},{aal:'aal1'},
  {verified:false},{jwtVerified:false},{primaryRead:false},
  {revocationChecked:false},{active:false},{amrMethod:'password'},
  {amrTimestampSec:NOW-10},{amrTimestampSec:NOW+1},
  {checkedAtSec:NOW-3},{exp:NOW},{role:'SUPERADMIN'}]){
  const {flow}=setup({readUpdatedSession:async()=>POST(bad)});
  assert.equal(await flow.run(IN()),null,JSON.stringify(bad));
 }
});
test('phone is mfa/phone in provider context and allowed when all stages match',async()=>{
 const {flow}=setup({
  readOwnedFactor:async()=>OWNED({method:'mfa/phone'}),
  readUpdatedSession:async()=>POST({amrMethod:'mfa/phone'})
 });
 const receipt=await flow.run(IN({method:'mfa/phone'}));
 assert.equal(flow.consume(receipt,{
  ...validQuery(),method:'mfa/phone'
 })?.method,'mfa/phone');
});
test('receipt expires locally without a scheduled timer',async()=>{
 let ts=NOW;
 const {flow}=setup({nowSec:()=>ts});
 const receipt=await flow.run(IN());ts+=3;
 assert.equal(flow.consume(receipt,validQuery()),null);
});
test('cancelled request before or during async providers does not create receipt',async()=>{
 const ctrl=new AbortController();ctrl.abort();
 const f=setup();
 assert.equal(await f.flow.run(IN({signal:ctrl.signal})),null);
 assert.equal(f.calls.pre,0);
 for(const phase of ['readOriginalSession','readOwnedFactor','createChallenge',
  'verifyChallenge','readUpdatedSession']){
  const c=new AbortController();
  const payload={readOriginalSession:PRE,readOwnedFactor:OWNED,
   createChallenge:CH,verifyChallenge:VERIFY,readUpdatedSession:POST}[phase]();
  const {flow}=setup({[phase]:async()=>{c.abort();return payload;}});
  assert.equal(await flow.run(IN({signal:c.signal})),null,phase);
 }
});
test('provider exceptions and invalid clock fail closed, never reveal secrets',async()=>{
 for(const phase of ['readOriginalSession','readOwnedFactor','createChallenge',
  'verifyChallenge','readUpdatedSession']){
  const {flow}=setup({[phase]:async()=>{throw Error('PRIVATE_SQL_SECRET');}});
  assert.equal(await flow.run(IN()),null);
 }
 assert.equal(await setup({nowSec:()=>NaN}).flow.run(IN()),null);
});
test('unexpected callback extra fields, e.g. user_metadata, are rejected',async()=>{
 const {flow}=setup({readUpdatedSession:async()=>POST({user_metadata:{admin:true}})});
 assert.equal(await flow.run(IN()),null);
});
test('V102 one-use proof directly satisfies V101 verified challenge shape',async()=>{
 const {flow}=setup();const receipt=await flow.run(IN());
 const v101=createMfaRowCorroboratorV101({
  nowSec:()=>NOW,
  readPrimaryAmrRow:async()=>({
   subject:USER,sessionId:SESSION,method:'totp',primaryRead:true,
   sessionOwnershipVerified:true,createdAtSec:NOW-1000,
   updatedAtSec:NOW-1,checkedAtSec:NOW-1
  }),
  readVerifiedChallenge:async q=>flow.consume(receipt,{
   subject:q.subject,sessionId:q.sessionId,method:q.method,verifiedAtSec:NOW-1
  })
 });
 const v100=createVerifiedMfaAmrProvenanceV100({
  nowSec:()=>NOW,
  verifySignedJwtAmr:async()=>({
   subject:USER,sessionId:SESSION,verified:true,issuerVerified:true,
   audienceVerified:true,aal:'aal2',exp:NOW+60,
   amr:[{method:'totp',timestamp:NOW-1}]
  }),
  readAuthoritativeMfaEvent:v101.readAuthoritativeMfaEvent
 });
 const proof=await v100.readAuthoritativeFactor({
  subject:USER,sessionId:SESSION,accessToken:NEWTOKEN
 });
 assert.equal(proof?.factorConfirmedAtSec,NOW-1);
 assert.equal(proof?.factorType,'totp');
 assert.equal(await v100.readAuthoritativeFactor({
  subject:USER,sessionId:SESSION,accessToken:NEWTOKEN
 }),null,'already consumed challenge receipt must not be reused');
});
test('check rejects bad source callback policy even if it has success-shaped data',()=>{
 assert.throws(()=>createMfaChallengeSessionTransactionV102(),TypeError);
 assert.throws(()=>createMfaChallengeSessionTransactionV102({
  readOriginalSession:async()=>PRE(),readOwnedFactor:async()=>OWNED(),
  createChallenge:async()=>CH(),verifyChallenge:async()=>VERIFY(),
  readUpdatedSession:async()=>POST(),maxReceiptAgeSec:120
 }),TypeError);
});
test('readiness says no remote Auth, distributed guarantee or production approval',()=>{
 const {flow}=setup();
 assert.deepEqual(flow.readiness,{
  mode:'SYNTHETIC_SERVER_FLOW_ONLY',supabaseConnected:false,
  liveChallengeVerified:false,distributedReplayGuard:false,
  productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 });
 assert.ok(Object.isFrozen(flow.readiness));
});
test('V102 contains no DB, network, background process, logs or persistence',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,
  '../server/v102-challenge-session-transaction.cjs'),'utf8');
 for(const forbidden of ['fetch(', 'createClient(', 'require(\'pg\')',
  'child_process', 'createServer(', 'writeFile(', 'console.log(',
  'setTimeout(', 'setInterval(', 'query(', 'supabase.auth.mfa.challenge(']){
  assert.equal(source.includes(forbidden),false,forbidden);
 }
});
