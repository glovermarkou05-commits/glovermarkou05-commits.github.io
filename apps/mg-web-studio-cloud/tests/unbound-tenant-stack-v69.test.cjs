'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const http = require('node:http');
const {assembleUnboundTenantHttpV69} = require('../server/unbound-tenant-stack-v69.cjs');
const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const URL=`/api/v1/organizations/${ORG}/sites/${SITE}/access`;
const OPTIONS=Object.freeze({insecureHTTPParser:false,joinDuplicateHeaders:false,
  maxHeaderSize:16384,requireHostHeader:true,headersTimeout:5000,
  requestTimeout:10000,keepAliveTimeout:1000});
function fixture(overrides={}) {
  const calls=[];let authCalls=0, queryCalls=0;
  const opts={verifyAccessToken: async token=>{authCalls++;return token==='allowed' ?
    {verified:true,subject:'user-1'} : {verified:false};},
    query:async ({text,values})=>{queryCalls++;return {rows:[]};}, ...overrides};
  const components={
    createAuthBoundary({verifyAccessToken}) {
      calls.push('auth');
      assert.equal(verifyAccessToken,opts.verifyAccessToken);
      return async ({authorization}) => verifyAccessToken(authorization.slice(7));
    },
    createPgTenantRepository({query}) {calls.push('repository');assert.equal(query,opts.query);return {query};},
    createTenantAuthorizer({authenticate,repository}) {
      calls.push('authorizer');
      return async input=>{
        const identity=await authenticate(input);
        if(!identity.verified)return {ok:false,status:401,code:'UNAUTHENTICATED'};
        await repository.query({text:'SELECT simulated',values:[input.organizationId]});
        if(input.organizationId!==ORG || input.siteId!==SITE)return {ok:false,status:404,code:'RESOURCE_UNAVAILABLE'};
        return {ok:true,context:{userId:identity.subject,organizationId:ORG,siteId:SITE,role:'CLIENT_VIEWER'}};
      };
    },
    createHttpSiteGate({authorize,makeRequestId}) {
      calls.push('gate');return async envelope=>{
        const authorization=envelope.rawHeaders[1];
        const ids=/organizations\/([^/]+)\/sites\/([^/]+)/.exec(envelope.target);
        const result=await authorize({authorization,organizationId:ids?.[1],siteId:ids?.[2],action:'read',body:{}});
        return {status:result.ok?200:result.status,
          headers:{},body:JSON.stringify(result.ok?{ok:true,access:'granted',requestId:'synthetic'}:
            {ok:false,code:result.code,requestId:'synthetic'})};
      };
    },
    createNodeHttpTransport({gate,makeRequestId}) {
      calls.push('transport');return async (req,res)=>{
        const result=await gate({target:req.url,method:req.method,rawHeaders:req.rawHeaders,bodyBytes:Buffer.alloc(0)});
        res.writeHead(result.status,{'Content-Type':'application/json'});res.end(result.body);
        return result.status;
      };
    },
    createRequestBudget({serve,observe}) {
      calls.push('admission');return async (req,res)=>{
        const result=await serve(req,res);
        observe?.({event:'completed',status:result,durationBucketMs:0});return result;
      };
    },
    createHttpServerBlueprint({serve}) {
      calls.push('blueprint');return {options:OPTIONS,onRequest:serve,
        configure(s){if(s.listening!==false)throw TypeError('not unbound');s.maxHeadersCount=32;return s;}};
    }
  };
  return {opts,components,calls,getAuthCalls:()=>authCalls,getQueryCalls:()=>queryCalls};
}
function mockExchange(){
  const req={method:'GET',url:URL,rawHeaders:['Authorization','Bearer allowed']};
  const res={status:null,writeCount:0,writeHead(s){this.status=s;},end(payload){this.body=payload;this.writeCount++;}};
  return {req,res};
}
const assemble=f=>assembleUnboundTenantHttpV69(f.opts,f.components);

