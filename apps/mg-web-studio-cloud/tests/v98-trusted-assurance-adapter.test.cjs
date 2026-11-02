'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createTrustedAssuranceAdapterV98}=require('../server/v98-trusted-assurance-adapter.cjs');
const {createSensitiveOperationGateV97}=require('../server/v97-sensitive-operation-gate.cjs');
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_SESSION='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ORG='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SITE='ffffffff-ffff-4fff-8fff-ffffffffffff';
const TOKEN='synthetic.signed.token.20261102';
const NOW=2000000000;
const input=(p={})=>({subject:USER,accessToken:TOKEN,...p});
const signed=(p={})=>({
  verified:true,issuerVerified:true,audienceVerified:true,subject:USER,
  sessionId:SESSION,aal:'aal2',iat:NOW-120,exp:NOW+600,...p
});
const session=(p={})=>({
  subject:USER,sessionId:SESSION,active:true,primaryRead:true,
  revocationChecked:true,checkedAtSec:NOW-1,expiresAtSec:NOW+10,...p
});
const factor=(p={})=>({
  subject:USER,sessionId:SESSION,source:'AUTH_SERVER_VERIFIED_MFA',
  factorVerified:true,aal:'aal2',factorType:'totp',
  checkedAtSec:NOW-1,factorConfirmedAtSec:NOW-30,...p
});
function setup(overrides={}){
 const calls={token:0,session:0,factor:0,tokenInput:null,sessionInput:null,factorInput:null};
 const config={
  nowSec:()=>NOW,
  verifyBoundJwt:async request=>{calls.token++;calls.tokenInput=request;return signed();},
  readPrimarySession:async request=>{calls.session++;calls.sessionInput=request;return session();},
  readAuthoritativeFactor:async request=>{calls.factor++;calls.factorInput=request;return factor();},
  ...overrides
 };
 return {adapter:createTrustedAssuranceAdapterV98(config),calls};
}
test('success requires all three trusted providers and returns exactly V97 proof',async()=>{
 const {adapter,calls}=setup();
 const result=await adapter.readTrustedAssurance(input());
 assert.deepEqual(Object.keys(result).sort(),[
   'aal','active','checkedAtSec','expiresAtSec','factorConfirmedAtSec',
   'factorVerified','revocationChecked','sessionId','subject','tokenSessionIdVerified'
 ].sort());
 assert.deepEqual([calls.token,calls.session,calls.factor],[1,1,1]);
 assert.equal(result.subject,USER);
 assert.equal(result.sessionId,SESSION);
 assert.equal(result.aal,'aal2');
 assert.equal(result.checkedAtSec,NOW);
 assert.equal(result.expiresAtSec,NOW+1);
 assert.ok(Object.isFrozen(result));
 assert.ok(Object.isFrozen(calls.tokenInput));
 assert.deepEqual(Object.keys(calls.tokenInput).sort(),['accessToken','signal']);
 assert.deepEqual(Object.keys(calls.sessionInput).sort(),['sessionId','signal','subject']);
 assert.deepEqual(Object.keys(calls.factorInput).sort(),['sessionId','signal','subject']);
 assert.equal(calls.tokenInput.accessToken,TOKEN);
});
test('no default trusted adapter or invalid parameters permitted',()=>{
 const defaults={
   verifyBoundJwt:async()=>signed(),
   readPrimarySession:async()=>session(),
   readAuthoritativeFactor:async()=>factor(),
   nowSec:()=>NOW
 };
 for(const p of [{verifyBoundJwt:null},{readPrimarySession:null},
  {readAuthoritativeFactor:null},{maxSessionAgeSec:0},{maxSessionAgeSec:4},
  {maxFactorEvidenceAgeSec:0},{maxFactorEvidenceAgeSec:4},{nowSec:null}]){
  assert.throws(()=>createTrustedAssuranceAdapterV98({...defaults,...p}),TypeError);
 }
});
test('malformed subject, token, signal, or extra client data never starts providers',async()=>{
 const {adapter,calls}=setup();
 const wrong=[null,{},[],{...input(),subject:OTHER_SESSION.slice(0,15)},
   {...input(),accessToken:12},{...input(),accessToken:'x'},
   {...input(),accessToken:'x'.repeat(9000)},
   {...input(),signal:'fake'},{...input(),role:'SUPERADMIN'},
   {...input(),aal:'aal2'},{...input(),user_metadata:{role:'admin'}}];
 for(const v of wrong)assert.equal(await adapter.readTrustedAssurance(v),null);
 assert.equal(calls.token,0);
});
test('reject unsigned, mismatched, expired, or wrong assurance token evidence',async()=>{
 const patches=[
  {verified:false},{issuerVerified:false},{audienceVerified:false},
  {subject:OTHER},{sessionId:OTHER_SESSION.slice(0,16)},
  {aal:'aal1'},{aal:null},{exp:NOW},{iat:NOW+1},{iat:NOW+900},
  {exp:NOW-2},{iat:'yesterday'},{exp:0},{role:'SUPERADMIN'},
  {user_metadata:{admin:true}}
 ];
 for(const p of patches){
  const {adapter,calls}=setup({verifyBoundJwt:async()=>signed(p)});
  assert.equal(await adapter.readTrustedAssurance(input()),null,JSON.stringify(p));
  assert.equal(calls.session,0);
  assert.equal(calls.factor,0);
 }
});
test('verified JWT aal2 alone cannot bypass revoked session',async()=>{
 const {adapter,calls}=setup({readPrimarySession:async()=>session({active:false})});
 assert.equal(await adapter.readTrustedAssurance(input()),null);
 assert.equal(calls.factor,0);
});
test('cross-user or cross-session database rows fail before factor lookup',async()=>{
 for(const p of [{subject:OTHER},{sessionId:OTHER_SESSION}]){
  const {adapter,calls}=setup({readPrimarySession:async()=>session(p)});
  assert.equal(await adapter.readTrustedAssurance(input()),null);
  assert.equal(calls.factor,0);
 }
});
test('session must come from a fresh primary authority and prove revocation check',async()=>{
 for(const p of [
  {primaryRead:false},{primaryRead:'true'},{revocationChecked:false},
  {checkedAtSec:NOW-3},{checkedAtSec:NOW+1},{expiresAtSec:NOW},
  {expiresAtSec:NOW-1},{active:'true'},{ip:'private'},
  {notAfter:NOW+200}
 ]){
  const {adapter,calls}=setup({readPrimarySession:async()=>session(p)});
  assert.equal(await adapter.readTrustedAssurance(input()),null,JSON.stringify(p));
  assert.equal(calls.factor,0);
 }
});
test('missing session row is denied without guessing from token',async()=>{
 const {adapter,calls}=setup({readPrimarySession:async()=>null});
 assert.equal(await adapter.readTrustedAssurance(input()),null);
 assert.equal(calls.factor,0);
});
test('stale or unverified MFA proof fails even with valid session and aal2 JWT',async()=>{
 const patches=[
  {factorVerified:false},{factorVerified:'true'},
  {source:'JWT_AAL_CLAIM'},{source:'CLIENT_LOCAL_STORAGE'},
  {factorConfirmedAtSec:NOW-301},{factorConfirmedAtSec:NOW+1},
  {checkedAtSec:NOW-3},{checkedAtSec:NOW+1},{aal:'aal1'},
  {factorType:'password'},{factorType:'webauthn'},
  {factorType:'sms'},{sessionId:OTHER_SESSION},{subject:OTHER},
  {role:'SUPERADMIN'},{user_metadata:{canPublish:true}}
 ];
 for(const p of patches){
  const {adapter}=setup({readAuthoritativeFactor:async()=>factor(p)});
  assert.equal(await adapter.readTrustedAssurance(input()),null,JSON.stringify(p));
 }
});
test('provider may confirm phone or totp only; no enrolled-only proof',async()=>{
 for(const factorType of ['phone','totp']){
  const {adapter}=setup({readAuthoritativeFactor:async()=>factor({factorType})});
  assert.equal((await adapter.readTrustedAssurance(input()))?.aal,'aal2');
 }
 const {adapter}=setup({readAuthoritativeFactor:async()=>({
  subject:USER,sessionId:SESSION,factorType:'totp',status:'enrolled'
 })});
 assert.equal(await adapter.readTrustedAssurance(input()),null);
});
test('shortest of token, session and factor evidence bounds controls expiry',async()=>{
 const {adapter}=setup({readPrimarySession:async()=>session({expiresAtSec:NOW+1})});
 assert.equal((await adapter.readTrustedAssurance(input())).expiresAtSec,NOW+1);
 const expiring=setup({verifyBoundJwt:async()=>signed({exp:NOW+1})});
 assert.equal((await expiring.adapter.readTrustedAssurance(input())).expiresAtSec,NOW+1);
});
test('clock progressing while awaiting providers fails closed once expiry passes',async()=>{
 let current=NOW;
 const {adapter}=setup({
  nowSec:()=>current,
  readPrimarySession:async()=>{current=NOW+650;return session();}
 });
 assert.equal(await adapter.readTrustedAssurance(input()),null);
});
test('invalid, backward or missing clock denies without logging provider errors',async()=>{
 for(const nowSec of [()=>NaN,()=>-1,()=>{throw Error('PRIVATE_TOKEN');}]){
  const {adapter}=setup({nowSec});
  assert.equal(await adapter.readTrustedAssurance(input()),null);
 }
});
test('first provider failing does not query session or MFA',async()=>{
 for(const value of [null,undefined,[],{},'verified']){
  const {adapter,calls}=setup({verifyBoundJwt:async()=>value});
  assert.equal(await adapter.readTrustedAssurance(input()),null);
  assert.equal(calls.session,0);assert.equal(calls.factor,0);
 }
});
test('exception from any provider returns null and never leaks a secret',async()=>{
 for(const key of ['verifyBoundJwt','readPrimarySession','readAuthoritativeFactor']){
  const {adapter}=setup({[key]:async()=>{throw Error('SECRET_MASTER_KEY');}});
  const result=await adapter.readTrustedAssurance(input());
  assert.equal(result,null);
  assert.doesNotMatch(JSON.stringify(result),/SECRET_MASTER_KEY/);
 }
});
test('abort signal prevents start, and late token proof is discarded',async()=>{
 const a=new AbortController();a.abort();
 const {adapter,calls}=setup();
 assert.equal(await adapter.readTrustedAssurance(input({signal:a.signal})),null);
 assert.equal(calls.token,0);
 let release;
 const ctrl=new AbortController();
 const gate=setup({verifyBoundJwt:()=>new Promise(resolve=>{release=resolve;})});
 const p=gate.adapter.readTrustedAssurance(input({signal:ctrl.signal}));
 ctrl.abort();release(signed());
 assert.equal(await p,null);
 assert.equal(gate.calls.session,0);
});
test('aborting during session or factor provider prevents access',async()=>{
 for(const phase of ['readPrimarySession','readAuthoritativeFactor']){
  const c=new AbortController();
  const {adapter}=setup({[phase]:async()=>{c.abort();return phase==='readPrimarySession'?session():factor();}});
  assert.equal(await adapter.readTrustedAssurance(input({signal:c.signal})),null);
 }
});
test('strict proof rejects arrays, dates, maps and surprise properties',async()=>{
 for(const proof of [[],new Date(),new Map(),{...factor(),ip:'1.2.3.4'}]){
  const {adapter}=setup({readAuthoritativeFactor:async()=>proof});
  assert.equal(await adapter.readTrustedAssurance(input()),null);
 }
});
test('V98 response plugs into V97 with distinct JWT check, MFA and tenant checks',async()=>{
 const {adapter}=setup();
 const v97=createSensitiveOperationGateV97({
   nowSec:()=>NOW,
   verifyAccessToken:async token=>token===TOKEN?{verified:true,subject:USER}:null,
   readTrustedAssurance:adapter.readTrustedAssurance,
   authorizeResource:async()=>true
 });
 assert.deepEqual(await v97.check({
  authorization:'Bearer '+TOKEN,organizationId:ORG,siteId:SITE,action:'publish'
 }),{ok:true,stepUp:'verified'});
});
test('V97 refuses release when V98 reports bad MFA, even with valid tenant permissions',async()=>{
 const {adapter}=setup({readAuthoritativeFactor:async()=>factor({factorVerified:false})});
 const v97=createSensitiveOperationGateV97({
  nowSec:()=>NOW,
  verifyAccessToken:async()=>({verified:true,subject:USER}),
  readTrustedAssurance:adapter.readTrustedAssurance,
  authorizeResource:async()=>true
 });
 assert.deepEqual(await v97.check({
  authorization:'Bearer '+TOKEN,organizationId:ORG,siteId:SITE,action:'publish'
 }),{ok:false,status:403,code:'STEP_UP_REQUIRED'});
});
test('readiness always discloses unconnected Supabase and production NO_GO',()=>{
 const {adapter}=setup();
 assert.deepEqual(adapter.readiness,{
  mode:'INJECTED_TRUSTED_AUTH_PROVIDERS_ONLY',
  supabaseConnected:false,primarySessionConnected:false,
  realMfaProofConnected:false,tokenClaimBindingCertified:false,
  productionAuthorized:false,decision:'NO_GO'
 });
 assert.ok(Object.isFrozen(adapter.readiness));
});
test('V98 source contains no network, storage, console or database operations',()=>{
 const code=fs.readFileSync(path.resolve(__dirname,'../server/v98-trusted-assurance-adapter.cjs'),'utf8');
 for(const banned of ['require(\'pg\')','require(\'http\')','fetch(','createServer(',
 'writeFile(', 'console.log(', 'setInterval(', 'query(', 'supabase.auth.mfa.challenge']){
   assert.equal(code.includes(banned),false,banned);
 }
});
