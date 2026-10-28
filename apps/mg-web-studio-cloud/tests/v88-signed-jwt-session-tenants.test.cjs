'use strict';
// V88 — Real asymmetric signature verification against V71-V75 and V60-V69
// with ONLY generated ephemeral ES256 keys and fictional in-memory providers.
// No external HTTP, PostgreSQL, Supabase, Docker, production identities or secrets.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {EventEmitter}=require('node:events');
const {createPinnedAuthVerifierV74}=require('../server/pinned-auth-contract-v74.cjs');
const {assembleUnboundTenantHttpV69}=require('../server/unbound-tenant-stack-v69.cjs');
const {createAuthBoundary}=require('../server/auth-boundary.cjs');
const {createPgTenantRepository}=require('../server/pg-tenant-repository.cjs');
const {createTenantAuthorizer}=require('../server/tenant-authorization.cjs');

const ISS='https://auth.mg-v88.example.test/auth/v1';
const JWKS=ISS+'/.well-known/jwks.json';
const AUD='authenticated';
const NOW=1793100000;
const ORG_A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SITE_A='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SITE_A2='11111111-1111-4111-8111-111111111111';
const SITE_B='ffffffff-ffff-4fff-8fff-ffffffffffff';
const USER_A='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const USER_B='22222222-2222-4222-8222-222222222222';
const USER_UNKNOWN='33333333-3333-4333-8333-333333333333';
const SESSION_A='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SESSION_B='44444444-4444-4444-8444-444444444444';
const SESSION_UNKNOWN='55555555-5555-4555-8555-555555555555';
const UUID_SET=new Set([ORG_A,ORG_B,SITE_A,SITE_A2,SITE_B,USER_A,USER_B,USER_UNKNOWN]);

