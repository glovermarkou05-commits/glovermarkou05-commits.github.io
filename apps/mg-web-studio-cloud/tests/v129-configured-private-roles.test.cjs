'use strict';
// No network or database. Exercises only the trusted private-role configuration
// contract; real QA role creation still requires DBA review and owner approval.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createV122PrivateAuthSessionRowReader,REVIEWED_QA_READER:SESSION_QA,VERIFY,QUERY}=require('../server/v122-private-auth-session-row-reader.cjs');
const {createV126DurableMfaEventStore,REVIEWED_QA_ISSUER:RECEIPT_ISSUER,REVIEWED_QA_READER:RECEIPT_READER,IDENTITY,SELECT_BY_PROOF,QA_SELECT_BY_PROOF}=require('../server/v126-durable-mfa-event-store.cjs');
const {createV128PrivateChallengeJournal,REVIEWED_QA_ROLE:JOURNAL_QA,IDENT,INSERT,RESERVE,QA_INSERT,QA_RESERVE}=require('../server/v128-private-challenge-journal.cjs');
const NOW=2000000000;
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REF='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EVENT='11111111-1111-4111-8111-111111111111';
const CH='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FACTOR='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const RECEIPT='22222222-2222-4222-8222-222222222222';
function mockPool(name,answers){
 const trace={queries:[],releases:[]};
 const client={
  async query(sql,args){trace.queries.push({sql,args});if(answers[sql])return answers[sql];throw Error('unexpected SQL');},
  release(e){trace.releases.push(e);}
 };
 return {pool:{async connect(){return client;}},trace};
}
test('QA reader names are explicitly pinned, not arbitrary environment-derived roles',()=>{
 assert.equal(SESSION_QA,'mg_qa_auth_session_reader');
 assert.equal(RECEIPT_ISSUER,'mg_qa_mfa_receipt_issuer');
 assert.equal(RECEIPT_READER,'mg_qa_mfa_receipt_reader');
 assert.equal(JOURNAL_QA,'mg_qa_mfa_challenge_journal');
});
test('V122 accepts only a reviewed QA session reader and confirms its physical role',async()=>{
 const q=mockPool(SESSION_QA,{
  [VERIFY]:{rows:[{current_user:SESSION_QA,is_replica:false}],rowCount:1},
  [QUERY]:{rows:[{id:SESSION,user_id:USER,not_after:null}],rowCount:1}
 });
 const reader=createV122PrivateAuthSessionRowReader({
  pool:q.pool,expectedReaderRole:SESSION_QA,
  nowSec:()=>NOW,trustedTokenExpiresAtSec:NOW+90
 });
 const answer=await reader.readPrimarySession({subject:USER,sessionId:SESSION});
 assert.equal(answer?.active,true);
 assert.equal(answer?.expiresAtSec,NOW+90);
 assert.deepEqual(q.trace.queries.map(x=>x.sql),[VERIFY,QUERY]);
 assert.deepEqual(q.trace.releases,[true]);
});
test('V122 refuses impostor principal instead of attempting session SELECT',async()=>{
 const q=mockPool('wrong',{
  [VERIFY]:{rows:[{current_user:'postgres',is_replica:false}],rowCount:1}
 });
 const reader=createV122PrivateAuthSessionRowReader({
  pool:q.pool,expectedReaderRole:SESSION_QA,
  nowSec:()=>NOW,trustedTokenExpiresAtSec:NOW+90
 });
 assert.equal(await reader.readPrimarySession({subject:USER,sessionId:SESSION}),null);
 assert.deepEqual(q.trace.queries.map(x=>x.sql),[VERIFY]);
});
test('V126 supports separately approved QA issuer/reader mapping, no role promotion',async()=>{
 const q=mockPool(RECEIPT_READER,{
  [IDENTITY]:{rows:[{session_user:RECEIPT_READER,current_user:RECEIPT_READER,is_replica:false}],rowCount:1},
  [QA_SELECT_BY_PROOF]:{rows:[{
   receipt_id:RECEIPT,event_id:EVENT,proof_reference:REF,
   subject:USER,session_id:SESSION,method:'totp',verified_at_sec:NOW-10
  }],rowCount:1}
 });
 const store=createV126DurableMfaEventStore({
  issuerPool:{connect:async()=>{throw Error('issuer must not be used');}},
  readerPool:q.pool,confirmAuthenticMfaReceipt:async()=>null,
  nowSec:()=>NOW,expectedIssuerRole:RECEIPT_ISSUER,
  expectedReaderRole:RECEIPT_READER
 });
 const actual=await store.readTrustedVerifiedEvent({
  proofReference:REF,sessionId:SESSION,subject:USER
 });
 assert.equal(actual?.eventId,EVENT);
 assert.equal(actual?.eventIdBoundToVerification,true);
 assert.deepEqual(q.trace.queries.map(x=>x.sql),[IDENTITY,QA_SELECT_BY_PROOF]);
 assert.deepEqual(q.trace.releases,[true]);
});
test('V126 denies even correctly formatted rows returned by wrong physical role',async()=>{
 const q=mockPool('impostor',{
  [IDENTITY]:{rows:[{session_user:'postgres',current_user:'postgres',is_replica:false}],rowCount:1}
 });
 const store=createV126DurableMfaEventStore({
  issuerPool:q.pool,readerPool:q.pool,confirmAuthenticMfaReceipt:async()=>null,
  nowSec:()=>NOW,expectedIssuerRole:RECEIPT_ISSUER,
  expectedReaderRole:RECEIPT_READER
 });
 assert.equal(await store.readTrustedVerifiedEvent({
  proofReference:REF,sessionId:SESSION,subject:USER
 }),null);
 assert.deepEqual(q.trace.queries.map(x=>x.sql),[IDENTITY]);
});
test('V128 accepts only reviewed QA journal principal with exact physical identity',async()=>{
 const q=mockPool(JOURNAL_QA,{
  [IDENT]:{rows:[{session_user:JOURNAL_QA,current_user:JOURNAL_QA,is_replica:false}],rowCount:1},
  [QA_INSERT]:{rows:[{proof_reference:REF}],rowCount:1,command:'INSERT'}
 });
 const journal=createV128PrivateChallengeJournal({
  pool:q.pool,expectedJournalRole:JOURNAL_QA,nowSec:()=>NOW
 });
 assert.deepEqual(await journal.createPending({
  proofReference:REF,challengeId:CH,factorId:FACTOR,
  subject:USER,sessionId:SESSION,method:'totp',createdAtSec:NOW
 }),{recorded:true});
 assert.deepEqual(q.trace.queries.map(x=>x.sql),[IDENT,QA_INSERT]);
 assert.deepEqual(q.trace.releases,[true]);
});
test('V128 rejects a mismatched role before any INSERT or UPDATE',async()=>{
 const q=mockPool('not journal',{
  [IDENT]:{rows:[{session_user:'postgres',current_user:'postgres',is_replica:false}],rowCount:1}
 });
 const journal=createV128PrivateChallengeJournal({
  pool:q.pool,expectedJournalRole:JOURNAL_QA,nowSec:()=>NOW
 });
 assert.deepEqual(await journal.createPending({
  proofReference:REF,challengeId:CH,factorId:FACTOR,
  subject:USER,sessionId:SESSION,method:'totp',createdAtSec:NOW
 }),{recorded:false});
 assert.deepEqual(q.trace.queries.map(x=>x.sql),[IDENT]);
});
test('deny role injection, privileged roles, role swaps and unapproved aliases',()=>{
 const fake={connect:async()=>({})};
 const invalid=['postgres','anon','authenticated','service_role','mg_v128_ci_journal;DROP TABLE auth.sessions','mg_unreviewed_journal','',null];
 for(const role of invalid){
  assert.throws(()=>createV128PrivateChallengeJournal({pool:fake,expectedJournalRole:role}),TypeError);
  assert.throws(()=>createV122PrivateAuthSessionRowReader({
   pool:fake,expectedReaderRole:role,trustedTokenExpiresAtSec:NOW+30
  }),TypeError);
  assert.throws(()=>createV126DurableMfaEventStore({
   issuerPool:fake,readerPool:fake,confirmAuthenticMfaReceipt:async()=>null,
   expectedIssuerRole:role,expectedReaderRole:RECEIPT_READER
  }),TypeError);
 }
 assert.throws(()=>createV126DurableMfaEventStore({
  issuerPool:fake,readerPool:fake,confirmAuthenticMfaReceipt:async()=>null,
  expectedIssuerRole:RECEIPT_READER,expectedReaderRole:RECEIPT_ISSUER
 }),TypeError);
});
test('none of the configured QA roles mean authorization to deploy',()=>{
 const fake={connect:async()=>({})};
 const a=createV122PrivateAuthSessionRowReader({pool:fake,expectedReaderRole:SESSION_QA,
  trustedTokenExpiresAtSec:NOW+30});
 const b=createV126DurableMfaEventStore({issuerPool:fake,readerPool:fake,
  confirmAuthenticMfaReceipt:async()=>null,expectedIssuerRole:RECEIPT_ISSUER,
  expectedReaderRole:RECEIPT_READER});
 const c=createV128PrivateChallengeJournal({pool:fake,expectedJournalRole:JOURNAL_QA});
 assert.equal(a.readiness.productionAuthorized,false);
 assert.equal(b.readiness.productionAuthorized,false);
 assert.equal(c.readiness.productionAuthorized,false);
 assert.equal(a.readiness.formalV67Pass,0);
 assert.equal(b.readiness.formalV67Pass,0);
 assert.equal(c.readiness.formalV67Pass,0);
});

