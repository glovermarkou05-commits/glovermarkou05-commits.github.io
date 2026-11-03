'use strict';
// V116: Disposable CI PG17 only. Superuser -> SET ROLE is a TEST HARNESS,
// NOT a production backend principal or approved Supabase connection.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createInsertOnlyPgAdapterV115}=require('../server/v115-insert-only-pg-adapter.cjs');
const {createAtomicMfaRedemptionV109}=require('../server/v109-atomic-mfa-redemption.cjs');

if(process.env.V116_DISPOSABLE_ONLY!=='1'||process.env.V116_PG_HOST!=='127.0.0.1'||
   !/^\d{2,5}$/.test(process.env.V116_PG_PORT||'')||
   process.env.V116_PG_DB!=='qa_ledger'||process.env.CI!=='true')
 throw Error('V116 must run only against isolated CI postgres on loopback');
for(const key of ['DATABASE_URL','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY',
 'MG_AUTH_QA_URL','SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN'])
 if(process.env[key])throw Error('Unexpected external DB configuration: '+key);
const {Client}=require('pg');
const config=Object.freeze({
 host:'127.0.0.1',port:Number(process.env.V116_PG_PORT),database:'qa_ledger',
 user:'postgres',password:process.env.V116_PG_TEST_PASSWORD,
 connectionTimeoutMillis:6000,statement_timeout:5000,query_timeout:6000,
 application_name:'mg_v116_disposable_ci_only'
});
if(config.password!=='v116-disposable-only-no-live-credentials')
 throw Error('Unexpected CI-only postgres fixture password');
