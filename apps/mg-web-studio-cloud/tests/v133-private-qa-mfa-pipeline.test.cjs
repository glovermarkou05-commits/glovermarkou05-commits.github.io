'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createV133PrivateQaMfaPipeline}=
 require('../server/v133-private-qa-mfa-pipeline.cjs');
const {QA_ISSUER}=require('../server/v132-auth-server-session-gate.cjs');
const NOW=2000000000;
const SUBJECT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FACTOR='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CHALLENGE='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REFERENCE='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const EVENT='ffffffff-ffff-4fff-8fff-ffffffffffff';
const RECEIPT_KEY=Buffer.alloc(32,132);
const getClaims=token=>({
 iss:QA_ISSUER,aud:'authenticated',sub:SUBJECT,session_id:SESSION,
 aal:token==='AAL2-SIGNED-FIXTURE'?'aal2':'aal1',exp:NOW+360,iat:NOW-30
});
function makeAuth(){
 const state={revoked:false,userCalls:0,claimsCalls:0,listCalls:0,verifyCalls:0};
 const auth={
  getClaims:async token=>{state.claimsCalls++;return {data:{claims:getClaims(token)},error:null};},
  getUser:async token=>{
   state.userCalls++;
   if(state.revoked)return {data:{user:null},error:{message:'Revoked'}};
   return {data:{user:{id:SUBJECT}},error:null};
  },
  mfa:{
   listFactors:async()=>{state.listCalls++;return {data:{totp:[{id:FACTOR,status:'verified'}],phone:[]},error:null};},
   challenge:async()=>({data:{id:CHALLENGE},error:null}),
   verify:async()=>{state.verifyCalls++;return {data:{access_token:'AAL2-SIGNED-FIXTURE'},error:null};}
  }
 };
 return {auth,state};
}
function pool(role,run){
 const state={queries:0,evictions:0};
 const obj={
  connect:async()=>({
   query:async(sql,args)=>{
    state.queries++;
    if(sql.includes('session_user AS session_user')){
     return {rowCount:1,rows:[{session_user:role,current_user:role,is_replica:false}]};
    }
    return run(sql,args);
   },
   release:forced=>{if(forced===true)state.evictions++;}
  })
 };
 return {pool:obj,state};
}
function services(){
 let pending,claimed=false,persisted=null;
 const journal=pool('mg_qa_mfa_challenge_journal',(sql,args)=>{
  if(sql.startsWith('INSERT INTO mg_qa_mfa_challenges.')){
   pending={proof_reference:args[0],challenge_id:args[1],factor_id:args[2],
    subject:args[3],session_id:args[4],method:args[5],created_at_sec:args[6]};
   return {command:'INSERT',rowCount:1,rows:[{proof_reference:args[0]}]};
  }
  if(sql.startsWith('UPDATE mg_qa_mfa_challenges.')){
   if(claimed||!pending)return {command:'UPDATE',rowCount:0,rows:[]};
   claimed=true;
   return {command:'UPDATE',rowCount:1,rows:[pending]};
  }
  throw Error('Unexpected journal SQL');
 });
 const issuer=pool('mg_qa_mfa_receipt_issuer',(sql,args)=>{
  if(sql.startsWith('INSERT INTO mg_qa_mfa_receipts.')){
   if(!persisted)persisted={
    receipt_id:args[0],event_id:EVENT,proof_reference:args[1],
    subject:args[2],session_id:args[3],method:args[4],
    verified_at_sec:args[5]
   };
   return {command:'INSERT',rowCount:1,rows:[]};
  }
  if(sql.startsWith('SELECT')&&sql.includes('mg_qa_mfa_receipts.'))
   return {command:'SELECT',rowCount:persisted?1:0,rows:persisted?[persisted]:[]};
  throw Error('Unexpected issuer SQL');
 });
 const reader=pool('mg_qa_mfa_receipt_reader',(sql,args)=>{
  if(sql.startsWith('SELECT')&&sql.includes('mg_qa_mfa_receipts.'))
   return {command:'SELECT',rowCount:persisted?1:0,rows:persisted?[persisted]:[]};
  throw Error('Unexpected reader SQL');
 });
 return {journal,issuer,reader};
}
function config(a,s){
 return {
  auth:a.auth,accessToken:'AAL1-SIGNED-FIXTURE',
  journalPool:s.journal.pool,receiptIssuerPool:s.issuer.pool,
  receiptReaderPool:s.reader.pool,receiptKey:RECEIPT_KEY,
  nowSec:()=>NOW,newReference:()=>REFERENCE
 };
}
test('V133 refuses missing or shared PG pools, missing Auth, weak keys',async()=>{
 const a=makeAuth(),s=services(),c=config(a,s);
 await assert.rejects(createV133PrivateQaMfaPipeline({}),TypeError);
 await assert.rejects(createV133PrivateQaMfaPipeline({...c,receiptIssuerPool:c.journalPool}),TypeError);
 await assert.rejects(createV133PrivateQaMfaPipeline({...c,receiptKey:Buffer.alloc(4)}),TypeError);
 await assert.rejects(createV133PrivateQaMfaPipeline({...c,auth:{getUser:async()=>({})}}),TypeError);
});
test('V133 invalid signed session stops before any MFA or database call',async()=>{
 const a=makeAuth(),s=services();a.state.revoked=true;
 const flow=await createV133PrivateQaMfaPipeline(config(a,s));
 assert.equal(flow,null);
 assert.equal(a.state.listCalls,0);
 assert.equal(s.journal.state.queries+s.issuer.state.queries+s.reader.state.queries,0);
});
test('V133 official Auth→journal→MFA verify aal2→durable receipt→private reader is joined',async()=>{
 const a=makeAuth(),s=services();
 const flow=await createV133PrivateQaMfaPipeline(config(a,s));
 assert.ok(flow);
 assert.equal((await flow.begin({factorId:FACTOR})).ok,true);
 assert.equal((await flow.confirm({proofReference:REFERENCE,code:'123456'})).ok,true);
 assert.equal(a.state.verifyCalls,1);
 const record=await flow.readTrustedVerifiedEvent({
  proofReference:REFERENCE,subject:SUBJECT,sessionId:SESSION
 });
 assert.equal(record.eventId,EVENT);
 assert.equal(record.verified,true);
 assert.equal(record.method,'totp');
 assert.equal(flow.readiness.publicRouteWired,false);
 assert.equal(flow.readiness.productionAuthorized,false);
 assert.equal(flow.readiness.sqlQaInstalled,false);
 assert.equal(flow.readiness.fixedJournalRole,'mg_qa_mfa_challenge_journal');
 assert.equal(flow.readiness.fixedReceiptIssuerRole,'mg_qa_mfa_receipt_issuer');
 assert.equal(flow.readiness.fixedReceiptReaderRole,'mg_qa_mfa_receipt_reader');
 assert.ok(a.state.userCalls>=5);
 assert.ok(s.journal.state.evictions>=2);
 assert.ok(s.issuer.state.evictions>=1);
 assert.ok(s.reader.state.evictions>=1);
});
test('V133 fails closed if Auth session revoked after challenge, without inserting receipt',async()=>{
 const a=makeAuth(),s=services();
 const flow=await createV133PrivateQaMfaPipeline(config(a,s));
 assert.equal((await flow.begin({factorId:FACTOR})).ok,true);
 a.state.revoked=true;
 assert.equal((await flow.confirm({proofReference:REFERENCE,code:'123456'})).ok,false);
 assert.equal(a.state.verifyCalls,0);
 assert.equal(s.issuer.state.queries,0);
});
test('V133 does not accept replayed MFA receipt without a new Auth verification',async()=>{
 const a=makeAuth(),s=services();
 const flow=await createV133PrivateQaMfaPipeline(config(a,s));
 assert.equal((await flow.begin({factorId:FACTOR})).ok,true);
 assert.equal((await flow.confirm({proofReference:REFERENCE,code:'123456'})).ok,true);
 assert.equal((await flow.confirm({proofReference:REFERENCE,code:'123456'})).ok,false);
 assert.equal(a.state.verifyCalls,1);
});
