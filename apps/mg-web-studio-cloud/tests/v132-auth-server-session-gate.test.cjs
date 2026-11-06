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
   assert.ok(jwt===JWT||jwt==='SIGNED-AAL2-FIXTURE');claimsCount++;
   return {data:{claims:jwt===JWT?(claimOverride||claims()):claims({aal:'aal2',exp:NOW+180})},error:null};
  },
  async getUser(jwt){
   assert.ok(jwt===JWT||jwt==='SIGNED-AAL2-FIXTURE');userCount++;
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

test('V135: rotated AAL2 token succeeds despite revoked previous AAL1 JWT, with exact session binding',async()=>{
 const AAL2='SIGNED-ROTATED-AAL2-FIXTURE-ONLY';
 let oldRevoked=false,newRevoked=false,saved=null,claimed=false,stored=0;
 const auth={
  async getClaims(token){
   if(token===JWT)return {data:{claims:claims()},error:null};
   if(token===AAL2)return {data:{claims:claims({aal:'aal2',exp:NOW+240})},error:null};
   return {data:null,error:{message:'unrecognized token'}};
  },
  async getUser(token){
   if((token===JWT&&!oldRevoked)||(token===AAL2&&!newRevoked))
    return {data:{user:{id:USER}},error:null};
   return {data:{user:null},error:{message:'revoked'}};
  },
  mfa:{
   listFactors:async()=>({data:{totp:[{id:FACTOR,status:'verified'}],phone:[]},error:null}),
   challenge:async()=>({data:{id:CH},error:null}),
   verify:async()=>{oldRevoked=true;return {data:{access_token:AAL2},error:null};}
  }
 };
 const ctx=await createV132AuthServerSessionGate({auth,accessToken:JWT,nowSec:()=>NOW}).authenticate();
 assert.ok(ctx);
 const bridge=createV127NativeMfaBridge({
  auth,actor:ctx.actor,readActiveSession:ctx.readActiveSession,
  journal:{
   createPending:async x=>{saved=x;return {recorded:true};},
   claimPending:async()=>{if(claimed||!saved)return null;claimed=true;return {claimed:true,...saved};}
  },
  verifySignedJwt:async t=>{
   assert.equal(t,AAL2);return {aal:'aal2',exp:NOW+240,sub:USER,session_id:SID};
  },
  persistVerifiedReceipt:async()=>{stored++;return {recorded:true};},
  receiptKey:Buffer.alloc(32,127),newReference:()=>REF,nowSec:()=>NOW
 });
 assert.equal((await bridge.begin({factorId:FACTOR})).ok,true);
 assert.equal((await bridge.confirm({proofReference:REF,code:'123456'})).ok,true);
 assert.equal(stored,1);
 assert.equal(await ctx.readActiveSession({subject:USER,sessionId:SID}),null,
  'old token revoked after MFA must not be accepted');
 newRevoked=true;
 assert.equal(await ctx.readActiveSession({subject:USER,sessionId:SID},AAL2),null,
  'revoking new AAL2 token must deny even after signed claims');
});
test('V135: post-MFA session gate rejects AAL1, different subject/session, expired JWT, revoked Auth user or untrusted token',async()=>{
 const AAL2='SIGNED-NEW-AAL2-JWT-FIXTURE-ONLY';
 for(const item of [
  {name:'aal1',claim:{aal:'aal1'}},
  {name:'subject',claim:{sub:OTHER}},
  {name:'session',claim:{session_id:OTHER}},
  {name:'expired',claim:{exp:NOW}},
  {name:'audience',claim:{aud:'anon'}},
  {name:'issuer',claim:{iss:'https://another-project.supabase.co/auth/v1'}},
  {name:'revoked',remoteError:true},
  {name:'network',throws:true}
 ]){
  const auth={
   async getClaims(t){
    assert.ok(t===JWT||t===AAL2);
    return {data:{claims:t===JWT?claims():claims({aal:'aal2',exp:NOW+240,...item.claim})},error:null};
   },
   async getUser(t){
    assert.ok(t===JWT||t===AAL2);
    if(t===AAL2&&item.throws)throw Error('network failure');
    if(t===AAL2&&item.remoteError)return {data:{user:null},error:{message:'revoked'}};
    return {data:{user:{id:USER}},error:null};
   }
  };
  const ctx=await createV132AuthServerSessionGate({auth,accessToken:JWT,nowSec:()=>NOW}).authenticate();
  assert.ok(ctx,item.name);
  assert.equal(await ctx.readActiveSession({subject:USER,sessionId:SID},AAL2),null,item.name);
  assert.equal(await ctx.readActiveSession({subject:USER,sessionId:SID},JWT),null,'original token must not masquerade as post-MFA proof');
 }
});