const hex=n=>createHash('sha256').update('mg-v116-fixture:'+n).digest('hex');
function request(name,now=Math.floor(Date.now()/1000)){
 return {eventKey:hex(name),consumeUntilSec:now+300,action:'publish',
 organizationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 siteId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',signal:undefined};
}
const deny={committed:false,inserted:false,shared:false,storedUntilSec:0};
async function adminQuery(sql,args=[]){
 const client=new Client(config);
 await client.connect();
 try{return await client.query(sql,args);}finally{await client.end();}
}
async function count(key){
 const r=await adminQuery('SELECT count(*)::int AS total FROM mg_auth_ledger.mfa_redemptions WHERE event_key=$1',[key]);
 return r.rows[0].total;
}
function sandboxPool({onQuery}={}){
 const state={connects:0,releases:[],closed:[]};
 const pool={
  async connect(){
   const raw=new Client(config);
   await raw.connect();
   try{await raw.query('SET ROLE mg_auth_ledger_writer');}
   catch(e){await raw.end();throw e;}
   state.connects++;
   let released=false;
   return {
    query(sql,args){
     if(onQuery)return onQuery({sql,args,raw});
     return raw.query(sql,args);
    },
    release(error){
     if(released)throw Error('double release');
     released=true;
     state.releases.push(Boolean(error));
     state.closed.push(raw.end().catch(()=>{}));
    }
   };
  }
 };
 return {pool,state,async drained(){await Promise.all(state.closed);}};
}
function adapter(sandbox){
 return createInsertOnlyPgAdapterV115({pool:sandbox.pool,nowSec:()=>Math.floor(Date.now()/1000)});
}
test('V116 authenticates against actual PG17 and verified writer identity, never Supabase',async()=>{
 const r=await adminQuery("SELECT current_setting('server_version') AS version, current_database() AS db");
 assert.match(r.rows[0].version,/^17\./);
 assert.equal(r.rows[0].db,'qa_ledger');
 const s=sandboxPool();
 const c=await s.pool.connect();
 const who=await c.query('SELECT current_user AS current_user');
 assert.equal(who.rows[0].current_user,'mg_auth_ledger_writer');
 c.release();await s.drained();
});
test('V115 adapter commits INSERT with independent physical PG connection',async()=>{
 const s=sandboxPool(),a=adapter(s),req=request('single');
 const result=await a.consumeEventAtomically(req);
 assert.deepEqual(result,{committed:true,inserted:true,shared:true,storedUntilSec:req.consumeUntilSec});
 await s.drained();
 assert.deepEqual(s.state.releases,[false]);
 assert.equal(await count(req.eventKey),1);
 assert.equal(a.readiness.productionAuthorized,false);
});
test('duplicate on independent connection is denied by PG17 primary key',async()=>{
 const s=sandboxPool(),a=adapter(s),req=request('duplicate');
 assert.equal((await a.consumeEventAtomically(req)).inserted,true);
 assert.deepEqual(await a.consumeEventAtomically(req),deny);
 await s.drained();
 assert.equal(s.state.connects,2);
 assert.equal(await count(req.eventKey),1);
});
test('two concurrent V115 adapters on independent PG17 sessions yield exactly one committed event',async()=>{
 const s=sandboxPool(),b=sandboxPool(),a1=adapter(s),a2=adapter(b),req=request('concurrent2');
 const results=await Promise.all([a1.consumeEventAtomically(req),a2.consumeEventAtomically(req)]);
 await Promise.all([s.drained(),b.drained()]);
 assert.equal(results.filter(x=>x.committed===true&&x.inserted===true).length,1);
 assert.equal(results.filter(x=>x.committed===false&&x.inserted===false).length,1);
 assert.equal(await count(req.eventKey),1);
});
test('sixteen physically independent PG17 sessions: one successful commit and fifteen denied',async()=>{
 const sandboxes=Array.from({length:16},()=>sandboxPool());
 const req=request('concurrent16');
 const results=await Promise.all(sandboxes.map(s=>adapter(s).consumeEventAtomically(req)));
 await Promise.all(sandboxes.map(s=>s.drained()));
 assert.equal(results.filter(x=>x.committed&&x.inserted).length,1);
 assert.equal(results.filter(x=>!x.committed&&!x.inserted).length,15);
 assert.equal(await count(req.eventKey),1);
});
test('real SQLSTATE 23505 duplicate denial preserves other ledger records',async()=>{
 const s=sandboxPool(),a=adapter(s);
 const initial=request('normal-after-duplicate'),duplicate=request('error-first');
 assert.equal((await a.consumeEventAtomically(duplicate)).committed,true);
 assert.deepEqual(await a.consumeEventAtomically(duplicate),deny);
 assert.equal((await a.consumeEventAtomically(initial)).committed,true);
 await s.drained();
 assert.equal(await count(initial.eventKey),1);
 assert.equal(await count(duplicate.eventKey),1);
});
test('lost COMMIT acknowledgement after real commit fails closed, evicts connection, no retry',async()=>{
 let intercepted=0;
 const s=sandboxPool({onQuery:async({sql,args,raw})=>{
  if(sql==='COMMIT'){
   intercepted++;
   await raw.query(sql,args);
   throw Error('V116 synthesized acknowledgement loss AFTER real PostgreSQL commit');
  }
  return raw.query(sql,args);
 }});
 const req=request('unknown-commit');
 assert.deepEqual(await adapter(s).consumeEventAtomically(req),deny);
 await s.drained();
 assert.equal(intercepted,1);
 assert.deepEqual(s.state.releases,[true]);
 assert.equal(await count(req.eventKey),1);
});
test('connection terminated before COMMIT causes server rollback and denial',async()=>{
 const s=sandboxPool({onQuery:async({sql,args,raw})=>{
  if(sql==='COMMIT'){
   await raw.end();
   throw Error('V116 forced disconnect BEFORE commit');
  }
  return raw.query(sql,args);
 }});
 const req=request('disconnect-before-commit');
 assert.deepEqual(await adapter(s).consumeEventAtomically(req),deny);
 await s.drained();
 assert.deepEqual(s.state.releases,[true]);
 assert.equal(await count(req.eventKey),0);
});
test('aborted request after real INSERT gets real PostgreSQL rollback',async()=>{
 const ctl=new AbortController();
 const s=sandboxPool({onQuery:async({sql,args,raw})=>{
  const result=await raw.query(sql,args);
  if(sql.startsWith('INSERT INTO mg_auth_ledger.'))ctl.abort();
  return result;
 }});
 const req={...request('abort-after-insert'),signal:ctl.signal};
 assert.deepEqual(await adapter(s).consumeEventAtomically(req),deny);
 await s.drained();
 assert.equal(await count(req.eventKey),0);
});
test('restricted writer cannot read/modify ledger or bypass unique constraints',async()=>{
 const s=sandboxPool(),c=await s.pool.connect();
 for(const sql of ['SELECT * FROM mg_auth_ledger.mfa_redemptions',
  'UPDATE mg_auth_ledger.mfa_redemptions SET event_key=event_key',
  'DELETE FROM mg_auth_ledger.mfa_redemptions']){
  await assert.rejects(c.query(sql),e=>e.code==='42501');
 }
 c.release();await s.drained();
});
test('V109 trusted mock admission + REAL PG17 ledger still never approves production',async()=>{
 const now=Math.floor(Date.now()/1000),s=sandboxPool();
 const sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const session='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const gate=createAtomicMfaRedemptionV109({
  readPrimarySession:async()=>({active:true,checkedAtSec:now,expiresAtSec:now+60,
   primaryRead:true,revocationChecked:true,sessionId:session,subject:sub}),
  authorizeResource:async()=>true,
  consumeEventAtomically:adapter(s).consumeEventAtomically,
  ledgerHmacKey:Buffer.alloc(32,16),nowSec:()=>Math.floor(Date.now()/1000)
 });
 const req={proof:{checkedAtSec:now,factorOwnershipVerified:true,method:'totp',
   provenanceReviewed:true,sessionBoundByAuthorizedFlow:true,
   sessionId:session,subject:sub,verified:true,verifiedAtSec:now-10},
  action:'publish',organizationId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  siteId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',signal:undefined};
 const one=await gate.redeem(req);
 const two=await gate.redeem(req);
 await s.drained();
 assert.equal(one.ok,true);
 assert.equal(one.productionAuthorized,false);
 assert.equal(one.formalV67Pass,0);
 assert.equal(two.ok,false);
 assert.equal(gate.readiness.productionAuthorized,false);
});
