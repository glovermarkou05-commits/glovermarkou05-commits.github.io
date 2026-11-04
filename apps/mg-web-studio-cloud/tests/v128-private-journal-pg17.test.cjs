'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
if(process.env.CI!=='true'||process.env.V128_DISPOSABLE_ONLY!=='1'||
 process.env.V128_HOST!=='127.0.0.1'||process.env.V128_DB!=='qa_ledger'||
 !/^\d{2,5}$/.test(process.env.V128_PORT||'')||
 process.env.V128_ADMIN_PASS!=='v128-disposable-admin'||
 process.env.V128_READER_PASS!=='v128-disposable-journal')
 throw Error('V128 requires disposable PostgreSQL 17 GitHub CI only');
for(const envName of ['DATABASE_URL','SUPABASE_URL','SUPABASE_DB_URL',
 'SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN','MG_AUTH_QA_URL'])
 if(process.env[envName])throw Error('Live Supabase environment not permitted');
const {Pool,Client}=require('pg');
const {createV128PrivateChallengeJournal,ROLE}=require('../server/v128-private-challenge-journal.cjs');
const {createV128SupabaseClaimsVerifier}=require('../server/v128-supabase-claims-verifier.cjs');
const {createV127NativeMfaBridge}=require('../server/v127-supabase-native-mfa-bridge.cjs');
const cfg={host:'127.0.0.1',port:Number(process.env.V128_PORT),database:'qa_ledger',
 connectionTimeoutMillis:8000,query_timeout:9000,application_name:'v128_ci_disposable_only'};
const NOW=2000000000,ISSUER='https://tbfhiqkivsoeuudlpkgi.supabase.co/auth/v1';
const USER='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SID='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FACTOR='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CH='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CH2='ffffffff-ffff-4fff-8fff-ffffffffffff';
const REF='11111111-1111-4111-8111-111111111111';
const REF2='22222222-2222-4222-8222-222222222222';
const NO={ok:false,productionAuthorized:false,formalV67Pass:0};
const PASS={ok:true,proofReference:REF,productionAuthorized:false,formalV67Pass:0};
const client=()=>new Client({...cfg,user:'postgres',password:process.env.V128_ADMIN_PASS});
async function adminSql(sql,args=[]){const c=client();await c.connect();try{return await c.query(sql,args);}finally{await c.end()}}
const claims=(x={})=>({iss:ISSUER,aud:'authenticated',aal:'aal2',
 sub:USER,session_id:SID,exp:NOW+70,iat:NOW-40,...x});
const pending=(x={})=>({proofReference:REF,challengeId:CH,factorId:FACTOR,
 subject:USER,sessionId:SID,method:'totp',createdAtSec:NOW,...x});
const request=()=>({proofReference:REF,subject:USER,sessionId:SID});
const authSession=()=>({active:true,primaryRead:true,revocationChecked:true,
 subject:USER,sessionId:SID,checkedAtSec:NOW,expiresAtSec:NOW+80});
