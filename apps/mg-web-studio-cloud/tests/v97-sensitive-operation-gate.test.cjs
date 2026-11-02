'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createSensitiveOperationGateV97}=require('../server/v97-sensitive-operation-gate.cjs');
const NOW=2000000000;
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ORG='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SITE='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const TOKEN='signed.mock.token';
const request=(patch={})=>({authorization:'Bearer '+TOKEN,
 organizationId:ORG,siteId:SITE,action:'publish',...patch});
const proof=(patch={})=>({
 subject:USER,sessionId:SESSION,active:true,revocationChecked:true,
 tokenSessionIdVerified:true,aal:'aal2',factorVerified:true,
 checkedAtSec:NOW-1,factorConfirmedAtSec:NOW-20,expiresAtSec:NOW+30,...patch
});
function setup(patch={}){
 const calls={verify:0,assurance:0,resource:0,assuranceArg:null,resourceArg:null};
 const opts={
   nowSec:()=>NOW,
   verifyAccessToken:async tok=>{calls.verify++;return tok===TOKEN?
     {verified:true,subject:USER}:null;},
   readTrustedAssurance:async arg=>{calls.assurance++;calls.assuranceArg=arg;return proof();},
   authorizeResource:async arg=>{calls.resource++;calls.resourceArg=arg;return true;},
   ...patch
 };
 return {gate:createSensitiveOperationGateV97(opts),calls};
}
test('valid verified token + server session MFA + tenant authorization admits',async()=>{
 const {gate,calls}=setup();
 assert.deepEqual(await gate.check(request()),{ok:true,stepUp:'verified'});
 assert.deepEqual([calls.verify,calls.assurance,calls.resource],[1,1,1]);
 assert.deepEqual(Object.keys(calls.assuranceArg).sort(),['accessToken','signal','subject']);
 assert.equal(calls.assuranceArg.accessToken,TOKEN);
 assert.ok(Object.isFrozen(calls.assuranceArg));
 assert.deepEqual(Object.keys(calls.resourceArg).sort(),
  ['action','actorId','organizationId','signal','siteId']);
 assert.equal(calls.resourceArg.actorId,USER);
 assert.equal(calls.resourceArg.action,'publish');
 assert.ok(Object.isFrozen(calls.resourceArg));
});
test('missing JWT or invalid bearer string denies before any provider',async()=>{
 const {gate,calls}=setup();
 for(const x of [undefined,null,'Basic a','Bearer ','Bearer '+TOKEN+'\r\nX:evil',
   'Bearer '+'.'.repeat(8195)]) {
  const r=await gate.check(request({authorization:x}));
  assert.equal(r.ok,false);
 }
 assert.equal(calls.verify,0);assert.equal(calls.assurance,0);
});
test('invalid verified JWT is rejected before reading MFA/tenant',async()=>{
 const {gate,calls}=setup({verifyAccessToken:async()=>null});
 assert.deepEqual(await gate.check(request()),{ok:false,status:401,code:'UNAUTHENTICATED'});
 assert.equal(calls.assurance,0);assert.equal(calls.resource,0);
});
test('token signer exceptions fail closed without revealing internal exception',async()=>{
 const {gate}=setup({verifyAccessToken:async()=>{throw Error('SECRET private key')}});
 const r=await gate.check(request());
 assert.deepEqual(r,{ok:false,status:401,code:'UNAUTHENTICATED'});
 assert.doesNotMatch(JSON.stringify(r),/SECRET/);
});
test('do not infer MFA from jwt roles, aal or user_metadata',async()=>{
 const {gate}=setup({readTrustedAssurance:async()=>proof({aal:'aal1'})});
 const r=await gate.check(request({role:'SUPERADMIN'}));
 assert.equal(r.status,400);
 const q=await gate.check(request());
 assert.deepEqual(q,{ok:false,status:403,code:'STEP_UP_REQUIRED'});
});
test('body/role/aal/scope escalation inputs are rejected',async()=>{
 const {gate,calls}=setup();
 for(const field of ['role','aal','user_metadata','mfa','actorId','sessionId','body','scope']){
  const r=await gate.check({...request(),[field]:'admin'});
  assert.equal(r.status,400,field);
 }
 assert.equal(calls.verify,0);assert.equal(calls.assurance,0);
});
test('wrong subject, unknown or unbound session fails before tenant',async()=>{
 for(const patch of [
   {subject:OTHER},{sessionId:'not-a-uuid'},{tokenSessionIdVerified:false},
   {tokenSessionIdVerified:'true'},{revocationChecked:false},
   {active:false},{active:'yes'}]){
  const {gate,calls}=setup({readTrustedAssurance:async()=>proof(patch)});
  const result=await gate.check(request());
  assert.equal(result.status,403);
  assert.equal(calls.resource,0);
 }
});
test('MFA must be confirmed by provider at aal2 with real factor verification',async()=>{
 for(const patch of [
   {aal:'aal1'},{aal:null},{aal:'aal3'},{factorVerified:false},
   {factorVerified:'true'},{factorVerified:null}]){
  const {gate}=setup({readTrustedAssurance:async()=>proof(patch)});
  assert.equal((await gate.check(request())).code,'STEP_UP_REQUIRED');
 }
});
test('reject stale, future and expired assurance/verification times',async()=>{
 for(const patch of [
   {checkedAtSec:NOW-4},{checkedAtSec:NOW+1},
   {factorConfirmedAtSec:NOW-301},{factorConfirmedAtSec:NOW+1},
   {expiresAtSec:NOW},{expiresAtSec:NOW-1},
   {factorConfirmedAtSec:'now'},{checkedAtSec:1.5},{expiresAtSec:null}]){
  const {gate}=setup({readTrustedAssurance:async()=>proof(patch)});
  assert.equal((await gate.check(request())).status,403);
 }
});
test('reject extra properties or malformed proof to avoid trusting client data',async()=>{
 for(const x of [
  proof({role:'SUPERADMIN'}),proof({user_metadata:{admin:true}}),
  proof({ip:'127.0.0.1'}),{},
  null, [], 'fake', 4
 ]){
  const {gate}=setup({readTrustedAssurance:async()=>x});
  assert.equal((await gate.check(request())).status,403);
 }
});
test('resource authorization cannot be bypassed with valid MFA',async()=>{
 for(const allowed of [false,null,undefined,{allowed:true},'true']){
  const {gate}=setup({authorizeResource:async()=>allowed});
  assert.deepEqual(await gate.check(request()),{ok:false,status:404,code:'RESOURCE_UNAVAILABLE'});
 }
});
test('MFA provider failures do not grant access or leak errors',async()=>{
 const {gate}=setup({readTrustedAssurance:async()=>{throw Error('SECRET MFA DB')}});
 const r=await gate.check(request());
 assert.deepEqual(r,{ok:false,status:503,code:'RETRY_LATER'});
 assert.doesNotMatch(JSON.stringify(r),/SECRET/);
});
test('tenant provider failures deny without leaking details',async()=>{
 const {gate}=setup({authorizeResource:async()=>{throw Error('PRIVATE tenant DB')}});
 assert.deepEqual(await gate.check(request()),{ok:false,status:503,code:'RETRY_LATER'});
});
test('invalid organization and site, or untrusted action, never call MFA',async()=>{
 for(const patch of [
   {organizationId:'evil'},{siteId:'evil'},{action:'admin'},
   {action:'read'},{action:'delete'},{action:undefined}]){
  const {gate,calls}=setup();
  const r=await gate.check(request(patch));
  assert.equal(r.status,400);
  assert.equal(calls.assurance,0);
 }
});
test('publish, members, billing are only supported sensitive actions',async()=>{
 for(const action of ['publish','members','billing']){
  const {gate}=setup();
  assert.equal((await gate.check(request({action}))).ok,true);
 }
});
test('aborted before start prevents calls and unknown signals are invalid',async()=>{
 const {gate,calls}=setup();
 const ctrl=new AbortController();ctrl.abort();
 assert.equal((await gate.check(request({signal:ctrl.signal}))).status,400);
 assert.equal((await gate.check(request({signal:'forged'}))).status,400);
 assert.equal(calls.verify,0);
});
test('aborted during assurance or tenant authorization rejects late results',async()=>{
 const ctrl=new AbortController();
 const {gate,calls}=setup({readTrustedAssurance:async()=>{ctrl.abort();return proof();}});
 assert.equal((await gate.check(request({signal:ctrl.signal}))).status,503);
 assert.equal(calls.resource,0);
 const ctrl2=new AbortController();
 const {gate:gate2}=setup({authorizeResource:async()=>{ctrl2.abort();return true;}});
 assert.equal((await gate2.check(request({signal:ctrl2.signal}))).status,503);
});
test('deny missing callbacks, dangerous policy configuration and invalid clocks',async()=>{
 for(const patch of [{verifyAccessToken:null},{readTrustedAssurance:undefined},
 {authorizeResource:1},{maxProofAgeSec:0},{maxProofAgeSec:60},
 {maxFactorAgeSec:29},{maxFactorAgeSec:3600},{nowSec:null}]){
  assert.throws(()=>createSensitiveOperationGateV97({...setupDefaults(),...patch}),TypeError);
 }
 const {gate}=setup({nowSec:()=>NaN});
 assert.equal((await gate.check(request())).status,503);
});
function setupDefaults(){return {verifyAccessToken:async()=>({verified:true,subject:USER}),
 readTrustedAssurance:async()=>proof(),authorizeResource:async()=>true,nowSec:()=>NOW};}
test('readiness is immutable, false about external integrations and deploy',()=>{
 const {gate}=setup();
 assert.ok(Object.isFrozen(gate.readiness));
 assert.deepEqual(gate.readiness,{
  mode:'TRUSTED_ADAPTER_REQUIRED',providerConnected:false,
  realMfaVerified:false,realSessionBindingVerified:false,
  productionAuthorized:false,decision:'NO_GO'
 });
});
test('source performs no network, SQL, token decode, file writes or listeners',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../server/v97-sensitive-operation-gate.cjs'),'utf8');
 for(const forbidden of ['require(\'http\')','require(\'pg\')','fetch(', 'createServer(','exec(', 'console.log(', 'writeFileSync','setInterval(']){
  assert.equal(src.includes(forbidden),false,forbidden);
 }
});