const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function publicJwk(pair,kid){
 return {kid,alg:'ES256',use:'sig',...pair.publicKey.export({format:'jwk'})};
}
function fixture(){
 // Both signing keys exist in RAM only; no private key file, artifact or stdout.
 const keyA=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 const keyB=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
 let now=NOW;
 let publicKeys=[publicJwk(keyA,'v88-first')];
 let jwksDown=false,sessionDown=false,redirect=false;
 const sessions=new Map([
  [SESSION_A,{subject:USER_A,active:true}],
  [SESSION_B,{subject:USER_B,active:true}]
 ]);
 const members=new Map([
  [USER_A+'|'+ORG_A,{role:'CLIENT_VIEWER',status:'active'}],
  [USER_B+'|'+ORG_B,{role:'CLIENT_EDITOR',status:'active'}]
 ]);
 const orgs=new Map([[ORG_A,'active'],[ORG_B,'active']]);
 const sites=new Map([[SITE_A,{org:ORG_A,status:'draft'}],
  [SITE_A2,{org:ORG_A,status:'draft'}],
  [SITE_B,{org:ORG_B,status:'draft'}]]);
 const scopes=new Set([USER_A+'|'+ORG_A+'|'+SITE_A]);
 const counts={jwks:0,session:0,query:0};
 function issue({subject=USER_A,sessionId=subject===USER_B?SESSION_B:SESSION_A,
  overrides={},key='first',kid=key==='first'?'v88-first':'v88-second',
  headerOverrides={}}={}){
  const h=b64({typ:'JWT',alg:'ES256',kid,...headerOverrides});
  const p=b64({iss:ISS,aud:AUD,sub:subject,session_id:sessionId,
   iat:now-10,exp:now+180,nbf:now-10,...overrides});
  const input=h+'.'+p;
  const signature=sign('sha256',Buffer.from(input,'ascii'),
   {key:key==='first'?keyA.privateKey:keyB.privateKey,dsaEncoding:'ieee-p1363'});
  return input+'.'+signature.toString('base64url');
 }
 const auth=createPinnedAuthVerifierV74({
  issuer:ISS,audience:AUD,nowSec:()=>now,
  nowMs:()=>1000,keyTimeoutMs:200,sessionTimeoutMs:200,
  refreshIntervalSec:10, maxTokenAgeSec:3600,
  requestJwks:async request=>{
   counts.jwks++;
   assert.equal(request.url,JWKS);
   assert.equal(request.redirect,'error');
   if(jwksDown)throw Error('fixture JWKS offline');
   return {status:200,finalUrl:JWKS,redirected:redirect,
    mediaType:'application/json',body:JSON.stringify({keys:publicKeys})};
  },
  readSession:async ({subject,sessionId})=>{
   counts.session++;
   if(sessionDown)throw Error('fixture session backend offline');
   const record=sessions.get(sessionId);
   const valid=record&&record.subject===subject&&record.active===true;
   return {subject,sessionId,active:!!valid,revocationChecked:true,
    checkedAtSec:now,expiresAtSec:now+20};
  }
 });
 const query=async ({text,values})=>{
  counts.query++;
  assert.ok(Array.isArray(values));
  for(const value of values)assert.ok(UUID_SET.has(value));
  if(text.includes('FROM public.mg_organizations')){
   const status=orgs.get(values[0]);
   return {rows:status?[{id:values[0],status}]:[]};
  }
  if(text.includes('FROM public.mg_sites')){
   const s=sites.get(values[0]);
   return {rows:s?[{id:values[0],organizationId:s.org,status:s.status}]:[]};
  }
  if(text.includes('FROM public.mg_memberships')){
   const m=members.get(values[0]+'|'+values[1]);
   return {rows:m?[{userId:values[0],organizationId:values[1],
    role:m.role,status:m.status}]:[]};
  }
  if(text.includes('FROM public.mg_membership_site_scopes'))
   return {rows:scopes.has(values.join('|'))?
    [{userId:values[0],organizationId:values[1],siteId:values[2]}]:[]};
  throw Error('V88_UNKNOWN_SYNTHETIC_QUERY');
 };
 const stack=assembleUnboundTenantHttpV69({
  verifyAccessToken:auth.verifyAccessToken,query,makeRequestId:()=> 'v88-public-id'
 });
 const authorize=createTenantAuthorizer({
  authenticate:createAuthBoundary({verifyAccessToken:auth.verifyAccessToken}),
  repository:createPgTenantRepository({query})
 });
 async function hit({token=issue(),org=ORG_A,site=SITE_A,headers=null}={}){
  const req=Object.assign(new EventEmitter(),{
   method:'GET',url:'/api/v1/organizations/'+org+'/sites/'+site+'/access',
   rawHeaders:headers??['Authorization','Bearer '+token],rawTrailers:[],
   complete:false,readableEnded:false,socket:{remoteAddress:'127.0.0.1'}
  });
  const res={headersSent:false,writableEnded:false,destroyed:false,writes:0,
   writeHead(status,head){this.status=status;this.headers=head;this.headersSent=true;},
   end(body){this.body=body;this.writes++;this.writableEnded=true;}};
  const work=stack.onRequest(req,res);
  req.complete=true;req.readableEnded=true;req.emit('end');
  await work;
  assert.equal(res.writes,1);
  assert.ok([200,400,401,403,404,503].includes(res.status));
  const json=JSON.parse(res.body);
  assert.equal(json.requestId,'v88-public-id');
  assert.equal(Object.keys(json).length,3);
  assert.ok(!res.body.includes('Bearer'));
  assert.ok(!res.body.includes(USER_A));
  assert.ok(!res.body.includes(USER_B));
  return res;
 }
 return {
  issue,hit,authorize,auth,stack,counts,
  identifiers:{ORG_A,ORG_B,SITE_A,SITE_A2,SITE_B,USER_A,USER_B,USER_UNKNOWN,
   SESSION_A,SESSION_B,SESSION_UNKNOWN},
  revoke:s=>sessions.delete(s),
  suspendMembership:(u,o)=>{const k=u+'|'+o;const m=members.get(k);if(m)m.status='revoked';},
  clearSiteScope:()=>scopes.clear(),
  advance:sec=>{now+=sec;},
  rotate:()=>{publicKeys=[publicJwk(keyB,'v88-second')];auth.invalidateKeys();},
  providerDown:which=>{if(which==='jwks'){jwksDown=true;auth.invalidateKeys();}
   if(which==='session')sessionDown=true;},
  jwksRedirect:()=>{redirect=true;auth.invalidateKeys();}
 };
}
test('genuine P-256 signed JWT grants user A in its own company/site',async()=>{
 const f=fixture(),r=await f.hit();
 assert.equal(r.status,200);
 assert.deepEqual(JSON.parse(r.body),{ok:true,access:'granted',requestId:'v88-public-id'});
 assert.deepEqual(f.counts,{jwks:1,session:1,query:4});
});
test('independent second signed user accesses only own organization B',async()=>{
 const f=fixture(),r=await f.hit({
  token:f.issue({subject:USER_B}),org:ORG_B,site:SITE_B});
 assert.equal(r.status,200);
 assert.equal(f.counts.query,3); // editor does not need a site scope lookup
});
test('user A signature cannot access organization B / site B',async()=>{
 const f=fixture(),r=await f.hit({org:ORG_B,site:SITE_B});
 assert.equal(r.status,404);
 assert.equal(f.counts.query,1); // org lookup, site mismatch remains hidden
});
test('user B signature cannot access organization A / site A',async()=>{
 const f=fixture(),r=await f.hit({token:f.issue({subject:USER_B})});
 assert.equal(r.status,404);
});
test('viewer A cannot access other site inside its own organization',async()=>{
 const f=fixture(),r=await f.hit({site:SITE_A2});
 assert.equal(r.status,404);
});
test('viewer A loses access immediately if its site scope disappears',async()=>{
 const f=fixture();
 assert.equal((await f.hit()).status,200);
 f.clearSiteScope();
 assert.equal((await f.hit()).status,404);
});
test('signed JWT still fails when account membership is revoked',async()=>{
 const f=fixture();
 assert.equal((await f.hit()).status,200);
 f.suspendMembership(USER_A,ORG_A);
 assert.equal((await f.hit()).status,404);
});
test('revoked session is denied on next request despite valid signature and key cache',async()=>{
 const f=fixture(),token=f.issue();
 assert.equal((await f.hit({token})).status,200);
 const before=f.counts.query;
 f.revoke(SESSION_A);
 assert.equal((await f.hit({token})).status,401);
 assert.equal(f.counts.query,before);
 assert.equal(f.counts.session,2);
});
test('expired signed JWT is rejected before session and tenant query',async()=>{
 const f=fixture();
 assert.equal((await f.hit({token:f.issue({overrides:{exp:NOW}})})).status,401);
 assert.equal(f.counts.session,0);assert.equal(f.counts.query,0);
});
test('future not-before token denied before database access',async()=>{
 const f=fixture(),token=f.issue({overrides:{nbf:NOW+90}});
 assert.equal((await f.hit({token})).status,401);
 assert.equal(f.counts.session,0);assert.equal(f.counts.query,0);
});
test('advancing verifier clock expires a previously good signature',async()=>{
 const f=fixture(),token=f.issue();
 assert.equal((await f.hit({token})).status,200);
 f.advance(240);
 assert.equal((await f.hit({token})).status,401);
});
test('wrong signed issuer is rejected',async()=>{
 const f=fixture();
 assert.equal((await f.hit({token:f.issue({overrides:{iss:'https://other.example.test/auth/v1'}})})).status,401);
 assert.equal(f.counts.session,0);assert.equal(f.counts.query,0);
});
test('wrong signed audience is rejected',async()=>{
 const f=fixture();
 assert.equal((await f.hit({token:f.issue({overrides:{aud:'service_role'}})})).status,401);
 assert.equal(f.counts.session,0);assert.equal(f.counts.query,0);
});
test('unknown session ID signed with valid key is rejected',async()=>{
 const f=fixture();
 assert.equal((await f.hit({token:f.issue({sessionId:SESSION_UNKNOWN})})).status,401);
 assert.equal(f.counts.query,0);
});
test('unknown signed user cannot obtain another membership',async()=>{
 const f=fixture(),token=f.issue({subject:USER_UNKNOWN,sessionId:SESSION_A});
 assert.equal((await f.hit({token})).status,401);
 assert.equal(f.counts.query,0);
});
test('tampering one payload segment without resigning is rejected',async()=>{
 const f=fixture(),pieces=f.issue().split('.');
 pieces[1]=b64({iss:ISS,aud:AUD,sub:USER_B,session_id:SESSION_B,
  iat:NOW-10,exp:NOW+180,nbf:NOW-10});
 assert.equal((await f.hit({token:pieces.join('.')})).status,401);
 assert.equal(f.counts.session,0);assert.equal(f.counts.query,0);
});
test('alg none header is rejected even if signature was created',async()=>{
 const f=fixture(),token=f.issue({headerOverrides:{alg:'none'}});
 assert.equal((await f.hit({token})).status,401);
 assert.equal(f.counts.query,0);
});
test('forged role/MFA in signed JWT cannot elevate viewer to editor',async()=>{
 const f=fixture();
 const token=f.issue({overrides:{
  role:'SUPERADMIN',aal:'aal2',user_metadata:{role:'SUPERADMIN',mfa:true}
 }});
 assert.equal((await f.hit({token})).status,200);
 const r=await f.authorize({authorization:'Bearer '+token,organizationId:ORG_A,
  siteId:SITE_A,action:'edit',body:{}});
 assert.deepEqual(r,{ok:false,status:403,code:'FORBIDDEN'});
});
test('body-supplied role and MFA cannot influence trusted server authorization',async()=>{
 const f=fixture(),token=f.issue();
 const r=await f.authorize({authorization:'Bearer '+token,organizationId:ORG_A,
  siteId:SITE_A,action:'edit',body:{role:'CLIENT_OWNER',aal:'aal2'}});
 assert.deepEqual(r,{ok:false,status:400,code:'INVALID_REQUEST'});
});
test('public key rotation and explicit cache invalidation revoke old signatures',async()=>{
 const f=fixture(),old=f.issue();
 assert.equal((await f.hit({token:old})).status,200);
 f.rotate();
 assert.equal((await f.hit({token:old})).status,401);
 assert.equal((await f.hit({token:f.issue({key:'second'})})).status,200);
});
test('JWKS provider failure fails closed before any tenant lookup',async()=>{
 const f=fixture();f.providerDown('jwks');
 assert.equal((await f.hit()).status,401);
 assert.equal(f.counts.query,0);
});
test('in-memory session provider failure fails closed',async()=>{
 const f=fixture();f.providerDown('session');
 assert.equal((await f.hit()).status,401);
 assert.equal(f.counts.query,0);
});
test('redirected JWKS is rejected without following redirect',async()=>{
 const f=fixture();f.jwksRedirect();
 assert.equal((await f.hit()).status,401);
 assert.equal(f.counts.query,0);
});
test('duplicate Authorization header is rejected before signature validation',async()=>{
 const f=fixture(),token=f.issue();
 const r=await f.hit({headers:['Authorization','Bearer '+token,
  'authorization','Bearer '+token]});
 assert.equal(r.status,400);
 assert.equal(f.counts.jwks,0);
 assert.equal(f.counts.session,0);
 assert.equal(f.counts.query,0);
});
test('missing Authorization header is denied without provider traffic',async()=>{
 const f=fixture();
 assert.equal((await f.hit({headers:[]})).status,401);
 assert.equal(f.counts.jwks,0);
 assert.equal(f.counts.session,0);
 assert.equal(f.counts.query,0);
});
test('signed subject B cannot reuse session A',async()=>{
 const f=fixture();
 assert.equal((await f.hit({token:f.issue({
  subject:USER_B,sessionId:SESSION_A}),org:ORG_B,site:SITE_B})).status,401);
 assert.equal(f.counts.query,0);
});
test('two distinct valid sessions can be reverified without cross-user identity caching',async()=>{
 const f=fixture();
 assert.equal((await f.hit()).status,200);
 assert.equal((await f.hit({token:f.issue({subject:USER_B}),
  org:ORG_B,site:SITE_B})).status,200);
 assert.equal(f.counts.session,2);
});
test('no connection, external listener, database, or production authorization',()=>{
 const f=fixture();
 assert.equal(f.auth.readiness.authoritativeSessionStoreConnected,false);
 assert.equal(f.auth.readiness.productionAuthorized,false);
 assert.equal(f.auth.readiness.decision,'NO_GO');
 assert.equal(f.stack.readiness.decision,'NO_GO');
 assert.equal(typeof f.stack.listen,'undefined');
});