function createJournal({time=()=>NOW,poolUser=ROLE}={}){
 const pool=new Pool({...cfg,user:poolUser,password:poolUser===ROLE?
  process.env.V128_READER_PASS:process.env.V128_ADMIN_PASS,max:20});
 const journal=createV128PrivateChallengeJournal({pool,nowSec:time});
 return {journal,pool,close:()=>pool.end()};
}
function getVerifier({response=claims(),time=()=>NOW,error=null}={}){
 const state={calls:[]};
 const auth={async getClaims(token){state.calls.push(token);
  return error?{error,data:null}:{data:{claims:response},error:null};}};
 const verifier=createV128SupabaseClaimsVerifier({auth,expectedIssuer:ISSUER,nowSec:time});
 return {verifier,state};
}
async function count(){
 const r=await adminSql('SELECT count(*)::int AS n FROM mg_v128_fictional.challenge_journal');
 return r.rows[0].n;
}
test.beforeEach(async()=>adminSql('TRUNCATE TABLE mg_v128_fictional.challenge_journal'));
test('V128 runs in ephemeral PG17 with nonadmin journal and private schema',async()=>{
 const r=await adminSql("SELECT current_database() AS db,current_setting('server_version') AS version");
 assert.equal(r.rows[0].db,'qa_ledger');assert.match(r.rows[0].version,/^17\./);
 const roles=await adminSql("SELECT rolname,rolsuper,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=$1",[ROLE]);
 assert.deepEqual(roles.rows,[{rolname:ROLE,rolsuper:false,rolbypassrls:false,rolinherit:false}]);
 for(const role of ['anon','authenticated','service_role']){
  const q=await adminSql("SELECT has_schema_privilege($1,'mg_v128_fictional','USAGE') AS allowed",[role]);
  assert.equal(q.rows[0].allowed,false);
 }
});
test('createPending persists only challenge IDs, not OTP codes, JWTs or tokens',async()=>{
 const f=createJournal();try{
  assert.deepEqual(await f.journal.createPending(pending()),{recorded:true});
  const r=await adminSql('SELECT * FROM mg_v128_fictional.challenge_journal');
  assert.equal(r.rows.length,1);assert.equal(r.rows[0].state,'PENDING');
  assert.equal(r.rows[0].challenge_id,CH);
  assert.equal('otp_code' in r.rows[0],false);
  assert.equal('access_token' in r.rows[0],false);
  assert.equal('jwt' in r.rows[0],false);
 }finally{await f.close();}
});
test('duplicate pending proof and reused challenge ID cannot create second journal row',async()=>{
 const f=createJournal();try{
  assert.deepEqual(await f.journal.createPending(pending()),{recorded:true});
  assert.deepEqual(await f.journal.createPending(pending()),{recorded:false});
  assert.deepEqual(await f.journal.createPending(pending({proofReference:REF2})),{recorded:false});
  assert.equal(await count(),1);
 }finally{await f.close();}
});
test('claimPending performs one atomic pending-to-claimed transition',async()=>{
 const f=createJournal();try{
  await f.journal.createPending(pending());
  assert.deepEqual(await f.journal.claimPending(request()),{
   claimed:true,proofReference:REF,subject:USER,sessionId:SID,
   factorId:FACTOR,challengeId:CH,method:'totp',createdAtSec:NOW
  });
  assert.equal(await f.journal.claimPending(request()),null);
  const r=await adminSql('SELECT state,claimed_at_sec FROM mg_v128_fictional.challenge_journal');
  assert.equal(r.rows[0].state,'CLAIMED');assert.equal(Number(r.rows[0].claimed_at_sec),NOW);
 }finally{await f.close();}
});
test('16 simultaneous claim calls across pooled clients produce one winner',async()=>{
 const f=createJournal();try{
  await f.journal.createPending(pending());
  const results=await Promise.all(Array.from({length:16},()=>f.journal.claimPending(request())));
  assert.equal(results.filter(x=>x?.claimed).length,1);
  assert.equal(results.filter(x=>x===null).length,15);
  assert.equal(await count(),1);
 }finally{await f.close();}
});
test('wrong user/session cannot claim a valid challenge, rightful owner can',async()=>{
 const f=createJournal();try{
  await f.journal.createPending(pending());
  assert.equal(await f.journal.claimPending({...request(),subject:OTHER}),null);
  assert.equal(await f.journal.claimPending({...request(),sessionId:OTHER}),null);
  assert.equal((await f.journal.claimPending(request())).claimed,true);
 }finally{await f.close();}
});
test('challenge over 300 seconds old is not claimable',async()=>{
 let time=NOW;const f=createJournal({time:()=>time});try{
  assert.deepEqual(await f.journal.createPending(pending()),{recorded:true});
  time=NOW+301;
  assert.equal(await f.journal.claimPending(request()),null);
 }finally{await f.close();}
});
test('claimed proof stays unusable after recreating the journal object and pool',async()=>{
 const a=createJournal();try{
  await a.journal.createPending(pending());
  assert.equal((await a.journal.claimPending(request())).claimed,true);
 }finally{await a.close();}
 const b=createJournal();try{assert.equal(await b.journal.claimPending(request()),null);}
 finally{await b.close();}
});
test('clients cannot supply role, eventKey, JWT, OTP or SQL to the journal API',async()=>{
 const f=createJournal();try{
  for(const x of [{eventKey:'f'.repeat(64)},{jwt:'fake'},
   {code:'123456'},{role:'postgres'},{sql:'DELETE FROM auth.sessions'}]){
   assert.deepEqual(await f.journal.createPending(pending(x)),{recorded:false});
   assert.equal(await f.journal.claimPending({...request(),...x}),null);
  }
  assert.equal(await count(),0);
 }finally{await f.close();}
});
test('journal principal cannot read Auth, alter/delete journal or set postgres role',async()=>{
 const f=createJournal();try{
  const c=await f.pool.connect();
  try{
   for(const q of ['SELECT id FROM auth.sessions','DELETE FROM mg_v128_fictional.challenge_journal',
    "UPDATE mg_v128_fictional.challenge_journal SET subject='cccccccc-cccc-4ccc-8ccc-cccccccccccc'",
    'SET ROLE postgres'])
    await assert.rejects(c.query(q),e=>e.code==='42501');
  }finally{c.release(true);}
 }finally{await f.close();}
});
test('principal identity mismatch fails closed before any journal write',async()=>{
 const x=createJournal({poolUser:'postgres'});
 try{assert.deepEqual(await x.journal.createPending(pending()),{recorded:false});}
 finally{await x.close();}
 assert.equal(await count(),0);
});
test('JWT adapter calls official getClaims and returns only signed AAL2 identity fields',async()=>{
 const f=getVerifier();
 assert.deepEqual(await f.verifier.verifySignedJwt('signed-token'),{
  aal:'aal2',exp:NOW+70,session_id:SID,sub:USER
 });
 assert.deepEqual(f.state.calls,['signed-token']);
 assert.equal(f.verifier.readiness.productionAuthorized,false);
});
test('JWT adapter fails closed for wrong issuer, audience, signature errors or AAL1',async()=>{
 for(const bad of [claims({iss:'https://evil.example/auth/v1'}),
  claims({aud:'anon'}),claims({aal:'aal1'}),
  claims({session_id:'not-a-uuid'}),claims({exp:NOW}),
  claims({nbf:NOW+1}),claims({iat:NOW+90})]){
  assert.equal(await getVerifier({response:bad}).verifier.verifySignedJwt('signed-token'),null);
 }
 assert.equal(await getVerifier({error:{message:'invalid signature'}}).verifier.verifySignedJwt('signed-token'),null);
});
test('JWT adapter reports a verified different subject; V127 must enforce actor binding',async()=>{
 const f=getVerifier({response:claims({sub:OTHER})});
 const verified=await f.verifier.verifySignedJwt('signed-token');
 assert.equal(verified.sub,OTHER);
 assert.equal(verified.session_id,SID);
 // This valid subject does not authorize the original USER's operation.
});
test('JWT adapter refuses missing or malformed token and untrusted issuer configuration',async()=>{
 const f=getVerifier();
 for(const jwt of [null,123,'short',undefined]){
  assert.equal(await f.verifier.verifySignedJwt(jwt),null);
 }
 assert.equal(f.state.calls.length,0);
 assert.throws(()=>createV128SupabaseClaimsVerifier({
  auth:{getClaims:async()=>({})},expectedIssuer:'https://evil.example/auth/v1'
 }),TypeError);
});
test('V127 integrates native challenge and verify with real PG17 journal and getClaims contract',async()=>{
 const f=createJournal();let verified=0,stored=0;
 const auth={mfa:{
  listFactors:async()=>({data:{totp:[{id:FACTOR,status:'verified'}],phone:[]},error:null}),
  challenge:async()=>({data:{id:CH},error:null}),
  verify:async x=>{verified++;assert.deepEqual(x,{factorId:FACTOR,challengeId:CH,code:'123456'});
   return {data:{access_token:'SIGNED-JWT-FROM-VERIFY'},error:null};}
 },getClaims:async jwt=>{
   assert.equal(jwt,'SIGNED-JWT-FROM-VERIFY');
   return {data:{claims:claims()},error:null};
 }};
 const verifiedClaims=createV128SupabaseClaimsVerifier({auth,expectedIssuer:ISSUER,nowSec:()=>NOW});
 const bridge=createV127NativeMfaBridge({auth,
  actor:{subject:USER,sessionId:SID,tokenExpiresAtSec:NOW+80},
  journal:f.journal,newReference:()=>REF,nowSec:()=>NOW,receiptKey:Buffer.alloc(32,71),
  readActiveSession:async()=>authSession(),
  verifySignedJwt:verifiedClaims.verifySignedJwt,
  persistVerifiedReceipt:async r=>{
   assert.equal(r.proofReference,REF);assert.equal(r.subject,USER);stored++;
   return {recorded:true};
  }
 });
 try{
  assert.deepEqual(await bridge.begin({factorId:FACTOR}),{
   ok:true,proofReference:REF,productionAuthorized:false,formalV67Pass:0
  });
  assert.deepEqual(await bridge.confirm({code:'123456',proofReference:REF}),{
   ok:true,proofReference:REF,productionAuthorized:false,formalV67Pass:0
  });
  assert.deepEqual(await bridge.confirm({code:'123456',proofReference:REF}),{
   ok:false,productionAuthorized:false,formalV67Pass:0
  });
  assert.equal(verified,1);assert.equal(stored,1);
 }finally{await f.close();}
});
test('V127 native flow with same proofReference cannot verify after code error or network uncertainty',async()=>{
 const f=createJournal();let attempts=0;
 const auth={mfa:{
  listFactors:async()=>({data:{totp:[{id:FACTOR,status:'verified'}],phone:[]},error:null}),
  challenge:async()=>({data:{id:CH},error:null}),
  verify:async()=>{attempts++;throw Error('unknown network result');}
 },getClaims:async()=>({data:{claims:claims()},error:null})};
 const verifier=createV128SupabaseClaimsVerifier({auth,expectedIssuer:ISSUER,nowSec:()=>NOW});
 const bridge=createV127NativeMfaBridge({auth,actor:{subject:USER,sessionId:SID,tokenExpiresAtSec:NOW+80},
  journal:f.journal,readActiveSession:async()=>authSession(),
  verifySignedJwt:verifier.verifySignedJwt,persistVerifiedReceipt:async()=>({recorded:true}),
  receiptKey:Buffer.alloc(32,73),newReference:()=>REF,nowSec:()=>NOW
 });
 try{
  assert.equal((await bridge.begin({factorId:FACTOR})).ok,true);
  assert.equal((await bridge.confirm({code:'123456',proofReference:REF})).ok,false);
  assert.equal((await bridge.confirm({code:'123456',proofReference:REF})).ok,false);
  assert.equal(attempts,1);
 }finally{await f.close();}
});
