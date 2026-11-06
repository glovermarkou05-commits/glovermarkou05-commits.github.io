'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {createV122PrivateAuthSessionRowReader,VERIFY,QUERY,READER}=
 require('../server/v122-private-auth-session-row-reader.cjs');
const now=2000000000;
const SUB='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const input=()=>({subject:SUB,sessionId:SID});
const row=()=>({id:SID,user_id:SUB,not_after:null});
const identity=()=>({session_user:READER,current_user:READER,is_replica:false});
function fixture({observed=row(),id=identity(),jwt=now+90,clock=()=>now,
 sqlError=null,connectError=null,brokenClient=false}={}){
 const trace={queries:[],released:[],connects:0};
 const client={
  async query(sql,args){
   trace.queries.push({sql,args});
   if(sqlError&&sql===sqlError)throw Error('fixture query unavailable');
   if(sql===VERIFY)return {rows:[id],rowCount:1};
   if(sql===QUERY)return observed===null?{rows:[],rowCount:0}:
    {rows:[observed],rowCount:1};
   throw Error('forbidden query');
  },
  release(e){trace.released.push(e);}
 };
 const pool={async connect(){
  trace.connects++;
  if(connectError)throw Error('fixture connection unavailable');
  return brokenClient?{query:client.query}:client;
 }};
 const reader=createV122PrivateAuthSessionRowReader({
  pool,nowSec:clock,trustedTokenExpiresAtSec:jwt
 });
 return {reader,trace};
}
test('V122 constructor requires a private pool and trusted JWT expiry',()=>{
 assert.throws(()=>createV122PrivateAuthSessionRowReader(),TypeError);
 assert.throws(()=>createV122PrivateAuthSessionRowReader({pool:{},trustedTokenExpiresAtSec:now+10}),TypeError);
 assert.throws(()=>createV122PrivateAuthSessionRowReader({
  pool:{connect:async()=>{}},trustedTokenExpiresAtSec:0
 }),TypeError);
 assert.throws(()=>createV122PrivateAuthSessionRowReader({
  pool:{connect:async()=>{}},trustedTokenExpiresAtSec:now+10,policyModel:'UNVERIFIED_LIVE'
 }),TypeError);
});
test('V122 reports lab-only and real Supabase session policies unverified',()=>{
 const {reader}=fixture();
 assert.deepEqual(reader.readiness,{
  labOnly:true,realSupabaseCredentials:false,authSessionRowExistenceOnly:true,
  customTimeoutPoliciesVerified:false,revocationLinearizable:false,
  productionRoleApproved:false,productionAuthorized:false,
  formalV67Pass:0,decision:'NO_GO'
 });
});
test('V122 reads only id,user_id,not_after from a primary on the SAME client',async()=>{
 const {reader,trace}=fixture();
 const answer=await reader.readPrimarySession(input());
 assert.deepEqual(answer,{
  active:true,checkedAtSec:now,expiresAtSec:now+90,
  primaryRead:true,revocationChecked:true,
  sessionId:SID,subject:SUB
 });
 assert.equal(Object.isFrozen(answer),true);
 assert.deepEqual(trace.queries.map(x=>x.sql),[VERIFY,QUERY]);
 assert.deepEqual(trace.queries[1].args,[SID,SUB]);
 assert.equal(trace.connects,1);
 assert.deepEqual(trace.released,[true]);
});
test('V122 rejects client extra fields before borrowing a connection',async()=>{
 const {reader,trace}=fixture();
 for(const data of [
  {...input(),jwt:'forged'}, {...input(),role:'postgres'},
  {...input(),user_metadata:{}}, {...input(),verifiedTokenExpiresAtSec:now+90},
  {...input(),not_after:new Date()}, {...input(),proof:'x'},
  {subject:SUB}, {sessionId:SID}, null, [], 'bad'
 ]){
  assert.equal(await reader.readPrimarySession(data),null);
 }
 assert.equal(trace.connects,0);
});
test('V122 rejects invalid UUIDs and uppercases normalize only after validation',async()=>{
 const {reader,trace}=fixture();
 assert.equal(await reader.readPrimarySession({subject:'x',sessionId:SID}),null);
 assert.equal(await reader.readPrimarySession({subject:SUB,sessionId:'not-a-uuid'}),null);
 assert.equal(trace.connects,0);
});
test('V122 missing session means revoked/absent and is denied',async()=>{
 const {reader,trace}=fixture({observed:null});
 assert.equal(await reader.readPrimarySession(input()),null);
 assert.deepEqual(trace.released,[true]);
});
test('V122 cannot treat a session belonging to a different user as active',async()=>{
 const {reader}=fixture({observed:{...row(),user_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}});
 assert.equal(await reader.readPrimarySession(input()),null);
});
test('V122 rejects wrong physical DB role, replica and malformed identity',async()=>{
 for(const id of [
  {session_user:'postgres',current_user:'postgres',is_replica:false},
  {session_user:'postgres',current_user:READER,is_replica:false},
  {session_user:READER,current_user:READER,is_replica:true},
  {session_user:READER,current_user:READER,is_replica:'f'},
  {...identity(),extra:true},
  null
 ]){
  const {reader,trace}=fixture({id});
  assert.equal(await reader.readPrimarySession(input()),null);
  assert.equal(trace.queries.length,1);
  assert.deepEqual(trace.released,[true]);
 }
});
test('V122 denies expired verified JWT without opening a connection',async()=>{
 const {reader,trace}=fixture({jwt:now});
 assert.equal(await reader.readPrimarySession(input()),null);
 assert.equal(trace.connects,0);
});
test('V122 not_after earlier than JWT expiration bounds validity',async()=>{
 const {reader}=fixture({observed:{...row(),not_after:new Date((now+35)*1000)}});
 assert.equal((await reader.readPrimarySession(input())).expiresAtSec,now+35);
});
test('V122 not_after later than JWT expiration cannot extend JWT',async()=>{
 const {reader}=fixture({observed:{...row(),not_after:new Date((now+400)*1000)}});
 assert.equal((await reader.readPrimarySession(input())).expiresAtSec,now+90);
});
test('V122 fails closed for expired or invalid not_after',async()=>{
 for(const not_after of [new Date((now-1)*1000),new Date('invalid'),'',now+90,undefined]){
  const {reader}=fixture({observed:{...row(),not_after}});
  assert.equal(await reader.readPrimarySession(input()),null);
 }
});
test('V122 denies query failures and always destroys connection',async()=>{
 for(const sql of [VERIFY,QUERY]){
  const {reader,trace}=fixture({sqlError:sql});
  assert.equal(await reader.readPrimarySession(input()),null);
  assert.deepEqual(trace.released,[true]);
 }
});
test('V122 denies pool failure or missing release',async()=>{
 const a=fixture({connectError:true});
 assert.equal(await a.reader.readPrimarySession(input()),null);
 const b=fixture({brokenClient:true});
 assert.equal(await b.reader.readPrimarySession(input()),null);
});
test('V122 denies stale primary read taking more than 2 seconds',async()=>{
 let hits=0;
 const {reader,trace}=fixture({clock:()=>++hits===1?now:now+3});
 assert.equal(await reader.readPrimarySession(input()),null);
 assert.deepEqual(trace.released,[true]);
});
test('V122 refuses a time source moving backward across SELECT',async()=>{
 let hits=0;
 const {reader}=fixture({clock:()=>++hits===1?now:now-1});
 assert.equal(await reader.readPrimarySession(input()),null);
});
test('V122 malformed time source denies without leaking an error',async()=>{
 for(const clock of [()=>0,()=>Number.NaN,()=>{throw Error('clock lost');}]){
  const {reader}=fixture({clock});
  assert.equal(await reader.readPrimarySession(input()),null);
 }
});
test('V122 source contains no Supabase key, query-all rows or privilege grants',()=>{
 const source=readFileSync(resolve(__dirname,'../server/v122-private-auth-session-row-reader.cjs'),'utf8');
 for(const forbidden of [
  "require('pg')","require('@supabase/supabase-js')",'process.env','SELECT *',
  'CREATE ROLE','GRANT SELECT','SECURITY DEFINER','service_role','fetch(',
  'console.log(','productionAuthorized:true'
 ])assert.equal(source.includes(forbidden),false,forbidden);
 assert.match(QUERY,/WHERE id=\$1::uuid AND user_id=\$2::uuid/);
 assert.match(VERIFY,/pg_is_in_recovery\(\)/);
});
