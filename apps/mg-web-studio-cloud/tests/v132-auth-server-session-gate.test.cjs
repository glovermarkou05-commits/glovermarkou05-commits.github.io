'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createV132AuthServerSessionGate,QA_ISSUER}=
 require('../server/v132-auth-server-session-gate.cjs');
const {createV127NativeMfaBridge}=
 require('../server/v127-supabase-native-mfa-bridge.cjs');
const NOW=2000000000;
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FACTOR='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CH='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REF='ffffffff-ffff-4fff-8fff-ffffffffffff';
const JWT='signed-but-not-real-jwt-fixture-223';
const claims=(x={})=>({iss:QA_ISSUER,aud:'authenticated',aal:'aal1',
 sub:USER,session_id:SID,exp:NOW+120,iat:NOW-50,...x});
function fixture({claimOverride,serverUser,revoked=false,
 networkError=false,clock=()=>NOW,delay=false}={}){
 let isRevoked=revoked,claimsCount=0,userCount=0;
 const auth={
  async getClaims(jwt){
   assert.equal(jwt,JWT);claimsCount++;
   return {data:{claims:claimOverride||claims()},error:null};
  },
  async getUser(jwt){
   assert.equal(jwt,JWT);userCount++;
   if(networkError)throw Error('offline');
   if(isRevoked)return {data:{user:null},error:{message:'session-ended'}};
   return {data:{user:{id:serverUser||USER}},error:null};
  }
 };
 const gate=createV132AuthServerSessionGate({auth,accessToken:JWT,nowSec:clock});
 return {gate,auth,revoke(){isRevoked=true;},stats:()=>({claimsCount,userCount})};
}
test('V132 requires official Auth methods, user JWT and QA-pinned issuer',()=>{
 assert.throws(()=>createV132AuthServerSessionGate(),TypeError);
 assert.throws(()=>createV132AuthServerSessionGate({
  auth:{getClaims:()=>{},getUser:()=>{}},accessToken:JWT,
  expectedIssuer:'https://other.supabase.co/auth/v1'
 }),TypeError);
});
test('AAL1 Auth session is permitted to begin MFA, only if getUser returns matching identity',async()=>{
 const f=fixture();
 const context=await f.gate.authenticate();
 assert.deepEqual(context.actor,{subject:USER,sessionId:SID,tokenExpiresAtSec:NOW+120});
 assert.equal((await context.readActiveSession({subject:USER,sessionId:SID})).authServerConfirmed,true);
 assert.deepEqual(f.stats(),{claimsCount:2,userCount:2});
});
test('Auth server is reconsulted on every gate check and revoked session immediately fails next request',async()=>{
 const f=fixture();
 const context=await f.gate.authenticate();
 assert.notEqual(await context.readActiveSession({subject:USER,sessionId:SID}),null);
 f.revoke();
 assert.equal(await context.readActiveSession({subject:USER,sessionId:SID}),null);
 assert.deepEqual(f.stats(),{claimsCount:3,userCount:3});
});
test('signed JWT cannot impersonate a different remote user',async()=>{
 const f=fixture({serverUser:OTHER});
 assert.equal(await f.gate.authenticate(),null);
 assert.deepEqual(f.stats(),{claimsCount:1,userCount:1});
});
test('JWT signature claims must match the pinned project and AAL1/2, expiry and session ID',async()=>{
 for(const altered of [{iss:'https://evil.supabase.co/auth/v1'},
  {aud:'anon'},{aal:'bad'},{session_id:'invalid'},{sub:'invalid'},
  {exp:NOW},{iat:NOW+100},{nbf:NOW+1}]){
  const f=fixture({claimOverride:claims(altered)});
  assert.equal(await f.gate.authenticate(),null);
  assert.equal(f.stats().userCount,0);
 }
});
test('Auth server errors deny, without falling back to getSession or unsigned JWT',async()=>{
 const f=fixture({networkError:true});
 assert.equal(await f.gate.authenticate(),null);
});
test('Client may not substitute session or subject in readActiveSession',async()=>{
 const f=fixture(),ctx=await f.gate.authenticate();
 for(const inp of [{subject:USER,sessionId:OTHER},{subject:OTHER,sessionId:SID},
  {subject:USER,sessionId:SID,role:'postgres'},null]){
  assert.equal(await ctx.readActiveSession(inp),null);
 }
 assert.equal(f.stats().userCount,1);
});
test('Context cannot be reused when Auth server session ends after initial authentication',async()=>{
 const f=fixture();
 const ctx=await f.gate.authenticate();
 f.revoke();
 assert.equal(await ctx.readActiveSession({subject:USER,sessionId:SID}),null);
});
test('No getUser response newer than two seconds is accepted',async()=>{
 let n=NOW;const f=fixture({clock:()=>n++===NOW?NOW:NOW+3});
 assert.equal(await f.gate.authenticate(),null);
});
test('V127 accepts fresh verified Auth-server session check for the MFA challenge',async()=>{
 const f=fixture();const context=await f.gate.authenticate();
 let saved=null,claimed=false,stored=0;
 const bridge=createV127NativeMfaBridge({
  auth:{mfa:{
   listFactors:async()=>({data:{totp:[{id:FACTOR,status:'verified'}],phone:[]},error:null}),
   challenge:async()=>({data:{id:CH},error:null}),
   verify:async()=>({data:{access_token:'SIGNED-AAL2-FIXTURE'},error:null})
  }},
  actor:context.actor,readActiveSession:context.readActiveSession,
  journal:{
   createPending:async x=>{saved=x;return {recorded:true};},
   claimPending:async x=>{
    if(claimed||!saved||saved.proofReference!==x.proofReference)return null;
    claimed=true;return {claimed:true,...saved};
   }
  },receiptKey:Buffer.alloc(32,132),newReference:()=>REF,
  nowSec:()=>NOW,
  verifySignedJwt:async()=>({aal:'aal2',exp:NOW+120,sub:USER,session_id:SID}),
  persistVerifiedReceipt:async()=>{stored++;return {recorded:true};}
 });
 assert.equal((await bridge.begin({factorId:FACTOR})).ok,true);
 assert.equal((await bridge.confirm({code:'123456',proofReference:REF})).ok,true);
 assert.equal(stored,1);
 assert.ok(f.stats().userCount>=5,'fresh Auth call per gate stage');
});
test('V127 denies verification if signout occurs after native MFA challenge',async()=>{
 const f=fixture();const ctx=await f.gate.authenticate();
 let saved=null;
 const bridge=createV127NativeMfaBridge({
  auth:{mfa:{
   listFactors:async()=>({data:{totp:[{id:FACTOR,status:'verified'}],phone:[]},error:null}),
   challenge:async()=>({data:{id:CH},error:null}),
   verify:async()=>({data:{access_token:'SIGNED-AAL2-FIXTURE'},error:null})
  }},
  actor:ctx.actor,readActiveSession:ctx.readActiveSession,
  journal:{createPending:async x=>{saved=x;return {recorded:true};},claimPending:async()=>({claimed:true,...saved})},
  receiptKey:Buffer.alloc(32,132),newReference:()=>REF,nowSec:()=>NOW,
  verifySignedJwt:async()=>({aal:'aal2',exp:NOW+120,sub:USER,session_id:SID}),
  persistVerifiedReceipt:async()=>{throw Error('should not be reached');}
 });
 assert.equal((await bridge.begin({factorId:FACTOR})).ok,true);
 f.revoke();
 assert.equal((await bridge.confirm({code:'123456',proofReference:REF})).ok,false);
});
test('Readiness preserves NO_GO and does not claim atomic revocation',()=>{
 const f=fixture();
 assert.equal(f.gate.readiness.usesManagedAuthTableDirectly,false);
 assert.equal(f.gate.readiness.revocationLinearizable,false);
 assert.equal(f.gate.readiness.productionAuthorized,false);
});
