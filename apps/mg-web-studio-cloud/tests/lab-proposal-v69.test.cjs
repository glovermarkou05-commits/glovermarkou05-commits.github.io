'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {reviewLabProposalV69} = require('../server/lab-proposal-v69.cjs');
const valid=()=>({interface:'127.0.0.1',port:8765,transport:'HTTP_ONLY_LOOPBACK',
  database:'SYNTHETIC_ONLY',identities:'SYNTHETIC_ONLY',exposure:'LOCAL_MACHINE_ONLY',
  purpose:'HTTP_PARSER_VALIDATION',nodeMajor:22});
test('default review has no permission or network side effects',()=>{
  const r=reviewLabProposalV69();assert.equal(r.decision,'NO_GO');
  assert.equal(r.proposalHasSafeShape,false);assert.equal(r.portOpened,false);
  assert.equal(r.labAuthorized,false);assert.equal(r.deploymentAuthorized,false);
});
test('safe, complete proposal is only eligible for human review',()=>{
  const r=reviewLabProposalV69(valid());assert.equal(r.proposalHasSafeShape,true);
  assert.deepEqual(r.issues,[]);assert.equal(r.labAuthorized,false);
  assert.equal(r.httpParserTested,false);assert.equal(r.decision,'NO_GO');
});
test('both IPv4 and IPv6 loopback are allowed in proposals',()=>{
  assert.equal(reviewLabProposalV69({...valid(),interface:'::1'}).proposalHasSafeShape,true);
});
test('non-loopback and hostname addresses cannot be proposed',()=>{
  for(const name of ['0.0.0.0','localhost','::','192.168.1.10','example.com',undefined,7])
    assert.equal(reviewLabProposalV69({...valid(),interface:name}).proposalHasSafeShape,false);
});
test('port must be explicit integer and above privileged range',()=>{
  for(const port of [undefined,0,80,443,1023,65536,9000.5,'8765',-1]){
    assert.ok(reviewLabProposalV69({...valid(),port}).issues.includes('EXPLICIT_UNPRIVILEGED_PORT_REQUIRED'));
  }
});
test('does not accept cloud, production, or external databases',()=>{
  for(const database of ['SUPABASE_STAGING','POSTGRES_PRODUCTION','REMOTE_DB','STAGING',undefined])
    assert.ok(reviewLabProposalV69({...valid(),database}).issues.includes('INCOMPATIBLE_DATABASE'));
});
test('does not allow real JWT, real people or real accounts',()=>{
  for(const identities of ['REAL_AUTH','PRODUCTION_ACCOUNTS',undefined])
    assert.ok(reviewLabProposalV69({...valid(),identities}).issues.includes('INCOMPATIBLE_IDENTITIES'));
});
test('does not accept external exposure or proxy sharing',()=>{
  for(const exposure of ['LAN','PUBLIC','CLOUD','VPN',undefined])
    assert.ok(reviewLabProposalV69({...valid(),exposure}).issues.includes('INCOMPATIBLE_EXPOSURE'));
});
test('exotic transports are rejected until separately reviewed',()=>{
  for(const transport of ['HTTPS_PUBLIC','HTTP2','HTTP_EXTERNALLY_ACCESSIBLE',undefined])
    assert.ok(reviewLabProposalV69({...valid(),transport}).issues.includes('INCOMPATIBLE_TRANSPORT'));
});
test('purpose must remain bounded to HTTP parser validation',()=>{
  assert.ok(reviewLabProposalV69({...valid(),purpose:'PUBLISH_SITE'}).issues.includes('INCOMPATIBLE_PURPOSE'));
});
test('Node major is checked without reading the runtime automatically',()=>{
  for(const nodeMajor of [20,21,27,undefined,'22',NaN])
    assert.ok(reviewLabProposalV69({...valid(),nodeMajor}).issues.includes('SUPPORTED_NODE_MAJOR_REQUIRED'));
});
test('unknown flags including claimed approvals are rejected, never honored',()=>{
  for(const x of [{approved:true},{production:true},{listen:true},{force:true},
    {DATABASE_URL:'postgres://secret'},{networkAuthorized:true}]){
    const r=reviewLabProposalV69({...valid(),...x});
    assert.equal(r.proposalHasSafeShape,false);assert.equal(r.labAuthorized,false);
  }
});
test('invalid data structures fail closed without leaking their contents',()=>{
  for(const p of [null,[],22,'Authorization: Bearer secret',Object.create(valid())]){
    const r=reviewLabProposalV69(p);assert.equal(r.proposalHasSafeShape,false);
    assert.ok(!JSON.stringify(r).includes('secret'));
  }
});
test('returned decisions and issues are immutable',()=>{
  const r=reviewLabProposalV69({...valid(),interface:'bad'});
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.issues));
  assert.throws(()=>r.issues.push('BYPASS'),TypeError);
});
test('proposal review cannot output tokens, supplied IPs, ports or credentials',()=>{
  const p={...valid(),interface:'192.168.0.7',port:8089,credentials:'Bearer PRIVATE'};
  const text=JSON.stringify(reviewLabProposalV69(p));
  assert.ok(!text.includes('PRIVATE'));assert.ok(!text.includes('192.168.0.7'));
  assert.ok(!text.includes('8089'));
});
