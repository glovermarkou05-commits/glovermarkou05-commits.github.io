'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHttpSiteGate } = require('../server/http-site-gate-v63.cjs');
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TARGET = `/api/v1/organizations/${ORG}/sites/${SITE}/access`;
const context = Object.freeze({ userId: 'user-1', organizationId: ORG, siteId: SITE, role: 'CLIENT_EDITOR' });
const allowed = Object.freeze({ ok: true, context });
const valid = () => ({ method: 'GET', target: TARGET, rawHeaders: ['Authorization', 'Bearer good.token'], bodyBytes: Buffer.alloc(0) });
function setup(authorize = async () => allowed) {
  const calls = [];
  const handle = createHttpSiteGate({ authorize: async input => { calls.push(input); return authorize(input); }, makeRequestId: () => 'request-123' });
  return { handle, calls };
}
const getBody = response => JSON.parse(response.body);
const request = (change) => ({...valid(), ...change});

test('requires an authorizer without permissive default', () => {
  assert.throws(() => createHttpSiteGate(), TypeError);
  assert.throws(() => createHttpSiteGate({authorize: true}), TypeError);
});
test('requires a request ID generator and detects invalid result', async () => {
  assert.throws(() => createHttpSiteGate({authorize: async () => allowed, makeRequestId: null}), TypeError);
  for (const makeRequestId of [() => 3, () => '', () => 'evil\nheader', () => {throw Error('SECRET');}]) {
    const res = await createHttpSiteGate({ authorize: async () => allowed, makeRequestId })(valid());
    assert.equal(res.status, 500);
    assert.deepEqual(getBody(res), {ok:false,code:'INTERNAL_ERROR',requestId:'unavailable'});
  }
});
test('GET valid route emits only public granted marker and server request ID', async () => {
  const f = setup(); const res = await f.handle(valid());
  assert.equal(res.status, 200);
  assert.deepEqual(getBody(res), {ok:true,access:'granted',requestId:'request-123'});
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0], {authorization:'Bearer good.token',organizationId:ORG,siteId:SITE,action:'read',body:{}});
  assert.ok(Object.isFrozen(res) && Object.isFrozen(res.headers));
});
test('security response headers inhibit caching and sniffing', async () => {
  const f=setup();for (const res of [await f.handle(valid()), await f.handle(request({ rawHeaders:[] }))]) {
    assert.equal(res.headers['Cache-Control'],'no-store');
    assert.equal(res.headers['X-Content-Type-Options'],'nosniff');
    assert.equal(res.headers['Content-Type'],'application/json; charset=utf-8');
  }
});
test('does not echo credentials, context, role, user, or database fields', async () => {
  const res=await setup().handle(valid());
  for (const secret of ['good.token','CLIENT_EDITOR','user-1',ORG,SITE,'password']) assert.ok(!res.body.includes(secret));
});
test('missing Authorization returns 401 without calling authorization', async () => {
  const f=setup();const res=await f.handle(request({rawHeaders:[]}));
  assert.equal(res.status,401);assert.equal(f.calls.length,0);
  assert.equal(getBody(res).code,'UNAUTHENTICATED');
});
test('duplicate Authorization with mixed casing is rejected before auth', async () => {
  const f=setup();const res=await f.handle(request({rawHeaders:['Authorization','Bearer one','authorization','Bearer two']}));
  assert.equal(res.status,400);assert.equal(f.calls.length,0);
});
test('duplicate harmless headers also fail closed for this narrow gate', async () => {
  const f=setup();const res=await f.handle(request({rawHeaders:['Authorization','Bearer one','accept','application/json','Accept','text/plain']}));
  assert.equal(res.status,400);assert.equal(f.calls.length,0);
});
test('Authorization joined by comma is not accepted by real V60 verifier', async () => {
  const {createAuthBoundary}=require('../server/auth-boundary.cjs');
  const auth=createAuthBoundary({verifyAccessToken: async () => ({verified:true,subject:'user1'})});
  const f=setup(async ({authorization,body})=>auth({authorization,body}));
  const res=await f.handle(request({rawHeaders:['Authorization','Bearer first, Bearer second']}));
  assert.equal(res.status,401);
});
test('normalized headers alone cannot bypass raw duplicate validation', async () => {
  const f=setup(); const envelope=valid();delete envelope.rawHeaders;
  envelope.headers={authorization:'Bearer valid'};
  assert.equal((await f.handle(envelope)).status,400);assert.equal(f.calls.length,0);
});
test('malformed rawHeaders arrays or length parity are denied', async () => {
  const f=setup();for(const rawHeaders of [undefined,null,{},'Authorization', ['Authorization'], Array(66).fill('x')]) {
    assert.equal((await f.handle(request({rawHeaders}))).status,400);
  }assert.equal(f.calls.length,0);
});
test('malformed header token names and invalid values are rejected', async () => {
  const f=setup();for(const rawHeaders of [['Authori zation','Bearer a'], ['Authorization','Bearer one\r\ninjected'],['Authorization','\0'],[12,'Bearer a'],['Authorization',12],['Authorization','Bearer a\x7f'],['Authorization','Bearer a\x0b']]){
    assert.equal((await f.handle(request({rawHeaders}))).status,400);
  }assert.equal(f.calls.length,0);
});
test('overlong and excessive headers are rejected', async () => {
  const f=setup();const many=[];for(let i=0;i<40;i++) many.push(`X-${i}`,'x');
  assert.equal((await f.handle(request({rawHeaders:many}))).status,400);
  const large=['Authorization', 'Bearer '+ 'x'.repeat(8190)];
  assert.equal((await f.handle(request({rawHeaders:large}))).status,400);
  const aggregate=['Authorization','Bearer yes','X-A','x'.repeat(8192),'X-B','x'.repeat(8192)];
  const res=await f.handle(request({rawHeaders:aggregate}));assert.equal(res.status,431);
  assert.equal(f.calls.length,0);
});
test('transfer-encoding, expect, cookie and proxy auth are rejected', async () => {
  const f=setup();for(const name of ['Transfer-Encoding','Expect','Cookie','Proxy-Authorization']){
    assert.equal((await f.handle(request({rawHeaders:['Authorization','Bearer x',name,'junk']}))).status,400);
  }assert.equal(f.calls.length,0);
});
test('content-length zero is accepted, positive or malformed length rejected', async () => {
  const f=setup();assert.equal((await f.handle(request({rawHeaders:['Authorization','Bearer good','Content-Length','0']}))).status,200);
  for(const length of ['1','010','-1','1e2','NaN','', '1000000000']) {
    assert.equal((await f.handle(request({rawHeaders:['Authorization','Bearer good','Content-Length',length]}))).status,400);
  }
});
test('content-length duplicates are rejected before auth', async () => {
  const f=setup();assert.equal((await f.handle(request({rawHeaders:['Authorization','Bearer x','Content-Length','0','content-length','0']}))).status,400);
  assert.equal(f.calls.length,0);
});
test('requires a complete empty Buffer for read-only GET (never reads stream)', async () => {
  const f=setup();for(const bodyBytes of [undefined,null,'',Buffer.from('{}'),{},new Uint8Array([])]) {
    assert.equal((await f.handle(request({bodyBytes}))).status,400);
  }assert.equal(f.calls.length,0);
});
test('mutating methods and non-GET requests are never authorized', async () => {
  const f=setup();for(const method of ['POST','PATCH','PUT','DELETE','HEAD','get',null]) {
    const r=await f.handle(request({method}));assert.equal(r.status,405);assert.equal(r.headers.Allow,'GET');
  }assert.equal(f.calls.length,0);
});
test('invalid URL shapes cannot reach authorization', async () => {
  const f=setup(); const invalid=[`${TARGET}?debug=true`,`${TARGET}#section`,`${TARGET}/`,TARGET.replace('/api/v1','http://evil/api/v1'),'/api/v1/organizations/%2e%2e/sites/'+SITE+'/access',TARGET.replace('aaaaaaaa','zzzzzzzz'),'/unrelated/path',`/${'a'.repeat(600)}`];
  for(const target of invalid){const r=await f.handle(request({target}));assert.ok([404,414].includes(r.status));}
  assert.equal(f.calls.length,0);
});
test('invalid target type returns 414', async () => {
  const f=setup();for(const target of [undefined,null,123,{}]) assert.equal((await f.handle(request({target}))).status,414);
  assert.equal(f.calls.length,0);
});
test('case insensitive UUID path is canonicalized before calling V61', async () => {
  const f=setup();const r=await f.handle(request({target:TARGET.toUpperCase().replace('/API/V1/ORGANIZATIONS','/api/v1/organizations').replace('/SITES/','/sites/').replace('/ACCESS','/access')}));
  assert.equal(r.status,200);assert.equal(f.calls[0].organizationId,ORG);
});
test('a caller-controlled x-role or x-user-id header is never forwarded to authorizer', async () => {
  const f=setup();const r=await f.handle(request({rawHeaders:['Authorization','Bearer good','X-Role','CLIENT_OWNER','X-User-Id','attacker']}));
  assert.equal(r.status,200);assert.equal(f.calls.length,1);
  assert.deepEqual(Object.keys(f.calls[0]).sort(),['action','authorization','body','organizationId','siteId']);
});
test('authorized action is always read; a caller action property is ignored', async () => {
  const f=setup();const r=await f.handle(request({action:'publish',role:'CLIENT_OWNER',body:{role:'CLIENT_OWNER'}}));
  assert.equal(r.status,200);assert.equal(f.calls[0].action,'read');
});
test('only fixed, enumerated denials may be returned to HTTP client', async () => {
  for(const [status,code] of [[400,'INVALID_REQUEST'],[401,'UNAUTHENTICATED'],[403,'FORBIDDEN'],[404,'RESOURCE_UNAVAILABLE'],[503,'RETRY_LATER']]){
    const res=await setup(async ()=>({ok:false,status,code})).handle(valid());
    assert.equal(res.status,status);assert.equal(getBody(res).code,code);
  }
});
test('unknown denial, forged success, malformed authorization result become generic 500', async () => {
  for(const result of [null,[],{}, {ok:true}, {ok:true,context:{}},{ok:true,context:{...context,organizationId:'wrong'}},{ok:true,context:{...context,siteId:22}},{ok:true,context:{...context,role:'SUPERADMIN'}},{ok:false,status:418,code:'PRIVATE'}, {ok:false,status:401,code:'PRIVATE'}]){
    const res=await setup(async ()=>result).handle(valid());
    assert.deepEqual(getBody(res),{ok:false,code:'INTERNAL_ERROR',requestId:'request-123'});
  }
});
test('authorization exceptions never leak error messages or traces', async () => {
  const res=await setup(async ()=>{throw Error('DATABASE_PASSWORD')}).handle(valid());
  assert.equal(res.status,503);assert.ok(!res.body.includes('DATABASE_PASSWORD'));
});
test('parallel requests retain different identities and cannot mix request IDs', async () => {
  let serial=0;const calls=[];const handle=createHttpSiteGate({authorize:async a=>{calls.push(a);await Promise.resolve();return allowed;},makeRequestId:()=>`req-${++serial}`});
  const results=await Promise.all([handle(valid()),handle(valid())]);
  assert.deepEqual(results.map(r=>getBody(r).requestId),['req-1','req-2']);
  assert.equal(calls.length,2);
});
test('missing or invalid envelope does not throw or call authorizer', async () => {
  const f=setup();for(const envelope of [undefined,null,[],3,'test',Object.create({rawHeaders:['Authorization','Bearer x']})]) {
    assert.equal((await f.handle(envelope)).status,400);
  }assert.equal(f.calls.length,0);
});
