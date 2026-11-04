'use strict';
// V119 — CI DISPOSABLE LAB ONLY. NOT a Supabase session-reader or product API.
// Session/permission providers and the proof are synthetic and injected.
// A real revocation race AFTER the final check cannot be guaranteed by this code.
const HASH=/^[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ACTIONS=new Set(['publish','members','billing']);
const EXPECTED_LOGIN='mg_v118_ci_backend';
const WRITER='mg_auth_ledger_writer';
const CHECK_ID='SELECT session_user AS session_user, current_user AS current_user';
const LEDGER='INSERT INTO mg_auth_ledger.mfa_redemptions (event_key,verified_at,retain_until) VALUES ($1,to_timestamp($2),to_timestamp($3))';
const BUSINESS='INSERT INTO mg_v119_fictional.completed_operations (event_key,operation) VALUES ($1,$2)';
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function exact(o,keys){
 return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&
  Object.keys(o).length===keys.length&&keys.every(k=>own(o,k));
}
const nowValid=n=>Number.isSafeInteger(n)&&n>0;
const denied=()=>Object.freeze({ok:false,atomicCommitConfirmed:false,productionAuthorized:false,formalV67Pass:0});
const accepted=()=>Object.freeze({ok:true,atomicCommitConfirmed:true,productionAuthorized:false,formalV67Pass:0});
function createV119AtomicBusinessLab({pool,readPrimarySession,authorizeResource,
 clock=()=>Math.floor(Date.now()/1000),hooks={}}={}){
 if(!pool||typeof pool.connect!=='function'||typeof readPrimarySession!=='function'||
   typeof authorizeResource!=='function'||typeof clock!=='function'||
   !exact(hooks,Object.keys(hooks))||
   Object.keys(hooks).some(k=>!['afterLedger','afterBusiness'].includes(k)||typeof hooks[k]!=='function'))
  throw new TypeError('V119 trusted disposable lab providers required');
 function tick(){try{const v=clock();return nowValid(v)?v:null;}catch{return null;}}
 async function sessionIsCurrent(data){
  let result;
  try{result=await readPrimarySession(Object.freeze({subject:data.subject,sessionId:data.sessionId}));}
  catch{return false;}
  const now=tick();
  return now!==null&&exact(result,['active','checkedAtSec','expiresAtSec','primaryRead','revocationChecked','sessionId','subject'])&&
   result.active===true&&result.primaryRead===true&&result.revocationChecked===true&&
   result.subject===data.subject&&result.sessionId===data.sessionId&&
   nowValid(result.checkedAtSec)&&result.checkedAtSec<=now&&now-result.checkedAtSec<=2&&
   nowValid(result.expiresAtSec)&&result.expiresAtSec>now;
 }
 async function execute(input){
  if(!exact(input,['action','eventKey','organizationId','sessionId','siteId','subject','verifiedAtSec'])||
     !HASH.test(input.eventKey)||!UUID.test(input.subject)||!UUID.test(input.sessionId)||
     !UUID.test(input.organizationId)||!UUID.test(input.siteId)||!ACTIONS.has(input.action)||
     !nowValid(input.verifiedAtSec))return denied();
  const now=tick();
  if(now===null||input.verifiedAtSec>now||now-input.verifiedAtSec>300)return denied();
  // Do not consume anything on a failed or unverifiable primary-session check.
  if(!await sessionIsCurrent(input))return denied();
  let permission;
  try{permission=await authorizeResource(Object.freeze({
    actorId:input.subject,organizationId:input.organizationId,
    siteId:input.siteId,action:input.action
  }));}catch{return denied();}
  if(permission!==true||!await sessionIsCurrent(input))return denied();
  let client,beginAttempted=false,commitSent=false;
  try{
   client=await pool.connect();
   const identity=await client.query(CHECK_ID);
   if(!identity||!Array.isArray(identity.rows)||identity.rows.length!==1||
     !exact(identity.rows[0],['session_user','current_user'])||
     identity.rows[0].session_user!==EXPECTED_LOGIN||identity.rows[0].current_user!==WRITER)
    return denied();
   beginAttempted=true;
   const begin=await client.query('BEGIN');
   if(begin?.command!=='BEGIN')return denied();
   const until=input.verifiedAtSec+310;
   if(tick()===null||until<=tick())return denied();
   const row=await client.query(LEDGER,[input.eventKey,input.verifiedAtSec,until]);
   if(row?.command!=='INSERT'||row.rowCount!==1)return denied();
   if(hooks.afterLedger)await hooks.afterLedger();
   const op=await client.query(BUSINESS,[input.eventKey,input.action]);
   if(op?.command!=='INSERT'||op.rowCount!==1)return denied();
   if(hooks.afterBusiness)await hooks.afterBusiness();
   // Simulated second authoritative check before COMMIT is not a lock on the
   // remote Auth session. A revocation after this check may still race.
   if(!await sessionIsCurrent(input))return denied();
   commitSent=true;
   const committed=await client.query('COMMIT');
   if(committed?.command!=='COMMIT')return denied();
   beginAttempted=false;
   return accepted();
  }catch{return denied();}
  finally{
   if(client){
    if(beginAttempted&&!commitSent){try{await client.query('ROLLBACK');}catch{}}
    // No reused session, including uncertain COMMIT response. The scoped V118
    // pool always evicts its physical PG client.
    try{client.release(true);}catch{}
   }
  }
 }
 return Object.freeze({execute,readiness:Object.freeze({
  labOnly:true,realSupabaseSessionReader:false,revocationLinearizable:false,
  businessSideEffectIsFictional:true,transactionalLedgerAndBusinessInSameDb:true,
  productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 })});
}
module.exports={createV119AtomicBusinessLab,LEDGER,BUSINESS};
