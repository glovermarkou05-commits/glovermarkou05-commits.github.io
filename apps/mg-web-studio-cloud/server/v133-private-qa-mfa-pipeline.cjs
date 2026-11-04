'use strict';
// V133 — private QA-only wiring of V132+V128+V130. NOT a public handler.
// The caller MUST supply an isolated, request-scoped official Supabase Auth
// client (no global session, no service_role key) and separate least-privilege
// QA PostgreSQL pools. No real QA database objects are installed here.
const {createV132AuthServerSessionGate,QA_ISSUER}=
 require('./v132-auth-server-session-gate.cjs');
const {createV128SupabaseClaimsVerifier}=
 require('./v128-supabase-claims-verifier.cjs');
const {createV128PrivateChallengeJournal,REVIEWED_QA_ROLE}=
 require('./v128-private-challenge-journal.cjs');
const {createV130PrivateVerifiedMfaComposition}=
 require('./v130-private-verified-mfa-composition.cjs');
const {REVIEWED_QA_ISSUER,REVIEWED_QA_READER}=
 require('./v126-durable-mfa-event-store.cjs');

function poolValid(pool) {
 return pool!==null&&typeof pool==='object'&&typeof pool.connect==='function';
}
const DENIED=Object.freeze({ok:false,productionAuthorized:false,formalV67Pass:0});
async function createV133PrivateQaMfaPipeline({
 auth,accessToken,journalPool,receiptIssuerPool,receiptReaderPool,receiptKey,
 nowSec=()=>Math.floor(Date.now()/1000),newReference
}={}){
 if(!auth||typeof auth.getClaims!=='function'||
  typeof auth.getUser!=='function'||!auth.mfa||
  ['listFactors','challenge','verify'].some(k=>typeof auth.mfa[k]!=='function')||
  !poolValid(journalPool)||!poolValid(receiptIssuerPool)||
  !poolValid(receiptReaderPool)||
  journalPool===receiptIssuerPool||journalPool===receiptReaderPool||
  receiptIssuerPool===receiptReaderPool||
  !Buffer.isBuffer(receiptKey)||receiptKey.length<32||
  typeof nowSec!=='function'||(newReference!==undefined&&typeof newReference!=='function'))
  throw new TypeError('V133: request-scoped Auth and three distinct private QA pools required');
 // Authentication MUST happen before issuing any MFA challenge or DB writes.
 const sessionGate=createV132AuthServerSessionGate({
  auth,accessToken,expectedIssuer:QA_ISSUER,nowSec
 });
 const trusted=await sessionGate.authenticate();
 if(!trusted)return null;
 // Fixed server-side identities, no roles, schemas, user IDs or issuer
 // accepted from a request. V128/V126 assert both PG session_user/current_user.
 const journal=createV128PrivateChallengeJournal({
  pool:journalPool,nowSec,expectedJournalRole:REVIEWED_QA_ROLE
 });
 const verifier=createV128SupabaseClaimsVerifier({
  auth,expectedIssuer:QA_ISSUER,nowSec
 });
 const opts={
  auth,actor:trusted.actor,readActiveSession:trusted.readActiveSession,
  journal,verifySignedJwt:verifier.verifySignedJwt,
  receiptKey:Buffer.from(receiptKey),
  issuerPool:receiptIssuerPool,readerPool:receiptReaderPool,nowSec,
  expectedIssuerRole:REVIEWED_QA_ISSUER,
  expectedReaderRole:REVIEWED_QA_READER
 };
 if(newReference!==undefined)opts.newReference=newReference;
 const pipeline=createV130PrivateVerifiedMfaComposition(opts);
 return Object.freeze({
  begin:input=>pipeline.begin(input),
  confirm:input=>pipeline.confirm(input),
  // Only for injection into existing private V125/V126 gateway. Do not mount
  // on an HTTP route or return the record to the browser.
  readTrustedVerifiedEvent:input=>pipeline.readTrustedVerifiedEvent(input),
  readiness:Object.freeze({
   qaOnly:true,labOnly:true,liveSupabaseClientConnected:false,
   fixedIssuer:QA_ISSUER,
   fixedJournalRole:REVIEWED_QA_ROLE,
   fixedReceiptIssuerRole:REVIEWED_QA_ISSUER,
   fixedReceiptReaderRole:REVIEWED_QA_READER,
   officialGetClaimsAndGetUser:true,officialMfaBridge:true,
   privateJournalAndReceiptStoreWired:true,
   sqlQaInstalled:false,publicRouteWired:false,
   authToPostgresAtomic:false,revocationLinearizable:false,
   productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
  })
 });
}
module.exports={createV133PrivateQaMfaPipeline,DENIED};
