'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {createInsertOnlyPgAdapterV115,INSERT,ROLE_QUERY}
 =require('../server/v115-insert-only-pg-adapter.cjs');
const {createAtomicMfaRedemptionV109}
 =require('../server/v109-atomic-mfa-redemption.cjs');
const NOW=2000000000;
const EVENT='a'.repeat(64);
const UID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SITE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const request=(extra={})=>({
 eventKey:EVENT,consumeUntilSec:NOW+300,
 action:'publish',organizationId:ORG,siteId:SITE,signal:undefined,...extra
});
function fixture({onQuery,connectError,now=()=>NOW,releaseFn}={}){
 const state={queries:[],released:[],clients:0};
 const pool={
  async connect(){
   state.clients++;
   if(connectError)throw connectError;
   const client={
    async query(sql,args){
     state.queries.push({sql,args});
     if(onQuery)return onQuery(sql,args,state);
     if(sql===ROLE_QUERY)return {rows:[{current_user:'mg_auth_ledger_writer'}]};
     if(sql==='BEGIN')return {command:'BEGIN'};
     if(sql===INSERT)return {command:'INSERT',rowCount:1};
     if(sql==='COMMIT')return {command:'COMMIT'};
     if(sql==='ROLLBACK')return {command:'ROLLBACK'};
     throw Error('unrecognized');
    },
    release(error){
     state.released.push(error);
     if(releaseFn)releaseFn(error);
    }
   };
   return client;
  }
 };
 return {a:createInsertOnlyPgAdapterV115({pool,nowSec:now}),state};
}
const denied=Object.freeze({committed:false,inserted:false,shared:false,storedUntilSec:0});
test('V115 requires a trusted pool and clock',()=>{
 assert.throws(()=>createInsertOnlyPgAdapterV115(),TypeError);
 assert.throws(()=>createInsertOnlyPgAdapterV115({pool:{connect:1}}),TypeError);
 assert.throws(()=>createInsertOnlyPgAdapterV115({pool:{connect(){}} ,nowSec:4}),TypeError);
});
test('readiness remains NO_GO even for a valid injected pool',()=>{
 assert.deepEqual(fixture().a.readiness,{
  backendConnected:false,primarySessionConnected:false,
  businessOperationIntegrated:false,livePrivilegedRoleReviewed:false,
  productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 });
});
test('safe INSERT is parameterized, uses only writer and COMMIT confirmation',async()=>{
 const {a,state}=fixture();
 const r=await a.consumeEventAtomically(request());
 assert.deepEqual(r,{committed:true,inserted:true,shared:true,storedUntilSec:NOW+300});
 assert.deepEqual(state.queries.map(x=>x.sql),[ROLE_QUERY,'BEGIN',INSERT,'COMMIT']);
 const insert=state.queries[2];
 assert.deepEqual(insert.args,[EVENT,NOW-10,NOW+300]);
 assert.equal(insert.sql.includes(EVENT),false);
 assert.equal(insert.sql.includes('RETURNING'),false);
 assert.equal(insert.sql.includes('ON CONFLICT'),false);
 assert.equal(state.released.length,1);
 assert.equal(state.released[0],undefined);
});
test('unsafe client-supplied role or SQL string never reaches DB',async()=>{
 const {a,state}=fixture();
 for(const key of ['role','jwt','password','sql','metadata']){
  assert.deepEqual(await a.consumeEventAtomically(request({[key]:'fake'})),denied);
 }
 assert.equal(state.clients,0);
});
test('malformed HMAC hash and stale retention are rejected before connect',async()=>{
 const {a,state}=fixture();
 for(const p of [
  {eventKey:'bad'},{eventKey:'A'.repeat(64)},
  {consumeUntilSec:NOW-1},{consumeUntilSec:NOW+500},
  {consumeUntilSec:3.5},{consumeUntilSec:null},{consumeUntilSec:0}
 ]){
  assert.deepEqual(await a.consumeEventAtomically(request(p)),denied);
 }
 assert.equal(state.clients,0);
});
test('stale proof denied according to fixed 300s factor age',async()=>{
 const {a,state}=fixture({now:()=>NOW+320});
 assert.deepEqual(await a.consumeEventAtomically(request()),denied);
 assert.equal(state.clients,0);
});
test('invalid or throwing wall clock denies without DB access',async()=>{
 for(const now of [()=>0,()=>3.2,()=>{throw Error('clock broken');}]){
  const {a,state}=fixture({now});
  assert.deepEqual(await a.consumeEventAtomically(request()),denied);
  assert.equal(state.clients,0);
 }
});
test('abort signal before connection denies without DB access',async()=>{
 const ctl=new AbortController();ctl.abort();
 const {a,state}=fixture();
 assert.deepEqual(await a.consumeEventAtomically(request({signal:ctl.signal})),denied);
 assert.equal(state.clients,0);
});
test('invalid signal type fails closed',async()=>{
 const {a,state}=fixture();
 assert.deepEqual(await a.consumeEventAtomically(request({signal:'fake'})),denied);
 assert.equal(state.clients,0);
});
test('incorrect connected Postgres identity denies before BEGIN',async()=>{
 const {a,state}=fixture({onQuery:sql=>sql===ROLE_QUERY?
 {rows:[{current_user:'postgres'}]}: {command:sql}});
 assert.deepEqual(await a.consumeEventAtomically(request()),denied);
 assert.deepEqual(state.queries.map(x=>x.sql),[ROLE_QUERY]);
});
test('malformed Postgres identity result fails closed',async()=>{
 for(const rows of [[],null,[{current_user:'mg_auth_ledger_writer',role:'admin'}]]){
  const {a}=fixture({onQuery:sql=>sql===ROLE_QUERY?{rows}:null});
  assert.deepEqual(await a.consumeEventAtomically(request()),denied);
 }
});
test('missing PG connection and connection timeout fail safely',async()=>{
 for(const connectError of [Error('down'),Error('authentication denied')]){
  const {a}=fixture({connectError});
  assert.deepEqual(await a.consumeEventAtomically(request()),denied);
 }
});
test('SQLSTATE 23505 is denied and transaction is rolled back',async()=>{
 const e=Object.assign(Error('duplicate'),{code:'23505'});
 const {a,state}=fixture({onQuery:sql=>{
  if(sql===ROLE_QUERY)return {rows:[{current_user:'mg_auth_ledger_writer'}]};
  if(sql===INSERT)throw e;
  return {command:sql};
 }});
 assert.deepEqual(await a.consumeEventAtomically(request()),denied);
 assert.deepEqual(state.queries.map(x=>x.sql),[ROLE_QUERY,'BEGIN',INSERT,'ROLLBACK']);
 assert.equal(state.released[0],undefined);
});
test('database failure on INSERT cannot be misread as duplicate accepted',async()=>{
 const {a,state}=fixture({onQuery:sql=>{
  if(sql===ROLE_QUERY)return {rows:[{current_user:'mg_auth_ledger_writer'}]};
  if(sql===INSERT)throw Error('disconnected');
  return {command:sql};
 }});
 assert.deepEqual(await a.consumeEventAtomically(request()),denied);
 assert.ok(state.queries.some(x=>x.sql==='ROLLBACK'));
});
test('INSERT 0 or incorrect command fails closed and rolls back',async()=>{
 for(const result of [{command:'INSERT',rowCount:0},{command:'UPDATE',rowCount:1},null]){
  const {a,state}=fixture({onQuery:sql=>{
   if(sql===ROLE_QUERY)return {rows:[{current_user:'mg_auth_ledger_writer'}]};
   if(sql===INSERT)return result;
   return {command:sql};
  }});
  assert.deepEqual(await a.consumeEventAtomically(request()),denied);
  assert.equal(state.queries.at(-1).sql,'ROLLBACK');
 }
});
test('commit timeout is unknown and evicts the physical connection',async()=>{
 const {a,state}=fixture({onQuery:sql=>{
  if(sql===ROLE_QUERY)return {rows:[{current_user:'mg_auth_ledger_writer'}]};
  if(sql==='COMMIT')throw Error('commit response lost');
  if(sql===INSERT)return {command:'INSERT',rowCount:1};
  return {command:sql};
 }});
 assert.deepEqual(await a.consumeEventAtomically(request()),denied);
 assert.equal(state.queries.at(-1).sql,'COMMIT');
 assert.equal(state.released.length,1);
 assert.ok(state.released[0] instanceof Error);
});
test('malformed COMMIT confirmation is denied and connection evicted',async()=>{
 const {a,state}=fixture({onQuery:sql=>{
  if(sql===ROLE_QUERY)return {rows:[{current_user:'mg_auth_ledger_writer'}]};
  if(sql===INSERT)return {command:'INSERT',rowCount:1};
  if(sql==='COMMIT')return {command:'SELECT'};
  return {command:sql};
 }});
 assert.deepEqual(await a.consumeEventAtomically(request()),denied);
 assert.ok(state.released[0] instanceof Error);
});
test('BEGIN uncertainty causes rollback attempt before returning connection',async()=>{
 const {a,state}=fixture({onQuery:sql=>{
  if(sql===ROLE_QUERY)return {rows:[{current_user:'mg_auth_ledger_writer'}]};
  if(sql==='BEGIN')throw Error('begin reply lost');
  return {command:sql};
 }});
 assert.deepEqual(await a.consumeEventAtomically(request()),denied);
 assert.equal(state.queries.at(-1).sql,'ROLLBACK');
});
test('rollback failure evicts connection and never claims success',async()=>{
 const {a,state}=fixture({onQuery:sql=>{
  if(sql===ROLE_QUERY)return {rows:[{current_user:'mg_auth_ledger_writer'}]};
  if(sql===INSERT)throw Error('duplicate');
  if(sql==='ROLLBACK')throw Error('rollback failed');
  return {command:sql};
 }});
 assert.deepEqual(await a.consumeEventAtomically(request()),denied);
 assert.ok(state.released[0] instanceof Error);
});
test('abort after INSERT triggers rollback before COMMIT',async()=>{
 const ctl=new AbortController();
 const {a,state}=fixture({onQuery:sql=>{
  if(sql===ROLE_QUERY)return {rows:[{current_user:'mg_auth_ledger_writer'}]};
  if(sql===INSERT){ctl.abort();return {command:'INSERT',rowCount:1};}
  return {command:sql};
 }});
 assert.deepEqual(await a.consumeEventAtomically(request({signal:ctl.signal})),denied);
 assert.equal(state.queries.at(-1).sql,'ROLLBACK');
});
test('only a trusted adapter output can satisfy V109 and still blocks production',async()=>{
 const {a}=fixture();
 const gate=createAtomicMfaRedemptionV109({
  readPrimarySession:async()=>({
   active:true,checkedAtSec:NOW,expiresAtSec:NOW+30,
   primaryRead:true,revocationChecked:true,sessionId:SESSION,subject:UID
  }),
  authorizeResource:async()=>true,
  consumeEventAtomically:a.consumeEventAtomically,
  ledgerHmacKey:Buffer.alloc(32,9),
  nowSec:()=>NOW
 });
 const r=await gate.redeem({
  proof:{
   checkedAtSec:NOW,factorOwnershipVerified:true,method:'totp',
   provenanceReviewed:true,sessionBoundByAuthorizedFlow:true,
   sessionId:SESSION,subject:UID,verified:true,verifiedAtSec:NOW-10
  },
  action:'publish',organizationId:ORG,siteId:SITE,signal:undefined
 });
 assert.equal(r.ok,true);
 assert.equal(r.productionAuthorized,false);
 assert.equal(r.formalV67Pass,0);
});
test('adapter has no network, secrets, filesystem, SQL interpolation or dynamic role setting',()=>{
 const text=readFileSync(resolve(__dirname,'../server/v115-insert-only-pg-adapter.cjs'),'utf8');
 for(const forbidden of ['require(\'pg\')','createClient(','fetch(','http.request(',
  'process.env','SET ROLE','SECURITY DEFINER','ON CONFLICT','RETURNING','CREATE TABLE',
  'DROP TABLE','writeFile(','console.log(']){
  assert.equal(text.includes(forbidden),false,forbidden);
 }
});
