'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync}=require('node:crypto');
const {createPinnedAuthContractsV74,createPinnedAuthVerifierV74}=
  require('../server/pinned-auth-contract-v74.cjs');
const ISS='https://issuer.test/auth/v1', URL=ISS+'/.well-known/jwks.json';
const SUBJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW=1792752000;
const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const ec=Object.freeze({kid:'key-1',alg:'ES256',use:'sig',...pair.publicKey.export({format:'jwk'})});
function makeJwks(keys=[ec],patch={}) {
 return {status:200,finalUrl:URL,redirected:false,mediaType:'application/json',
   body:JSON.stringify({keys}),...patch};
}
function sessionRow(patch={}) {
 return {active:true,revocationChecked:true,subject:SUBJECT,sessionId:SESSION,
   checkedAtSec:NOW,expiresAtSec:NOW+3600,...patch};
}
function setup(overrides={}) {
 const seen={jwks:[],sessions:[]};
 const callbacks={issuer:ISS,audience:'authenticated',nowSec:()=>NOW,
  requestJwks:async request=>{seen.jwks.push(request);return makeJwks();},
  readSession:async request=>{seen.sessions.push(request);return sessionRow();},
  ...overrides};
 return {c:createPinnedAuthContractsV74(callbacks),seen,callbacks};
}
test('derived JWKS URL is pinned to explicit issuer, no client URL field',()=>{
 const {c}=setup();assert.equal(c.issuer,ISS);assert.equal(c.jwksUrl,URL);
 assert.equal(c.readiness.decision,'NO_GO');assert.equal(c.readiness.directNetworkClient,false);
});
test('zero fetches or session queries occur during contract creation',()=>{
 let used=0;setup({requestJwks:()=>{used++},readSession:()=>{used++}});
 assert.equal(used,0);
});
test('JWKS adapter requests GET only from pinned URL with restrictive transport hints',async()=>{
 const {c,seen}=setup();const x=await c.loadPublicKeys();
 assert.equal(x.keys.length,1);assert.equal(x.keys[0].kid,'key-1');
 assert.equal(seen.jwks.length,1);
 const r=seen.jwks[0];
 assert.deepEqual(Object.keys(r).sort(),['accept','maxBytes','method','redirect','signal','url']);
 assert.equal(r.url,URL);assert.equal(r.method,'GET');
 assert.equal(r.redirect,'error');assert.equal(r.maxBytes,16384);
 assert.ok(Object.isFrozen(r));
});
test('JWK object from source is converted to V72 expected pinned public entry',async()=>{
 const {c}=setup();const entry=(await c.loadPublicKeys()).keys[0];
 assert.equal(entry.alg,'ES256');assert.equal(entry.jwk.crv,'P-256');
 assert.deepEqual(Object.keys(entry).sort(),['alg','jwk','kid']);
 assert.ok(Object.isFrozen(entry)&&Object.isFrozen(entry.jwk));
});
test('JSON transport may provide a Buffer rather than string',async()=>{
 const {c}=setup({requestJwks:async()=>makeJwks([ec],{body:Buffer.from(JSON.stringify({keys:[ec]}))})});
 assert.equal((await c.loadPublicKeys()).keys[0].kid,'key-1');
});
test('rejects HTTP status other than 200',async()=>{
 for(const status of [201,204,301,302,304,400,401,403,429,500]) {
  const {c}=setup({requestJwks:async()=>makeJwks([ec],{status})});
  assert.equal(await c.loadPublicKeys(),null);
 }
});
test('rejects redirect or JWKS response from any other final URL',async()=>{
 for(const response of [{redirected:true},{finalUrl:'https://evil.test/'},
   {finalUrl:'http://issuer.test/auth/v1/.well-known/jwks.json'},
   {finalUrl:URL+'?redirect=1'},{finalUrl:undefined}]) {
  const {c}=setup({requestJwks:async()=>makeJwks([ec],response)});
  assert.equal(await c.loadPublicKeys(),null);
 }
});
test('rejects unsafe media types but accepts application/jwk-set+json',async()=>{
 for(const mediaType of ['text/html','application/javascript','application/jsonp','','application/json; charset=latin1']){
  const {c}=setup({requestJwks:async()=>makeJwks([ec],{mediaType})});
  assert.equal(await c.loadPublicKeys(),null);
 }
 const {c}=setup({requestJwks:async()=>makeJwks([ec],{mediaType:'application/jwk-set+json'})});
 assert.equal((await c.loadPublicKeys()).keys.length,1);
});
test('rejects oversized, missing, primitive, malformed or non-UTF8 bodies',async()=>{
 const candidates=[null,undefined,123,{},'', 'not-json','[]', '{}',
  Buffer.from([0xff]),JSON.stringify({keys:[ec],extra:true}),
  ' '.repeat(17000)+JSON.stringify({keys:[ec]})];
 for(const body of candidates) {
  const {c}=setup({requestJwks:async()=>makeJwks([ec],{body})});
  assert.equal(await c.loadPublicKeys(),null);
 }
});
test('accepts two distinct pinned keys and refuses empty or excessive JWKS',async()=>{
 const second={...ec,kid:'key-2'};
 const two=setup({requestJwks:async()=>makeJwks([ec,second])});
 assert.equal((await two.c.loadPublicKeys()).keys.length,2);
 for(const keys of [[],Array.from({length:9},(_,i)=>({...ec,kid:'key-'+i}))]){
  const {c}=setup({requestJwks:async()=>makeJwks(keys)});
  assert.equal(await c.loadPublicKeys(),null);
 }
});
test('rejects duplicate kid even if keys differ',async()=>{
 const {c}=setup({requestJwks:async()=>makeJwks([ec,ec])});
 assert.equal(await c.loadPublicKeys(),null);
});
test('rejects secret or private JWK material in discovery response',async()=>{
 for(const key of [{...ec,d:'private'},{...ec,k:'private'},{...ec,x5u:'https://evil.test'},
   {...ec,jku:'https://evil.test'}]) {
  const {c}=setup({requestJwks:async()=>makeJwks([key])});
  assert.equal(await c.loadPublicKeys(),null);
 }
});
test('rejects bad JWK purpose, operations, algorithm and curve',async()=>{
 for(const key of [{...ec,use:'enc'},{...ec,key_ops:['sign']},
  {...ec,key_ops:['verify','sign']},{...ec,alg:'HS256'},
  {...ec,alg:'RS256'},{...ec,crv:'P-384'},{...ec,kty:'oct'}]){
  const {c}=setup({requestJwks:async()=>makeJwks([key])});
  assert.equal(await c.loadPublicKeys(),null);
 }
});
test('a rejected or failing JWKS callback denies without leaking exceptions',async()=>{
 for(const requestJwks of [()=>{throw Error('PRIVATE_URL')},async()=>{throw Error('PRIVATE_TOKEN')}]){
  const {c}=setup({requestJwks});assert.equal(await c.loadPublicKeys(),null);
 }
});
test('no JWKS transport callback runs when signal already aborted',async()=>{
 let calls=0;const controller=new AbortController();controller.abort();
 const {c}=setup({requestJwks:()=>{calls++;return makeJwks()}});
 assert.equal(await c.loadPublicKeys({signal:controller.signal}),null);
 assert.equal(calls,0);
});
test('JWKS result arriving after abort is discarded',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 const ctrl=new AbortController();const {c}=setup({requestJwks:()=>pending});
 const result=c.loadPublicKeys({signal:ctrl.signal});
 ctrl.abort();release(makeJwks());
 assert.equal(await result,null);
});
test('session query sends only identifiers and AbortSignal',async()=>{
 const {c,seen}=setup();const r=await c.checkSession({subject:SUBJECT,sessionId:SESSION});
 assert.deepEqual(r,{active:true,subject:SUBJECT,sessionId:SESSION});
 assert.equal(seen.sessions.length,1);
 assert.deepEqual(Object.keys(seen.sessions[0]).sort(),['sessionId','signal','subject']);
 assert.ok(Object.isFrozen(r)&&Object.isFrozen(seen.sessions[0]));
});
test('revoked sessions return a validated negative result',async()=>{
 const {c}=setup({readSession:async()=>sessionRow({active:false})});
 assert.deepEqual(await c.checkSession({subject:SUBJECT,sessionId:SESSION}),
   {active:false,subject:SUBJECT,sessionId:SESSION});
});
test('already expired session returns negative even when source claims active',async()=>{
 const {c}=setup({readSession:async()=>sessionRow({expiresAtSec:NOW})});
 assert.deepEqual(await c.checkSession({subject:SUBJECT,sessionId:SESSION}),
   {active:false,subject:SUBJECT,sessionId:SESSION});
});
test('stale or future session freshness evidence is rejected',async()=>{
 for(const checkedAtSec of [NOW-6,NOW+1,null,0,'1792752000']) {
  const {c}=setup({readSession:async()=>sessionRow({checkedAtSec})});
  assert.equal(await c.checkSession({subject:SUBJECT,sessionId:SESSION}),null);
 }
});
test('unverified revocation state cannot grant a session',async()=>{
 for(const x of [false,null,undefined,'true']) {
  const {c}=setup({readSession:async()=>sessionRow({revocationChecked:x})});
  assert.equal(await c.checkSession({subject:SUBJECT,sessionId:SESSION}),null);
 }
});
test('mismatched subject or session id fails closed',async()=>{
 for(const result of [sessionRow({subject:SESSION}),sessionRow({sessionId:SUBJECT}),
  sessionRow({active:'true'}),sessionRow({expiresAtSec:'future'}),null]) {
  const {c}=setup({readSession:async()=>result});
  assert.equal(await c.checkSession({subject:SUBJECT,sessionId:SESSION}),null);
 }
});
test('invalid subject or session UUID fails before querying any source',async()=>{
 const {c,seen}=setup();
 assert.equal(await c.checkSession({subject:'bad',sessionId:SESSION}),null);
 assert.equal(await c.checkSession({subject:SUBJECT,sessionId:'bad'}),null);
 assert.equal(seen.sessions.length,0);
});
test('session lookup errors and aborts never grant authorization',async()=>{
 for(const readSession of [()=>{throw Error('PRIVATE_DB')},async()=>{throw Error('PRIVATE_DB')}]){
  const {c}=setup({readSession});
  assert.equal(await c.checkSession({subject:SUBJECT,sessionId:SESSION}),null);
 }
 const ctrl=new AbortController();ctrl.abort();let called=0;
 const {c}=setup({readSession:async()=>{called++;return sessionRow()}});
 assert.equal(await c.checkSession({subject:SUBJECT,sessionId:SESSION},{signal:ctrl.signal}),null);
 assert.equal(called,0);
});
test('session completion after cancellation is denied',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 const ctrl=new AbortController();const {c}=setup({readSession:()=>pending});
 const result=c.checkSession({subject:SUBJECT,sessionId:SESSION},{signal:ctrl.signal});
 ctrl.abort();release(sessionRow());
 assert.equal(await result,null);
});
test('invalid configuration and externally controlled endpoint are forbidden',()=>{
 for(const patch of [{issuer:'http://issuer.test/auth/v1'},
   {issuer:'https://127.0.0.1/auth/v1'},{issuer:'https://localhost/auth/v1'},
   {issuer:'https://internal.local/auth/v1'},{issuer:'https://issuer.test:444/auth/v1'},
   {issuer:'https://user:pass@issuer.test/auth/v1'},
   {issuer:ISS+'?key=SECRET'}, {issuer:ISS+'/'},
   {requestJwks:null},{readSession:1},{audience:''},{maxJwksBytes:20},
   {maxSessionStalenessSec:31},{jwksUrl:'https://evil.test/jwks'},
   {port:443},{allowProduction:true},{secretKey:'secret'}]) {
  const {callbacks}=setup();
  assert.throws(()=>createPinnedAuthContractsV74({...callbacks,...patch}),TypeError);
 }
});
test('default readiness never confuses simulated checks with real Supabase',()=>{
 const {c}=setup();
 assert.equal(c.readiness.authoritativeSessionStoreConnected,false);
 assert.equal(c.readiness.tlsAndDnsVerified,false);
 assert.equal(c.readiness.productionAuthorized,false);
 assert.ok(Object.isFrozen(c.readiness));
});
test('verifier factory requires the same strict pinned configuration',()=>{
 const {callbacks}=setup();
 assert.equal(typeof createPinnedAuthVerifierV74(callbacks).verifyAccessToken,'function');
 assert.throws(()=>createPinnedAuthVerifierV74({...callbacks,allowNetwork:true}),TypeError);
});