test('V131 schema targets are fixed, unexposed and cannot be mixed across lab and QA',()=>{
 assert.ok(SELECT_BY_PROOF.includes('mg_v126_fictional.verified_mfa_events'));
 assert.ok(QA_SELECT_BY_PROOF.includes('mg_qa_mfa_receipts.verified_mfa_events'));
 assert.ok(INSERT.includes('mg_v128_fictional.challenge_journal'));
 assert.ok(QA_INSERT.includes('mg_qa_mfa_challenges.challenge_journal'));
 assert.ok(QA_RESERVE.includes('mg_qa_mfa_challenges.challenge_journal'));
 for(const sql of [QA_SELECT_BY_PROOF,QA_INSERT,QA_RESERVE]){
  assert.equal(sql.includes('public.'),false);
  assert.equal(sql.includes('auth.sessions'),false);
  assert.equal(sql.includes('mg_v128_fictional.'),false);
  assert.equal(sql.includes('mg_v126_fictional.'),false);
 }
 const fake={connect:async()=>({})};
 for(const [issuer,reader] of [
  [RECEIPT_ISSUER,'mg_v126_ci_reader'],
  ['mg_v126_ci_issuer',RECEIPT_READER]
 ]){
  assert.throws(()=>createV126DurableMfaEventStore({
   issuerPool:fake,readerPool:fake,confirmAuthenticMfaReceipt:async()=>null,
   expectedIssuerRole:issuer,expectedReaderRole:reader
  }),TypeError);
 }
});
