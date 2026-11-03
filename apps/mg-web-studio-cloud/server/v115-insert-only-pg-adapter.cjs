'use strict';

// V115 — BACKEND-ONLY INJECTED SQL ADAPTER. NOT CONNECTED / NOT DEPLOYABLE.
// Must be called only by trusted V109 verifier with maxFactorAgeSec=300.
// Direct PG connection must already operate as reviewed limited writer role;
// this module NEVER runs SET ROLE, CREATE ROLE, reads secrets or opens network.
const HASH=/^[a-f0-9]{64}$/;
const WRITER='mg_auth_ledger_writer';
const MAX_FACTOR_AGE_SEC=300;
const TOMBSTONE_GRACE_SEC=10;
const ROLE_QUERY='SELECT current_user AS current_user';
const BEGIN='BEGIN';
const COMMIT='COMMIT';
const ROLLBACK='ROLLBACK';
const INSERT=`INSERT INTO mg_auth_ledger.mfa_redemptions
 (event_key,verified_at,retain_until)
 VALUES ($1,to_timestamp($2),to_timestamp($3))`;
function fail(){return Object.freeze({
 committed:false,inserted:false,shared:false,storedUntilSec:0
});}
function success(until){return Object.freeze({
 committed:true,inserted:true,shared:true,storedUntilSec:until
});}
function validSignal(signal){
 return signal===undefined||(typeof AbortSignal!=='undefined'&&
   signal instanceof AbortSignal&&!signal.aborted);
}
function exact(o,keys){
 return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null)&&
  Object.keys(o).length===keys.length&&
  keys.every(k=>Object.prototype.hasOwnProperty.call(o,k));
}
function integer(x){return Number.isSafeInteger(x)&&x>0;}
// Pool contract: connect() -> client; client.query(sql,params?) returns
// pg-style Result; client.release() returns connection. No ambient fallback.
function createInsertOnlyPgAdapterV115({
 pool,nowSec=()=>Math.floor(Date.now()/1000)
}={}){
 if(!pool||typeof pool.connect!=='function'||typeof nowSec!=='function')
  throw new TypeError('Trusted PostgreSQL pool and bounded clock required');
 async function consumeEventAtomically(input){
  if(!exact(input,['action','consumeUntilSec','eventKey','organizationId','signal','siteId'])||
     !HASH.test(input.eventKey)||!integer(input.consumeUntilSec)||
     !validSignal(input.signal))return fail();
  // V109 default contract is fixed to 300s. No action or organization goes
  // into SQL; consume key was derived by V109 from trusted MFA proof.
  const verifiedAtSec=input.consumeUntilSec-MAX_FACTOR_AGE_SEC-TOMBSTONE_GRACE_SEC;
  let now;
  try{now=nowSec();}catch{return fail();}
  if(!integer(now)||!integer(verifiedAtSec)||verifiedAtSec>now+3||
    now-verifiedAtSec>MAX_FACTOR_AGE_SEC||
    input.consumeUntilSec<=now)return fail();

  let client,transactionStarted=false,commitAttempted=false;
  try{
   client=await pool.connect();
   if(!client||typeof client.query!=='function'||typeof client.release!=='function')
     return fail();
   if(!validSignal(input.signal))return fail();
   // Read current_user from PG rather than trusting a caller-supplied label;
   // still requires an audited real role and a non-impersonated connection.
   const role=await client.query(ROLE_QUERY);
   if(!role||!Array.isArray(role.rows)||role.rows.length!==1||
      !exact(role.rows[0],['current_user'])||
      role.rows[0].current_user!==WRITER)return fail();
   if(!validSignal(input.signal))return fail();
   const begin=await client.query(BEGIN);
   if(!begin||begin.command!=='BEGIN')return fail();
   transactionStarted=true;

   const attempted=await client.query(INSERT,[
      input.eventKey,verifiedAtSec,input.consumeUntilSec
   ]);
   if(!attempted||attempted.command!=='INSERT'||attempted.rowCount!==1)
    return fail();
   if(!validSignal(input.signal))return fail();
   // Once COMMIT is sent, disconnect / timeout outcome may be unknown;
   // never automatically retry or claim the redemption did not occur.
   commitAttempted=true;
   const committed=await client.query(COMMIT);
   if(!committed||committed.command!=='COMMIT')return fail();
   transactionStarted=false;
   return success(input.consumeUntilSec);
  }catch{
   return fail(); // Includes SQLSTATE 23505 and unknown commit outcomes.
  }finally{
   if(client){
    if(transactionStarted&&!commitAttempted){
     try{await client.query(ROLLBACK);}catch{}
    }
    try{client.release();}catch{}
   }
  }
 }
 const readiness=Object.freeze({
  backendConnected:false,
  primarySessionConnected:false,
  businessOperationIntegrated:false,
  livePrivilegedRoleReviewed:false,
  productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
 });
 return Object.freeze({consumeEventAtomically,readiness});
}
module.exports={createInsertOnlyPgAdapterV115,INSERT,ROLE_QUERY};
