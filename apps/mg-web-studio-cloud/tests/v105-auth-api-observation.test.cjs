'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createAuthApiObservationV105}=require('../server/v105-auth-api-observation.cjs');
const {createSensitiveOperationGateV97}=require('../server/v97-sensitive-operation-gate.cjs');
const NOW=2000000000;
const SUBJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER_SESSION='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ISS='https://auth.qa.example/auth/v1';
const JWT='synthetic.header.payload';
const input=(p={})=>({accessToken:JWT,expectedSubject:SUBJECT,expectedSessionId:SESSION,signal:undefined,...p});
const claims=(p={})=>({
 sub:SUBJECT,session_id:SESSION,iss:ISS,aud:'authenticated',
 aal:'aal2',iat:NOW-100,exp:NOW+80,
 amr:[{method:'password',timestamp:NOW-100},{method:'totp',timestamp:NOW-20}],...p
});
const aal=(p={})=>({
 currentLevel:'aal2',nextLevel:'aal2',
 currentAuthenticationMethods:[
   {method:'password',timestamp:NOW-100},{method:'totp',timestamp:NOW-20}
 ],...p
});
function setup(changes={},factoryChange=null){
 const calls={clients:0,claims:0,user:0,aal:0,tokens:[],clientCtx:null};
 const factory=async ctx=>{
  calls.clients++;calls.clientCtx=ctx;
  const auth={
    getClaims:async jwt=>{
      calls.claims++;calls.tokens.push(jwt);
      return {data:{claims:claims(changes.claims||{})},error:null};
    },
    getUser:async jwt=>{
      calls.user++;calls.tokens.push(jwt);
      return {data:{user:{id:SUBJECT,...changes.user}},error:null};
    },
    mfa:{getAuthenticatorAssuranceLevel:async jwt=>{
      calls.aal++;calls.tokens.push(jwt);
      return {data:aal(changes.aal||{}),error:null};
    }}
  };
  return factoryChange?factoryChange(auth,calls):{auth};
 };
 const gate=createAuthApiObservationV105({
   clientFactory:factory,expectedIssuer:ISS,nowSec:()=>NOW
 });
 return {gate,calls};
}
test('calls only official Auth methods with explicit JWT, and never grants authorization',async()=>{
 const {gate,calls}=setup();
 const r=await gate.observe(input());
 assert.deepEqual([calls.clients,calls.claims,calls.user,calls.aal],[1,1,1,1]);
 assert.deepEqual(calls.tokens,[JWT,JWT,JWT]);
 assert.equal(calls.clientCtx.purpose,'AUTH_SIGNALS_ONLY_NO_SESSIONS_OR_SECRETS');
 assert.ok(Object.isFrozen(calls.clientCtx));
 assert.equal(r.kind,'AUTH_API_SIGNAL_OBSERVATION');
 assert.equal(r.subject,SUBJECT);
 assert.equal(r.sessionId,SESSION);
 assert.equal(r.amrMethod,'totp');
 assert.equal(r.amrTimestampSec,NOW-20);
 for(const k of ['sessionRevocationVerified','independentMfaChallengeProven',
 'tenantPermissionVerified','canAuthorizeSensitiveAction','productionAuthorized'])
   assert.equal(r[k],false,k);
 assert.equal(r.formalV67Pass,0);
 assert.ok(Object.isFrozen(r));
});
test('must inject a trusted factory, issuer and bounded freshness policy',()=>{
 for(const bad of [
  {clientFactory:null},{expectedIssuer:''},
  {expectedIssuer:'http://insecure.example/auth/v1'},
  {expectedIssuer:'https://auth.qa.example'},
  {maxAmrAgeSec:0},{maxAmrAgeSec:301},{maxAmrAgeSec:29},
  {expectedAudience:''},{expectedAudience:'not valid'},{nowSec:null}
 ]){
  assert.throws(()=>createAuthApiObservationV105({
    clientFactory:async()=>({auth:{}}),expectedIssuer:ISS,...bad
  }),TypeError);
 }
 assert.throws(()=>createAuthApiObservationV105(),TypeError);
});
test('reject extra user-submitted roles, sessions, claims and headers',async()=>{
 const {gate,calls}=setup();
 for(const key of ['role','aal','user_metadata','authorization','headers',
    'claims','userId','scope','tenantId','admin']){
  assert.equal(await gate.observe({...input(),[key]:'admin'}),null,key);
 }
 assert.equal(calls.clients,0);
});
test('malformed or unsigned JWT-like input never reaches client factory',async()=>{
 const {gate,calls}=setup();
 for(const t of ['x','x.y','x.y.z.w','x.y.z!','',null,12,'x'.repeat(9000)]){
  assert.equal(await gate.observe(input({accessToken:t})),null,String(t).slice(0,15));
 }
 assert.equal(calls.clients,0);
});
test('expected subject/session must be UUID from trusted route context',async()=>{
 const {gate,calls}=setup();
 for(const p of [{expectedSubject:'x'},{expectedSessionId:'x'},
   {expectedSubject:null},{expectedSessionId:null}]){
  assert.equal(await gate.observe(input(p)),null);
 }
 assert.equal(calls.clients,0);
});
test('client factory must expose all three official methods; no fallbacks',async()=>{
 for(const mode of ['missingAuth','missingGetClaims','missingGetUser','missingMfa','missingAal']){
  const {gate}=setup({},auth=>{
    if(mode==='missingAuth')return {};
    if(mode==='missingGetClaims')delete auth.getClaims;
    if(mode==='missingGetUser')delete auth.getUser;
    if(mode==='missingMfa')delete auth.mfa;
    if(mode==='missingAal')delete auth.mfa.getAuthenticatorAssuranceLevel;
    return {auth};
  });
  assert.equal(await gate.observe(input()),null,mode);
 }
});
test('unsigned or mismatched claims never go to getUser or MFA',async()=>{
 const changes=[
  {sub:OTHER},{session_id:OTHER_SESSION},{iss:'https://evil.invalid/auth/v1'},
  {aud:'anon'},{aud:['anon','authenticated']},{aal:'aal1'},
  {iat:NOW+1},{exp:NOW},{exp:NOW-1},{exp:'later'},
  {amr:[]},{amr:undefined}
 ];
 for(const bad of changes){
  const {gate,calls}=setup({claims:bad});
  assert.equal(await gate.observe(input()),null,JSON.stringify(bad));
  assert.equal(calls.user,0);
  assert.equal(calls.aal,0);
 }
});
test('verified audience can use a single accepted audience entry',async()=>{
 const {gate}=setup({claims:{aud:['authenticated']}});
 assert.equal((await gate.observe(input()))?.kind,'AUTH_API_SIGNAL_OBSERVATION');
});
test('JWT signed AAL2 alone does not qualify if MFA method absent',async()=>{
 for(const amr of [
  [{method:'password',timestamp:NOW-1}],
  [{method:'oauth',timestamp:NOW-3}],
  [{method:'totp',timestamp:NOW-301}],
  [{method:'totp',timestamp:NOW+1}],
  [{method:'totp',timestamp:NOW-30},{method:'totp',timestamp:NOW-20}],
  [{method:'totp',timestamp:NOW-30},{method:'mfa/phone',timestamp:NOW-20}],
  [{method:'totp',timestamp:'yesterday'}],
  [{method:'totp',timestamp:NOW-2,secret:'no'}]
 ]){
  const {gate}=setup({claims:{amr}});
  const output=await gate.observe(input());
  if(amr.length===1&&amr[0].secret==='no') {
    assert.equal(output,null,'AMR extras must not pass unvalidated');
  } else assert.equal(output,null,JSON.stringify(amr));
 }
});
test('server-confirmed user mismatching signed subject denies before AAL',async()=>{
 const {gate,calls}=setup({user:{id:OTHER}});
 assert.equal(await gate.observe(input()),null);
 assert.equal(calls.aal,0);
});
test('AAL must be aal2 now, not merely eligible in nextLevel',async()=>{
 for(const change of [
  {currentLevel:'aal1',nextLevel:'aal2'},
  {currentLevel:'aal2',nextLevel:'aal1'},
  {currentLevel:'aal1',nextLevel:'aal1'},
  {currentLevel:null}
 ]){
  const {gate}=setup({aal:change});
  assert.equal(await gate.observe(input()),null,JSON.stringify(change));
 }
});
test('AAL currentAuthenticationMethods must match signed method and timestamp',async()=>{
 for(const methods of [
  [],[{method:'password',timestamp:NOW-100}],
  [{method:'totp',timestamp:NOW-21}],
  [{method:'mfa/phone',timestamp:NOW-20}],
  null,
  [{method:'totp',timestamp:NOW-20}].concat(Array.from({length:8},()=>({method:'password',timestamp:NOW-40})))
 ]){
  const {gate}=setup({aal:{currentAuthenticationMethods:methods}});
  assert.equal(await gate.observe(input()),null,JSON.stringify(methods).slice(0,70));
 }
});
test('mfa/phone canonical method is accepted while plain phone is not',async()=>{
 const pass=setup({claims:{amr:[{method:'mfa/phone',timestamp:NOW-20}]},
  aal:{currentAuthenticationMethods:[{method:'mfa/phone',timestamp:NOW-20}]}});
 assert.equal((await pass.gate.observe(input()))?.amrMethod,'mfa/phone');
 const denied=setup({claims:{amr:[{method:'phone',timestamp:NOW-20}]}});
 assert.equal(await denied.gate.observe(input()),null);
});
test('provider throwing errors never leaks exceptions or tokens',async()=>{
 for(const phase of ['factory','claims','user','aal']){
  const {gate}=setup({},(auth)=>{
    if(phase==='factory')throw Error('SECRET_PRIVATE_KEY');
    if(phase==='claims')auth.getClaims=async()=>{throw Error('SECRET_PRIVATE_KEY')};
    if(phase==='user')auth.getUser=async()=>{throw Error('SECRET_PRIVATE_KEY')};
    if(phase==='aal')auth.mfa.getAuthenticatorAssuranceLevel=async()=>{throw Error('SECRET_PRIVATE_KEY')};
    return {auth};
  });
  assert.equal(await gate.observe(input()),null);
 }
});
test('API errors or missing structures fail closed',async()=>{
 for(const phase of ['claims','user','aal']){
  const {gate}=setup({},auth=>{
    const name=phase==='claims'?'getClaims':phase==='user'?'getUser':'getAuthenticatorAssuranceLevel';
    const fun=async()=>({data:null,error:{message:'SECRET_AUTH_ERROR'}});
    if(phase==='aal')auth.mfa[name]=fun;else auth[name]=fun;
    return {auth};
  });
  assert.equal(await gate.observe(input()),null);
 }
});
test('abort before starting avoids factory; abort during an Auth call denies',async()=>{
 const already=new AbortController();already.abort();
 const first=setup();
 assert.equal(await first.gate.observe(input({signal:already.signal})),null);
 assert.equal(first.calls.clients,0);
 const signalCtrl=new AbortController();
 const second=setup({},auth=>{
  auth.getClaims=async()=>{signalCtrl.abort();return {data:{claims:claims()},error:null};};
  return {auth};
 });
 assert.equal(await second.gate.observe(input({signal:signalCtrl.signal})),null);
});
test('clock errors and JWT expiry during AAL fetch deny',async()=>{
 const {gate}=setup({},auth=>({auth}));
 assert.ok(await gate.observe(input()));
 const failing=createAuthApiObservationV105({
  clientFactory:async()=>({auth:{getClaims:async()=>({data:{claims:claims()},error:null}),
  getUser:async()=>({data:{user:{id:SUBJECT}},error:null}),
  mfa:{getAuthenticatorAssuranceLevel:async()=>({data:aal(),error:null})}}}),
  expectedIssuer:ISS,nowSec:()=>NaN
 });
 assert.equal(await failing.observe(input()),null);
 let ts=NOW;
 const expiring=createAuthApiObservationV105({
  clientFactory:async()=>({auth:{getClaims:async()=>({data:{claims:claims({exp:NOW+1})},error:null}),
  getUser:async()=>({data:{user:{id:SUBJECT}},error:null}),
  mfa:{getAuthenticatorAssuranceLevel:async()=>{ts=NOW+2;return {data:aal(),error:null};}}}}),
  expectedIssuer:ISS,nowSec:()=>ts
 });
 assert.equal(await expiring.observe(input()),null);
});
test('observation never embeds JWT or refresh token, ID is not a secret payload',async()=>{
 const {gate}=setup();
 const observation=await gate.observe(input());
 const txt=JSON.stringify(observation);
 assert.equal(txt.includes(JWT),false);
 assert.equal(txt.includes('refresh_token'),false);
 assert.equal(txt.includes('user_metadata'),false);
 assert.equal(txt.includes('service_role'),false);
});
test('a V105 observation cannot masquerade as V97 trusted assurance or authorize publish',async()=>{
 const {gate}=setup();
 const observation=await gate.observe(input());
 const v97=createSensitiveOperationGateV97({
  nowSec:()=>NOW,
  verifyAccessToken:async()=>({verified:true,subject:SUBJECT}),
  readTrustedAssurance:async()=>observation,
  authorizeResource:async()=>true
 });
 const outcome=await v97.check({
   authorization:'Bearer '+JWT,
   organizationId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
   siteId:'ffffffff-ffff-4fff-8fff-ffffffffffff',
   action:'publish'
 });
 assert.deepEqual(outcome,{ok:false,status:403,code:'STEP_UP_REQUIRED'});
});
test('each request constructs its own client (never shares a singleton)',async()=>{
 const {gate,calls}=setup();
 assert.ok(await gate.observe(input()));
 assert.ok(await gate.observe(input()));
 assert.equal(calls.clients,2);
});
test('readiness explains why Auth API evidence cannot prove session revocation',()=>{
 const {gate}=setup();
 assert.deepEqual(gate.readiness,{
  mode:'OFFLINE_AUTH_API_CONTRACT_NOT_WIRED',
  supabaseConnected:false,
  activeSessionRevocationCheckAvailable:false,
  independentMfaChallengeProofAvailable:false,
  productionAuthorized:false,decision:'NO_GO'
 });
 assert.ok(Object.isFrozen(gate.readiness));
});
test('module has no embedded Supabase secrets, client package, network or side effects',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../server/v105-auth-api-observation.cjs'),'utf8');
 for(const banned of ["require('pg')","require('@supabase/supabase-js')",
  'fetch(', 'createClient(', 'console.log(', 'writeFile(', 'setTimeout(',
  'setInterval(', 'CREATE POLICY', 'GRANT SELECT', 'JSON.parse(']){
  assert.equal(source.includes(banned),false,banned);
 }
});
