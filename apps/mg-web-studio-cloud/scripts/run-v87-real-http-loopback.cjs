#!/usr/bin/env node
'use strict';
// V87: authorized GitHub-hosted runner ONLY. Real HTTP parser and V63-66/V69.
// Fixed synthetic in-memory identity/query. No real tokens, database, reverse proxy,
// off-runner clients, external addresses, load tests, restore or deployment.
const {createServer}=require('node:http');
const net=require('node:net');
const {performance}=require('node:perf_hooks');
const {assembleUnboundTenantHttpV69}=require('../server/unbound-tenant-stack-v69.cjs');
const REPO='glovermarkou05-commits/glovermarkou05-commits.github.io';
const REF='refs/heads/feature/mg-digital-v5-web-services';
const HOST='127.0.0.1';
const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACTOR='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const URL='/api/v1/organizations/'+ORG+'/sites/'+SITE+'/access';
const AUTH='Bearer syntheticV87Only';
const MAX_BYTES=24*1024;
const EXIT_TIMEOUT=25000;
const stringify=x=>JSON.stringify(x);
function assert(x,id){if(!x)throw Error('V87_ASSERTION_FAILED_'+id);}
function approvedContext(env){
 return env.GITHUB_ACTIONS==='true'&&env.RUNNER_ENVIRONMENT==='github-hosted'&&
  env.RUNNER_OS==='Linux'&&env.GITHUB_REPOSITORY===REPO&&env.GITHUB_REF===REF&&
  env.MG_V87_SCOPE==='MG_V87_LOOPBACK_ONLY';
}
function fixtureDependencies(){
 let authCalls=0,queryCalls=0;
 return {
  counters:()=>({authCalls,queryCalls}),
  verifyAccessToken:async token=>{
   authCalls++;
   return token==='syntheticV87Only'?{verified:true,subject:ACTOR}:null;
  },
  query:async ({text,values})=>{
   queryCalls++;
   if(!Array.isArray(values))throw Error('Invalid synthetic query');
   if(text.includes('FROM public.mg_organizations'))return {
    rows:values[0]===ORG?[{id:ORG,status:'active'}]:[]};
   if(text.includes('FROM public.mg_sites'))return {
    rows:values[0]===SITE?[{id:SITE,organizationId:ORG,status:'draft'}]:[]};
   if(text.includes('FROM public.mg_memberships'))return {
    rows:values[0]===ACTOR&&values[1]===ORG?
     [{userId:ACTOR,organizationId:ORG,role:'CLIENT_VIEWER',status:'active'}]:[]};
   if(text.includes('FROM public.mg_membership_site_scopes'))return {
    rows:values[0]===ACTOR&&values[1]===ORG&&values[2]===SITE?
     [{userId:ACTOR,organizationId:ORG,siteId:SITE}]:[]};
   throw Error('Unknown synthetic query');
  }
 };
}
function wire(method='GET',target=URL,extra=[],{host=true,auth=true,body=''}={}){
 const headers=[];
 if(host)headers.push('Host: localhost');
 headers.push('Connection: close');
 if(auth)headers.push('Authorization: '+AUTH);
 headers.push(...extra);
 return [method+' '+target+' HTTP/1.1',...headers,'',''].join('\r\n')+body;
}
function sendPacket(port,payload,{timeoutMs=3500}={}){
 return new Promise((resolve,reject)=>{
  const start=performance.now();
  let done=false,bytes=0;
  const fragments=[];
  const socket=net.createConnection({host:HOST,port});
  const conclude=failure=>{
   if(done)return;
   done=true;
   socket.destroy();
   if(failure){reject(Error('V87_SOCKET_'+failure));return;}
   const raw=Buffer.concat(fragments).toString('latin1');
   const match=/^HTTP\/1\.1 (\d{3})\b/.exec(raw);
   const sep=raw.indexOf('\r\n\r\n');
   resolve({status:match?Number(match[1]):null,
    body:sep<0?'':raw.slice(sep+4),
    durationMs:Math.round(performance.now()-start),bytes});
  };
  socket.setTimeout(timeoutMs,()=>conclude('TIMEOUT'));
  socket.on('connect',()=>socket.write(payload));
  socket.on('data',buf=>{
   bytes+=buf.length;
   if(bytes>MAX_BYTES)return conclude('OVERSIZED_RESPONSE');
   fragments.push(buf);
  });
  socket.on('error',e=>{
   if(e.code==='ECONNRESET'||e.code==='EPIPE')conclude();
   else conclude('NETWORK_ERROR');
  });
  socket.on('close',()=>conclude());
 });
}
function limitedOutcome(r,accepted,id){
 assert(accepted.includes(r.status),id+'_STATUS');
 assert(r.bytes<MAX_BYTES,id+'_SIZE');
 if(r.status!==null){
  assert(!r.body.includes(AUTH),id+'_SECRET');
  assert(!r.body.includes(ACTOR),id+'_IDENTITY');
  assert(!r.body.includes('node:internal'),id+'_STACK');
 }
}
function validJson(r,id,code){
 assert(r.status===code,id+'_STATUS');
 let parsed;
 try{parsed=JSON.parse(r.body);}catch{throw Error('V87_ASSERTION_FAILED_'+id+'_JSON');}
 assert(parsed&&typeof parsed.requestId==='string'&&parsed.requestId.length<=80,id+'_REQUESTID');
 assert(Object.keys(parsed).length===3,id+'_PUBLIC_FIELDS');
 assert(r.body.length<=220,id+'_BOUNDED_BODY');
 assert(!r.body.includes(AUTH)&&!r.body.includes(ORG)&&!r.body.includes(SITE),id+'_REDACTION');
}
async function main(){
 if(!approvedContext(process.env)){
  process.stderr.write('V87 BLOCKED: approved GitHub Actions loopback context required\n');
  process.exitCode=2;return;
 }
 const fixture=fixtureDependencies();
 const stack=assembleUnboundTenantHttpV69({
  verifyAccessToken:fixture.verifyAccessToken,query:fixture.query,observe:()=>{}
 });
 assert(stack.serverOptions.requireHostHeader===true,'REQUIRE_HOST');
 assert(stack.serverOptions.insecureHTTPParser===false,'STRICT_PARSER');
 assert(stack.serverOptions.maxHeaderSize===16384,'MAX_HEADER_SIZE');
 const server=createServer(stack.serverOptions,stack.onRequest);
 stack.configureUnboundServer(server);
 let open=false,address;
 const results=[];
 const check=async (id,payload,accepted,{unhandled=false,timeoutMs=3500,expectJson=null}={})=>{
  const before=fixture.counters();
  const r=await sendPacket(address.port,payload,{timeoutMs});
  limitedOutcome(r,accepted,id);
  if(expectJson!==null)validJson(r,id,expectJson);
  if(unhandled){
   const after=fixture.counters();
   assert(before.authCalls===after.authCalls,id+'_NO_AUTH');
   assert(before.queryCalls===after.queryCalls,id+'_NO_QUERY');
  }
  results.push({id,observedStatus:r.status,authUncalled:unhandled||null,check:'PASS'});
 };
 try{
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen({host:HOST,port:0,exclusive:true},resolve);
  });
  open=true;
  address=server.address();
  assert(address&&address.address===HOST&&address.family==='IPv4'&&
   Number.isInteger(address.port)&&address.port>0,'BOUND_LOOPBACK_ONLY');
  assert(server.maxRequestsPerSocket===1,'REQUESTS_PER_SOCKET');
  assert(server.headersTimeout===5000,'HEADER_TIMEOUT');
  assert(server.requestTimeout===10000,'REQUEST_TIMEOUT');
  process.stdout.write('V87 SERVER: V63/V64/V65/V66/V69, IPv4 loopback only; port withheld\n');

  await check('HTTP-01',wire(),[200],{expectJson:200});
  await check('HTTP-01B',wire('GET',URL,[],{auth:false}),[401],{expectJson:401,unhandled:true});
  await check('HTTP-02',wire('GET',URL,['authorization: '+AUTH]),[400],{unhandled:true});
  await check('HTTP-03',wire('GET',URL,['Content-Length: 0','content-length: 0']),[400,null],{unhandled:true});
  await check('HTTP-04',wire('GET',URL,['Content-Length: 0','Transfer-Encoding: chunked']),[400,null],{unhandled:true});
  await check('HTTP-05A',wire('GET',URL,['Bad Name: one']),[400,null],{unhandled:true});
  await check('HTTP-05B',wire('GET',URL,['X-Test: bad\x01value']),[400,null],{unhandled:true});
  await check('HTTP-06',wire('GET',URL,['X-Fill: '+('x'.repeat(18000))]),[431,null],{unhandled:true});
  await check('HTTP-07A',wire('GET',URL,[],{host:false}),[400,null],{unhandled:true});
  await check('HTTP-07B',wire('GET',URL,['HOST: duplicate.test']),[400,null],{unhandled:true});
  await check('HTTP-08A',wire('GET',URL+'?mode=access'),[404],{expectJson:404,unhandled:true});
  await check('HTTP-08B',wire('GET',URL+'%2f'),[404],{expectJson:404,unhandled:true});
  await check('HTTP-08C',wire('GET','http://example.test'+URL),[404,400,null],{unhandled:true});
  await check('HTTP-08D',wire('GET',URL+'#fragment'),[404,400,null],{unhandled:true});
  await check('HTTP-09',wire('GET',URL,['Content-Length: 1'],{body:'x'}),[400],{unhandled:true});
  // One incomplete-header peer: NOT a load test, bounded to eight seconds.
  await check('HTTP-10','GET '+URL+' HTTP/1.1\r\nHost: localhost\r\n',[null,400,408],
   {unhandled:true,timeoutMs:8000});
  await check('HTTP-11',wire('GET',URL,['Expect: 100-continue','Content-Length: 1']),[417],
   {unhandled:true});
  await check('HTTP-12A',wire('GET',URL,['Connection: Upgrade','Upgrade: websocket']),[null,400],
   {unhandled:true});
  await check('HTTP-12B','CONNECT example.test:443 HTTP/1.1\r\nHost: example.test:443\r\n\r\n',
   [null,400],{unhandled:true});
  await check('HTTP-13','G?T '+URL+' HTTP/1.1\r\nHost: localhost\r\n\r\n',
   [400,null],{unhandled:true});
  // No reverse proxy exists: checks only direct-peer/spoofed-header behaviour.
  await check('HTTP-14-PARTIAL',wire('GET',URL,['X-Forwarded-For: 203.0.113.55',
   'Forwarded: for=203.0.113.55','X-Role: CLIENT_OWNER']),[200],{expectJson:200});
  assert(fixture.counters().authCalls===2,'ONLY_EXPECTED_AUTH');
  assert(fixture.counters().queryCalls===8,'ONLY_EXPECTED_SYNTHETIC_QUERIES');
  process.stdout.write('V87 RESULT: '+stringify({
   version:'V87',wireProtocol:'HTTP/1.1',nodeParser:true,
   stack:'V63,V64,V65,V66,V69',listener:'127.0.0.1 only',
   probes:results.length,passed:results.length,
   backend:'synthetic in-memory only',realAuth:false,realDatabase:false,
   reverseProxy:false,https:false,loadTests:false,
   httpGroupsCoveredOrPartiallyCovered:14,
   limitation:'HTTP-14 has no actual trusted reverse-proxy validation',
   formalV67Verified:0,formalV67Pending:32,decision:'NO_GO',results})+'\n');
 }finally{
  if(open){
   await new Promise(resolve=>server.close(resolve));
   assert(server.address()===null,'SERVER_NOT_CLOSED');
   process.stdout.write('V87 CLEANUP: loopback listener closed; no persistent services\n');
  }
 }
}
if(require.main===module){
 const deadline=setTimeout(()=>{
  process.stderr.write('V87 FAILED: bounded 25s deadline exceeded\n');
  process.exit(1);
 },EXIT_TIMEOUT);
 main().catch(e=>{
  process.stderr.write(/^V87_ASSERTION_FAILED_[A-Z0-9_]+$/.test(e.message)
   ?e.message+'\n':'V87_RUNNER_ERROR\n');
  process.exitCode=1;
 }).finally(()=>clearTimeout(deadline));
}
module.exports={approvedContext};