test('requires a cryptographic verifier and explicit PostgreSQL query provider',()=>{
  for(const options of [{},{verifyAccessToken:()=>{}},{query:()=>{}},null,[],{},'x']){
    assert.throws(()=>assembleUnboundTenantHttpV69(options,fixture().components),TypeError);
  }
});
test('rejects port, host, listen, production and any caller-controlled extra options',()=>{
  for(const key of ['listen','port','host','networkAuthorized','allowProduction','service_role','DATABASE_URL']){
    const f=fixture();assert.throws(()=>assembleUnboundTenantHttpV69({...f.opts,[key]:true},f.components),TypeError);
  }
});
test('observe and request ID factories are optional but must be functions',()=>{
  const f=fixture({observe:true});assert.throws(()=>assemble(f),TypeError);
  const x=fixture({makeRequestId:123});assert.throws(()=>assemble(x),TypeError);
});
test('rejects an incomplete, malformed or additionally privileged component map',()=>{
  const f=fixture();for(const component of [null,[],{},42, {...f.components,createHttpSiteGate:null},
    {...f.components,overrideAuthorization:true}]){
    assert.throws(()=>assembleUnboundTenantHttpV69(f.opts,component),TypeError);
  }
});
test('rejects blueprint lacking strict parser options or required methods',()=>{
  const f=fixture();for(const wrong of [{},{onRequest:()=>{},configure:()=>{},options:{}},
    {onRequest:()=>{},configure:()=>{},options:{...OPTIONS,maxHeaderSize:0}},
    {onRequest:()=>{},configure:()=>{},options:{...OPTIONS,headersTimeout:0}},
    {onRequest:()=>{},configure:()=>{},options:{...OPTIONS,insecureHTTPParser:true}}]){
    assert.throws(()=>assembleUnboundTenantHttpV69(f.opts,{...f.components,createHttpServerBlueprint:()=>wrong}),TypeError);
  }
});
test('wires V60-V66 in explicit secure dependency order',()=>{
  const f=fixture();assemble(f);
  assert.deepEqual(f.calls,['auth','repository','authorizer','gate','transport','admission','blueprint']);
});
test('construction does not invoke verifier, query, transport or start any listener',()=>{
  const f=fixture();const x=assemble(f);
  assert.equal(f.getAuthCalls(),0);assert.equal(f.getQueryCalls(),0);
  assert.equal(typeof x.listen,'undefined');assert.equal(typeof x.connect,'undefined');
  assert.equal(typeof x.onRequest,'function');assert.equal(typeof x.configureUnboundServer,'function');
});
test('returned readiness is sealed NO_GO regardless of injected functions',()=>{
  const f=fixture();const x=assemble(f);
  assert.ok(Object.isFrozen(x) && Object.isFrozen(x.readiness) && Object.isFrozen(x.serverOptions));
  for(const key of ['networkAuthorized','deploymentAuthorized','recoveryVerified','postgresVerified',
    'tokenVerifierProven','httpParserTested'])assert.equal(x.readiness[key],false);
  assert.equal(x.readiness.decision,'NO_GO');
  assert.throws(()=>{x.readiness.decision='GO';},TypeError);
});
test('server options are copied defensively and cannot mutate blueprint',()=>{
  const f=fixture();const x=assemble(f);
  assert.notEqual(x.serverOptions,OPTIONS);
  assert.throws(()=>{x.serverOptions.maxHeaderSize=Infinity;},TypeError);
});
test('synthetic request moves through every constructed adapter and rejects missing credential',async()=>{
  const f=fixture();const x=assemble(f);const {req,res}=mockExchange();
  await x.onRequest(req,res);assert.equal(res.status,200);
  assert.equal(JSON.parse(res.body).access,'granted');assert.equal(f.getQueryCalls(),1);
  const next=mockExchange();next.req.rawHeaders[1]='Bearer denied';
  await x.onRequest(next.req,next.res);assert.equal(next.res.status,401);
  assert.equal(f.getQueryCalls(),1);
});
test('synthetic foreign-organization request is hidden',async()=>{
  const f=fixture();const x=assemble(f);const v=mockExchange();
  v.req.url=v.req.url.replace(ORG,'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  await x.onRequest(v.req,v.res);assert.equal(v.res.status,404);
});
test('observer is optional and receives only supplied synthetic event schema',async()=>{
  const events=[];const f=fixture({observe:e=>events.push(e)});const x=assemble(f);
  const v=mockExchange();await x.onRequest(v.req,v.res);
  assert.deepEqual(events,[{event:'completed',status:200,durationBucketMs:0}]);
});
test('optional request ID generator is wired only to gate and transport',()=>{
  const makeRequestId=()=> 'lab-1';const f=fixture({makeRequestId});assemble(f);
  assert.deepEqual(f.calls,['auth','repository','authorizer','gate','transport','admission','blueprint']);
});
test('unbound native Node HTTP server may be constructed without listen()',()=>{
  const f=fixture();const x=assemble(f);
  const server=http.createServer(x.serverOptions,x.onRequest);
  assert.equal(server.listening,false);
  x.configureUnboundServer(server);
  assert.equal(server.listening,false);assert.equal(server.maxHeadersCount,32);
  // The test intentionally never calls listen() or opens TCP ports.
});
test('configureUnboundServer refuses a synthetic already-listening server',()=>{
  const f=fixture();const x=assemble(f);
  assert.throws(()=>x.configureUnboundServer({listening:true}),TypeError);
});
test('no request-side field or headers can request server activation',async()=>{
  const f=fixture();const x=assemble(f);const a=mockExchange();
  a.req.headers={listen:true,port:9001,role:'SUPERADMIN'};
  await x.onRequest(a.req,a.res);
  assert.equal(a.res.status,200);assert.equal(x.readiness.networkAuthorized,false);
});
test('independent assembly instances do not share observed calls or database adapters',async()=>{
  const a=fixture(),b=fixture();const xa=assemble(a),xb=assemble(b);
  await xa.onRequest(...Object.values(mockExchange()));
  assert.equal(a.getQueryCalls(),1);assert.equal(b.getQueryCalls(),0);
  await xb.onRequest(...Object.values(mockExchange()));
  assert.equal(b.getQueryCalls(),1);
});
