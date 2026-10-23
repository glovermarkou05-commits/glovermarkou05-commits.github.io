'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {generateKeyPairSync,sign} = require('node:crypto');
const {createResilientSessionVerifierV73} = require('../server/resilient-session-verifier-v73.cjs');
const {assembleUnboundTenantHttpV69} = require('../server/unbound-tenant-stack-v69.cjs');
const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SESSION='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ISSUER='https://issuer.test/auth/v1', NOW=1792752000;
const keyPair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const publicKey={kid:'key-v73',alg:'ES256',jwk:keyPair.publicKey.export({format:'jwk'})};
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function jwt({overrides={},privateKey=keyPair.privateKey}={}){
  const h=encode({typ:'JWT',alg:'ES256',kid:'key-v73'});
  const p=encode({iss:ISSUER,aud:'authenticated',sub:ACTOR,session_id:SESSION,
    iat:NOW-30,exp:NOW+240,...overrides});
  return h+'.'+p+'.'+sign('sha256',Buffer.from(h+'.'+p),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url');
}
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function make(options={}){
  let keyResult=()=>({keys:[publicKey]});let sessionResult=({sessionId,subject})=>({active:true,sessionId,subject});
  let reads=0,keysCalled=0,sessionsCalled=0,keysAborted=false,sessionsAborted=false;
  let clock=1000;const events=[];
  const verifier=createResilientSessionVerifierV73({issuer:ISSUER,audience:'authenticated',
    nowSec:()=>NOW,nowMs:()=>clock,refreshIntervalSec:10,
    keyTimeoutMs:15,sessionTimeoutMs:15,sessionConcurrent:1,keyConcurrent:1,
    cooldownMs:100,failureThreshold:2,
    loadPublicKeys:async ({signal})=>{keysCalled++;signal.addEventListener('abort',()=>{keysAborted=true});return keyResult();},
    checkSession:async(input,{signal})=>{sessionsCalled++;signal.addEventListener('abort',()=>{sessionsAborted=true});return sessionResult(input);},
    observe:event=>events.push(event),...options});
  const stack=assembleUnboundTenantHttpV69({verifyAccessToken:verifier.verifyAccessToken,
    query:async ({text,values})=>{
      reads++;
      if(text.includes('mg_organizations'))return {rows:values[0]===ORG?[{id:ORG,status:'active'}]:[]};
      if(text.includes('mg_sites'))return {rows:values[0]===SITE?[{id:SITE,organizationId:ORG,status:'draft'}]:[]};
      if(text.includes('mg_memberships'))return {rows:[{userId:ACTOR,organizationId:ORG,status:'active',role:'CLIENT_VIEWER'}]};
      if(text.includes('mg_membership_site_scopes'))return {rows:[{userId:ACTOR,organizationId:ORG,siteId:SITE}]};
      throw Error('Unexpected SQL');
    },makeRequestId:()=> 'v73-id'});
  function start(token=jwt()){
    const req=Object.assign(new EventEmitter(),{
      method:'GET',url:`/api/v1/organizations/${ORG}/sites/${SITE}/access`,
      rawHeaders:['Authorization','Bearer '+token],rawTrailers:[],complete:false,
      readableEnded:false,socket:{remoteAddress:'127.0.0.1'}
    });
    const res={writableEnded:false,headersSent:false,destroyed:false,
      writeHead(s,headers){this.status=s;this.headers=headers;this.headersSent=true;},
      end(body){this.body=body;this.writableEnded=true;}};
    const done=stack.onRequest(req,res);
    req.complete=true;req.readableEnded=true;req.emit('end');
    return {res,done};
  }
  async function request(token){const pair=start(token);await pair.done;return pair.res;}
  return {verifier,stack,start,request,events,keysFn:fn=>keyResult=fn,sessionFn:fn=>sessionResult=fn,
    ticks:n=>clock=n,counts:()=>({reads,keysCalled,sessionsCalled}),
    aborted:()=>({keysAborted,sessionsAborted})};
}

test('genuine V60–V72 modules plus V73 policy admit active signed viewer',async()=>{
  const f=make();const res=await f.request();assert.equal(res.status,200);
  assert.deepEqual(JSON.parse(res.body),{ok:true,access:'granted',requestId:'v73-id'});
  assert.deepEqual(f.counts(),{reads:4,keysCalled:1,sessionsCalled:1});
  assert.equal(f.verifier.readiness.decision,'NO_GO');
});
test('session checked every request; revoked session fails before SQL',async()=>{
  const f=make();assert.equal((await f.request()).status,200);
  const before=f.counts().reads;f.sessionFn(({subject,sessionId})=>({active:false,subject,sessionId}));
  assert.equal((await f.request()).status,401);assert.equal(f.counts().reads,before);
});
test('key provider timeout rejects and signals abort; no session or SQL',async()=>{
  const pending=defer(),f=make();f.keysFn(()=>pending.promise);
  assert.equal((await f.request()).status,401);assert.equal(f.aborted().keysAborted,true);
  assert.deepEqual(f.counts(),{reads:0,keysCalled:1,sessionsCalled:0});
  assert.equal(f.verifier.providerStatus().keys.active,1);
  pending.resolve({keys:[publicKey]});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.verifier.providerStatus().keys.active,0);
});
test('uncooperative key load retains its only slot, blocking later loads',async()=>{
  const pending=defer(),f=make();f.keysFn(()=>pending.promise);
  assert.equal((await f.request()).status,401);
  assert.equal((await f.request()).status,401);assert.equal(f.counts().keysCalled,1);
  pending.resolve({keys:[publicKey]});await new Promise(resolve=>setImmediate(resolve));
});
test('session timeout rejects before tenant SQL and aborts session provider',async()=>{
  const pending=defer(),f=make();f.sessionFn(()=>pending.promise);
  assert.equal((await f.request()).status,401);
  assert.equal(f.aborted().sessionsAborted,true);assert.equal(f.counts().reads,0);
  pending.resolve({active:true,sessionId:SESSION,subject:ACTOR});
});
test('session concurrency limit denies second request without tenant SQL',async()=>{
  const pending=defer(),f=make();f.sessionFn(()=>pending.promise);
  const first=f.start();
  for(let i=0;i<24;i++)await Promise.resolve();
  assert.equal((await f.request()).status,401);
  await first.done;assert.equal(first.res.status,401);
  assert.equal(f.counts().sessionsCalled,1);assert.equal(f.counts().reads,0);
  pending.resolve({active:true,sessionId:SESSION,subject:ACTOR});
});
test('signature tampering is rejected without asking session provider',async()=>{
  const f=make();const forged=jwt().slice(0,-3)+'xyz';
  assert.equal((await f.request(forged)).status,401);
  assert.equal(f.counts().sessionsCalled,0);assert.equal(f.counts().reads,0);
});
test('session provider exceptions never leak secrets to HTTP response',async()=>{
  const f=make();f.sessionFn(()=>{throw Error('SECRET_SESSION_KEY')});
  const res=await f.request();assert.equal(res.status,401);assert.ok(!res.body.includes('SECRET'));
});
test('key provider exceptions never leak secrets and fail closed',async()=>{
  const f=make();f.keysFn(()=>{throw Error('PRIVATE_JWKS_HOST')});
  const res=await f.request();assert.equal(res.status,401);assert.ok(!res.body.includes('PRIVATE'));
});
test('invalid session responses never authorize signed token',async()=>{
  const f=make();f.sessionFn(()=>({active:true,subject:ACTOR,sessionId:'wrong'}));
  assert.equal((await f.request()).status,401);assert.equal(f.counts().reads,0);
});
test('telemetry contains only fixed codes and counts, no session ID or JWT',async()=>{
  const f=make();assert.equal((await f.request()).status,200);
  for(const event of f.events){assert.deepEqual(Object.keys(event).sort(),['active','circuit','event','provider']);
    assert.ok(Object.isFrozen(event));const out=JSON.stringify(event);
    for(const secret of [SESSION,ACTOR,'Bearer','issuer.test','127.0.0.1'])assert.ok(!out.includes(secret));}
});
test('host, port, service secrets or network enabling flags are forbidden',()=>{
  for(const key of ['host','port','service_role','DATABASE_URL','allowNetwork'])assert.throws(()=>
    createResilientSessionVerifierV73({issuer:ISSUER,audience:'authenticated',loadPublicKeys:()=>{},
      checkSession:()=>{},[key]:true}),TypeError);
});
test('invalid deadline and provider parameters fail on creation',()=>{
  for(const options of [{keyTimeoutMs:1},{sessionTimeoutMs:0},{sessionConcurrent:129},
    {keyConcurrent:0},{nowMs:0},{nowSec:0},{failureThreshold:0},{observe:42}])
    assert.throws(()=>make(options),TypeError);
});
test('no real listener or backend is attached and NO_GO remains',()=>{
  const f=make();assert.equal(typeof f.stack.listen,'undefined');
  assert.equal(f.stack.readiness.decision,'NO_GO');
  assert.equal(f.verifier.readiness.deploymentAuthorized,false);
  assert.equal(f.verifier.readiness.networkConnected,false);
});
