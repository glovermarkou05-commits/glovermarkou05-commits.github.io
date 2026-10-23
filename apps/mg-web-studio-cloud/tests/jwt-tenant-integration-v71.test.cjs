'use strict';
// Run in the complete repository: V71 ES256 -> original V60-V66/V69 stack.
// No HTTP server, network, Supabase, Postgres connection, or production key.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {generateKeyPairSync, sign} = require('node:crypto');
const {createJwtPublicVerifierV71} = require('../server/jwt-public-verifier-v71.cjs');
const {assembleUnboundTenantHttpV69} = require('../server/unbound-tenant-stack-v69.cjs');
const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FOREIGN='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ISS='https://issuer.test/auth/v1';
const NOW=1792752000;
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const key={kid:'local-test-p256',alg:'ES256',jwk:pair.publicKey.export({format:'jwk'})};
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function signed(overrides={},headerOverrides={}){
  const head={alg:'ES256',kid:key.kid,typ:'JWT',...headerOverrides};
  const body={iss:ISS,aud:'authenticated',sub:USER,iat:NOW-100,exp:NOW+200,...overrides};
  const input=b64(head)+'.'+b64(body);
  const signature=sign('sha256',Buffer.from(input,'ascii'),{key:pair.privateKey,dsaEncoding:'ieee-p1363'});
  return input+'.'+signature.toString('base64url');
}
function setup(){
  const state={membership:'active',scoped:true,queries:0,verifyCalls:0};
  const cryptoVerifier=createJwtPublicVerifierV71({issuer:ISS,audience:'authenticated',
    publicKeys:[key],nowSec:()=>NOW});
  const stack=assembleUnboundTenantHttpV69({
    verifyAccessToken:token=>{state.verifyCalls++;return cryptoVerifier(token);},
    query:async ({text,values})=>{
      state.queries++;
      if(text.includes('mg_organizations'))return {rows:values[0]===ORG?[{id:ORG,status:'active'}]:[]};
      if(text.includes('mg_sites'))return {rows:values[0]===SITE?[{id:SITE,organizationId:ORG,status:'draft'}]:[]};
      if(text.includes('mg_memberships'))return {rows:[{userId:USER,organizationId:ORG,role:'CLIENT_VIEWER',status:state.membership}]};
      if(text.includes('mg_membership_site_scopes'))return {rows:state.scoped?[{userId:USER,organizationId:ORG,siteId:SITE}]:[]};
      throw Error('Unexpected SQL');
    },makeRequestId:()=> 'v71-safe-id'
  });
  async function hit({bearer=signed(),org=ORG,method='GET',rawHeaders}={}){
    const req=Object.assign(new EventEmitter(),{method,
      url:`/api/v1/organizations/${org}/sites/${SITE}/access`,
      rawHeaders:rawHeaders??['Authorization','Bearer '+bearer],rawTrailers:[],
      complete:false,readableEnded:false,socket:{remoteAddress:'127.0.0.1'}});
    const res={headersSent:false,writableEnded:false,destroyed:false,writes:0,
      writeHead(status,headers){this.status=status;this.headers=headers;this.headersSent=true;},
      end(body){this.body=body;this.writes++;this.writableEnded=true;}};
    const run=stack.onRequest(req,res);req.complete=true;req.readableEnded=true;req.emit('end');
    await run;return res;
  }
  return {state,stack,hit};
}
test('V71 signed P-256 JWT passes original V60–V69 read stack',async()=>{
  const f=setup();const r=await f.hit();
  assert.equal(r.status,200);assert.deepEqual(JSON.parse(r.body),{ok:true,access:'granted',requestId:'v71-safe-id'});
  assert.equal(f.state.queries,4);assert.equal(r.writes,1);
});
test('tampered JWT is rejected before querying database',async()=>{
  const f=setup();const original=signed().split('.');original[1]=b64({iss:ISS,aud:'authenticated',sub:FOREIGN,iat:NOW-100,exp:NOW+200});
  const r=await f.hit({bearer:original.join('.')});assert.equal(r.status,401);assert.equal(f.state.queries,0);
});
test('wrong issuer JWT signed by trusted key still rejected',async()=>{
  const f=setup();const r=await f.hit({bearer:signed({iss:'https://wrong.test/auth/v1'})});
  assert.equal(r.status,401);assert.equal(f.state.queries,0);
});
test('wrong audience and expiration are rejected',async()=>{
  for(const body of [{aud:'service_role'},{exp:NOW}]){
    const f=setup();assert.equal((await f.hit({bearer:signed(body)})).status,401);assert.equal(f.state.queries,0);
  }
});
test('MFA/role in token or X-Role cannot expand viewer privileges',async()=>{
  const f=setup();const bearer=signed({role:'SUPERADMIN',aal:'aal2',user_metadata:{role:'SUPERADMIN'}});
  const r=await f.hit({rawHeaders:['Authorization','Bearer '+bearer,'X-Role','SUPERADMIN']});
  assert.equal(r.status,200);assert.ok(!r.body.includes('SUPERADMIN'));
});
test('new request sees a revoked membership even with valid signature',async()=>{
  const f=setup();assert.equal((await f.hit()).status,200);
  f.state.membership='revoked';assert.equal((await f.hit()).status,404);
});
test('foreign tenant is hidden even with signed JWT',async()=>{
  const f=setup();const r=await f.hit({org:FOREIGN});assert.equal(r.status,404);assert.ok(!r.body.includes(FOREIGN));
});
test('case-mixed duplicate Authorization denied before signature checking',async()=>{
  const f=setup(), bearer=signed();const r=await f.hit({rawHeaders:['Authorization','Bearer '+bearer,'authorization','Bearer '+bearer]});
  assert.equal(r.status,400);assert.equal(f.state.verifyCalls,0);
});
test('no configuration exposes a listen function, remote key resolver or client data',()=>{
  const f=setup();assert.equal(typeof f.stack.listen,'undefined');assert.equal(f.stack.readiness.decision,'NO_GO');
});
