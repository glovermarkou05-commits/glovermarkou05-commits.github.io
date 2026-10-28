#!/usr/bin/env node
'use strict';
// V89: user-authorized VERY SMALL real HTTP traffic to 127.0.0.1 on a
// GitHub-hosted runner. Uses project V63/V64/V65/V66 implementation.
// No external host, database, SQL, real credentials, load stress or deployment.
const http=require('node:http');
const {performance}=require('node:perf_hooks');
const {createHttpSiteGate}=require('../server/http-site-gate-v63.cjs');
const {createNodeHttpTransport}=require('../server/node-http-transport-v64.cjs');
const {createHttpServerBlueprint}=require('../server/http-server-blueprint-v65.cjs');
const {createRequestBudget}=require('../server/request-budget-v66.cjs');

const EXPECTED_REPO='glovermarkou05-commits/glovermarkou05-commits.github.io';
const EXPECTED_BRANCH='refs/heads/feature/mg-digital-v5-web-services';
const HOST='127.0.0.1';
const ORG='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SITE='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TARGET='/api/v1/organizations/'+ORG+'/sites/'+SITE+'/access';
const AUTH='Bearer synthetic-v89-only';
const FIXED_ID='v89-safe-id';
const MAX_SOCKETS=4;
const MAX_RESPONSE_BYTES=2048;
const SCRIPT_DEADLINE_MS=19000;
function ensure(x,code){if(!x)throw Error('V89_CHECK_'+code);}
function approvedContext(env){
 return env.GITHUB_ACTIONS==='true'&&env.RUNNER_ENVIRONMENT==='github-hosted'&&
  env.RUNNER_OS==='Linux'&&env.GITHUB_REPOSITORY===EXPECTED_REPO&&
  env.GITHUB_REF===EXPECTED_BRANCH&&env.MG_V89_SCOPE==='MG_V89_SMALL_LOOPBACK_LOAD';
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function makeHarness({maxConcurrent,maxRequestsPerPeer,windowMs=1200,authorize}){
 const events=[];
 const gate=createHttpSiteGate({authorize,makeRequestId:()=>FIXED_ID});
 const transport=createNodeHttpTransport({gate,deadlineMs:2000,makeRequestId:()=>FIXED_ID});
 const admission=createRequestBudget({serve:transport,maxConcurrent,maxRequestsPerPeer,
  windowMs,maxPeers:2,observe:x=>events.push(x.event)});
 const blueprint=createHttpServerBlueprint({serve:admission});
 const server=http.createServer(blueprint.options,blueprint.onRequest);
 blueprint.configure(server);
 server.maxConnections=MAX_SOCKETS;
 const sockets=new Set();
 let peakSockets=0;
 server.on('connection',s=>{
  sockets.add(s);
  peakSockets=Math.max(peakSockets,sockets.size);
  s.once('close',()=>sockets.delete(s));
 });
 let bound=false,port=0;
 async function start(){
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen({host:HOST,port:0,exclusive:true},resolve);
  });
  bound=true;
  const adr=server.address();
  ensure(adr&&adr.address===HOST&&adr.family==='IPv4','LOCAL_BIND');
  port=adr.port;
  ensure(Number.isInteger(port)&&port>0,'EPHEMERAL_PORT');
  ensure(server.maxConnections===MAX_SOCKETS,'SOCKET_CAP');
  ensure(server.maxRequestsPerSocket===1,'REQUESTS_PER_SOCKET');
  ensure(server.headersTimeout===5000,'HEADER_TIMEOUT');
 }
 async function stop(){
  if(!bound)return;
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
  bound=false;
  ensure(server.address()===null,'LISTENER_CLOSED');
 }
 function request({forwarded='203.0.113.10'}={}){
  ensure(bound,'SERVER_CLOSED');
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error,value)=>{
    if(settled)return;
    settled=true;
    if(error)reject(Error('V89_CLIENT_'+error));else resolve(value);
   };
   const req=http.request({host:HOST,port,path:TARGET,method:'GET',agent:false,
    headers:{Host:'localhost',Connection:'close',Authorization:AUTH,
     'X-Forwarded-For':forwarded}},res=>{
    let bytes=0,body='';
    res.on('data',chunk=>{
     bytes+=chunk.length;
     if(bytes>MAX_RESPONSE_BYTES){req.destroy();return finish('BODY_LIMIT');}
     body+=chunk.toString('utf8');
    });
    res.on('end',()=>{
     try{
      const parsed=JSON.parse(body);
      ensure(parsed&&parsed.requestId&&
       (parsed.requestId===FIXED_ID||parsed.requestId==='unavailable'),'PUBLIC_ID');
      ensure(Object.keys(parsed).length===3,'PUBLIC_FIELDS');
      ensure(!body.includes(AUTH)&&!body.includes(USER)&&
       !body.includes(ORG)&&!body.includes(SITE),'NO_PRIVATE_RESPONSE');
      finish(null,{status:res.statusCode,code:parsed.code||null,
       retryAfter:res.headers['retry-after']||null});
     }catch{finish('BAD_RESPONSE');}
    });
   });
   req.setTimeout(3000,()=>req.destroy(Error('TIMEOUT')));
   req.on('error',()=>finish('NETWORK'));
   req.end();
  });
 }
 return {server,sockets,events,start,stop,request,
  get peakSockets(){return peakSockets;}};
}
function context(){
 return Object.freeze({ok:true,context:Object.freeze({
  userId:USER,organizationId:ORG,siteId:SITE,role:'CLIENT_VIEWER'
 })});
}
async function holdTwo(h,onBeforeRelease){
 const slots=[];
 let started=0,peak=0,active=0;
 let notify;
 const ready=new Promise(resolve=>{notify=resolve;});
 // Caller constructs authorize separately; this helper uses only the shared
 // hold handles supplied by caller, never spawns extra requests.
 return {slots,ready,started,peak,active,notify};
}
async function runCase01(){
 let active=0,peak=0,started=0,hold=true;
 const releases=[];
 let signal;
 const twoStarted=new Promise(resolve=>{signal=resolve;});
 const h=makeHarness({maxConcurrent:2,maxRequestsPerPeer:6,
  authorize:async()=>{
   active++;started++;peak=Math.max(peak,active);
   if(started===2)signal();
   if(hold)await new Promise(resolve=>releases.push(resolve));
   active--;
   return context();
  }});
 await h.start();
 try{
  const first=h.request(),second=h.request();
  // Do not leak rejected promises if the local deadline is missed.
  await Promise.race([twoStarted,wait(1200).then(()=>{throw Error('V89_CHECK_GATE_BARRIER');})]);
  const over=await h.request();
  ensure(over.status===503&&over.code==='RETRY_LATER','LOAD01_503');
  ensure(started===2&&peak===2,'LOAD01_INFLIGHT_CAP');
  hold=false;
  releases.splice(0).forEach(resolve=>resolve());
  const done=await Promise.all([first,second]);
  ensure(done.every(r=>r.status===200),'LOAD01_OWN_SUCCESS');
  const recovery=await h.request();
  ensure(recovery.status===200,'LOAD01_RECOVERY_AFTER_RELEASE');
  const admitted=h.events.filter(x=>x==='admitted').length;
  ensure(admitted===3&&h.events.includes('overloaded'),'LOAD01_ADMISSION');
  ensure(active===0,'LOAD01_RELEASED');
  ensure(h.peakSockets<=MAX_SOCKETS,'LOAD01_SOCKET_CAP');
  return {id:'LOAD-01',passed:true,expectedOverload:503,
   admitted,deniedOverload:1,recoveredAfterRelease:true,peakInFlight:peak,
   socketPeak:h.peakSockets};
 }finally{
  releases.splice(0).forEach(resolve=>resolve());
  await h.stop();
 }
}
async function runCase02(){
 let calls=0;
 const h=makeHarness({maxConcurrent:2,maxRequestsPerPeer:3,windowMs:1000,
  authorize:async()=>{calls++;return context();}});
 await h.start();
 try{
  const accepted=[];
  for(let i=0;i<3;i++){
   accepted.push(await h.request({forwarded:'198.51.100.'+(10+i)}));
  }
  ensure(accepted.every(r=>r.status===200),'LOAD02_ALLOW_INITIAL');
  const blocked=await h.request({forwarded:'203.0.113.99'});
  ensure(blocked.status===429&&blocked.code==='RATE_LIMITED','LOAD02_429');
  ensure(blocked.retryAfter==='1','LOAD02_RETRY_AFTER');
  ensure(calls===3,'LOAD02_HEADER_CANNOT_BYPASS');
  await wait(1100);
  const recovered=await h.request({forwarded:'203.0.113.200'});
  ensure(recovered.status===200&&calls===4,'LOAD02_WINDOW_RECOVERY');
  ensure(h.events.includes('rate_limited'),'LOAD02_AUDIT');
  ensure(h.peakSockets<=MAX_SOCKETS,'LOAD02_SOCKET_CAP');
  return {id:'LOAD-02',passed:true,acceptedBeforeLimit:3,rateLimited:1,
   expectedRateStatus:429,recoveredAfterWindow:true,
   spoofedForwardingNoBypass:true,socketPeak:h.peakSockets};
 }finally{await h.stop();}
}
async function runCase03(){
 let active=0,peak=0,started=0;
 let signal;
 const twoStarted=new Promise(resolve=>signal=resolve);
 const releases=[];
 const h=makeHarness({maxConcurrent:2,maxRequestsPerPeer:6,
  authorize:async()=>{
   started++;active++;peak=Math.max(peak,active);
   if(started===2)signal();
   await new Promise(resolve=>releases.push(resolve));
   active--;
   return context();
  }});
 const rssStart=process.memoryUsage().rss;
 await h.start();
 try{
  const first=h.request(),second=h.request();
  await Promise.race([twoStarted,wait(1200).then(()=>{throw Error('V89_CHECK_LOAD03_BARRIER');})]);
  const rejected=await h.request();
  ensure(rejected.status===503,'LOAD03_OVERLOAD');
  const rssPeak=process.memoryUsage().rss;
  // Only a modest sample check; NOT evidence of long-term RSS boundedness.
  ensure(rssPeak-rssStart<64*1024*1024,'LOAD03_SMALL_SAMPLE_MEMORY');
  ensure(h.peakSockets<=MAX_SOCKETS,'LOAD03_PEAK_SOCKET_CAP');
  releases.splice(0).forEach(resolve=>resolve());
  const served=await Promise.all([first,second]);
  ensure(served.every(r=>r.status===200)&&active===0,'LOAD03_NO_STALE_ACTIVE');
  await wait(60);
  ensure(h.sockets.size===0,'LOAD03_SOCKET_DRAIN');
  return {id:'LOAD-03',passed:true,partial:true,
   socketPeak:h.peakSockets,peakInFlight:peak,activeAfter:active,
   rssIncreaseMiB:Math.max(0,Math.round((rssPeak-rssStart)/1048576)),
   limits:'4 sockets, 2 in-flight, 64MiB test delta',
   scope:'single short sample; no database jobs, no long-duration memory proof'};
 }finally{
  releases.splice(0).forEach(resolve=>resolve());
  await h.stop();
 }
}
async function main(){
 if(!approvedContext(process.env)){
  process.stderr.write('V89 BLOCKED: authorized GitHub-hosted branch and scope required\n');
  process.exitCode=2;return;
 }
 const start=performance.now();
 const results=[];
 for(const run of [runCase01,runCase02,runCase03]){
  const result=await run();
  results.push(result);
  process.stdout.write('V89 CASE '+result.id+': PASS (small sample)\n');
 }
 const elapsedMs=Math.round(performance.now()-start);
 ensure(elapsedMs<SCRIPT_DEADLINE_MS,'RUNTIME_DEADLINE');
 process.stdout.write('V89 RESULT: '+JSON.stringify({
  version:'V89',realLocalHttp:true,externalNetwork:false,
  realAuth:false,realDatabase:false,restore:false,production:false,
  source:'real V63 V64 V65 V66 Node HTTP',maxSockets:MAX_SOCKETS,
  maxConcurrent:2,probeCount:12,groupsTested:3,groupsPassed:3,
  load03FullCapacityCertification:false,formalV67Verified:0,
  formalV67Pending:32,decision:'NO_GO',elapsedMs,results
 })+'\n');
}
if(require.main===module){
 const deadline=setTimeout(()=>{
  process.stderr.write('V89 FAILED: bounded runner deadline exceeded\n');
  process.exit(1);
 },SCRIPT_DEADLINE_MS);
 main().catch(e=>{
  const safe=/^V89_(?:CHECK|CLIENT)_[A-Z0-9_]+$/.test(e.message)
   ?e.message:'V89_UNCLASSIFIED_FAILURE';
  process.stderr.write(safe+'\n');
  process.exitCode=1;
 }).finally(()=>clearTimeout(deadline));
}
module.exports={approvedContext};
