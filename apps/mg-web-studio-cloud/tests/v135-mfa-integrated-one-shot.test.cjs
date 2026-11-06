'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {main,preflight,checkPrivateRoleConnections,executeWith,CONSENT}=require('../qa/v135-mfa-integrated-one-shot.cjs');
test('V135 integrated dry-run is strictly no-network and no-secret',async()=>{
 assert.equal(await main(['--dry-run'],{}),0);
});
test('V135 integrated rejects execution unless QA identity and consent match',async()=>{
 assert.equal(preflight({}), 'WRONG_QA_SCOPE');
 const sample={MG_AUTH_QA_PROJECT_REF:'tbfhiqkivsoeuudlpkgi',
  MG_AUTH_QA_URL:'https://tbfhiqkivsoeuudlpkgi.supabase.co'};
 assert.equal(preflight(sample),'CONFIRMATION_REQUIRED');
 assert.equal(await main(['--execute'],sample),2);
 assert.equal(preflight({...sample,MG_V135_CONFIRMATION:'invalid'}),'CONFIRMATION_REQUIRED');
 assert.equal(typeof CONSENT,'string');
 assert.ok(CONSENT.includes('QA_USER_AND_DELETE'));
});
test('V135 integrated malformed CLI flags fail closed',async()=>{
 assert.equal(await main([],{}),2);
 assert.equal(await main(['--execute','--dry-run'],{}),2);
});

test('V135 integrated does not create when QA is not empty',async()=>{
 let creations=0;
 const admin={auth:{admin:{
  listUsers:async()=>({data:{users:[{id:'existing-user'}]},error:null}),
  createUser:async()=>{creations++;return {};},
  deleteUser:async()=>{throw Error('must not delete existing user');}
 }}};
 const result=await executeWith({admin,user:{auth:{}},Pool:function(){}});
 assert.equal(result.passed,false);
 assert.equal(result.stage,'PRECHECK');
 assert.equal(result.cleanup,'CONFIRMED');
 assert.equal(creations,0);
});
test('V135 integrated cleans up exclusively the created synthetic ID after sign-in failure',async()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 let deleted=[];
 const admin={auth:{admin:{
  listUsers:async()=>({data:{users:[]},error:null}),
  createUser:async()=>({data:{user:{id}},error:null}),
  deleteUser:async(uid)=>{deleted.push(uid);return {error:null};}
 }}};
 const user={auth:{signInWithPassword:async()=>({error:{message:'blocked'}})}};
 const result=await executeWith({admin,user,Pool:function(){}});
 assert.equal(result.passed,false);
 assert.equal(result.cleanup,'CONFIRMED');
 assert.equal(result.stage,'ENROLL');
 assert.deepEqual(deleted,[id]);
});
test('V135 integrated uncertain creation forces manual review without guessing an ID',async()=>{
 let deletes=0;
 const admin={auth:{admin:{
  listUsers:async()=>({data:{users:[]},error:null}),
  createUser:async()=>({error:{message:'network uncertain'}}),
  deleteUser:async()=>{deletes++;return {};}
 }}};
 const result=await executeWith({admin,user:{auth:{}},Pool:function(){}});
 assert.equal(result.passed,false);
 assert.equal(result.cleanup,'CREATION_UNCERTAIN_REVIEW');
 assert.equal(deletes,0);
});

const roles=['mg_qa_mfa_challenge_journal','mg_qa_mfa_receipt_issuer','mg_qa_mfa_receipt_reader'];
const secrets=['v135-journal-unique-secret-test-only','v135-issuer-unique-secret-test-only','v135-reader-unique-secret-test-only'];
function mockPg({failRole=null,badTls=false,badPrincipal=false}={}){
 const observed=[];
 class Pool{
  constructor(options){this.options=options;observed.push(options.user);}
  async connect(){
   const role=this.options.user.split('.')[0];
   if(failRole===role)throw Error('synthetic password failure SECRET_DO_NOT_LOG');
   return {
    connection:{stream:{
     encrypted:true,authorized:!badTls,
     getPeerCertificate:()=>({
      subject:{CN:'aws-1-sa-east-1.pooler.supabase.com'},
      subjectaltname:'DNS:aws-1-sa-east-1.pooler.supabase.com'
     })
    }},
    query:async()=>({rowCount:1,rows:[{
     db:'postgres',current_user:badPrincipal?'postgres':role,
     session_user:role,is_replica:false
    }]}),
    release:()=>{}
   };
  }
  async end(){}
 }
 return {Pool,observed};
}
test('V135 role precheck accepts three distinct verified TLS principals',async()=>{
 const m=mockPg();
 assert.equal(await checkPrivateRoleConnections({
  Pool:m.Pool,caPem:'offline-test-ca',passwords:secrets
 }),null);
 assert.deepEqual(m.observed,roles.map(x=>x+'.tbfhiqkivsoeuudlpkgi'));
});
test('V135 role precheck stops before later roles when journal authentication fails',async()=>{
 const m=mockPg({failRole:roles[0]});
 assert.equal(await checkPrivateRoleConnections({
  Pool:m.Pool,caPem:'offline-test-ca',passwords:secrets
 }),'ROLE_CONNECTION_FAILED_'+roles[0]);
 assert.equal(m.observed.length,1);
});
test('V135 role precheck isolates issuer and reader failures without exposing secrets',async()=>{
 for(const index of [1,2]){
  const m=mockPg({failRole:roles[index]});
  const outcome=await checkPrivateRoleConnections({
   Pool:m.Pool,caPem:'offline-test-ca',passwords:secrets
  });
  assert.equal(outcome,'ROLE_CONNECTION_FAILED_'+roles[index]);
  assert.equal(outcome.includes('SECRET_DO_NOT_LOG'),false);
  assert.equal(m.observed.length,index+1);
 }
});
test('V135 role precheck fails closed on TLS or server principal mismatch',async()=>{
 const m=mockPg({badTls:true});
 assert.equal(await checkPrivateRoleConnections({
  Pool:m.Pool,caPem:'offline-test-ca',passwords:secrets
 }),'TLS_OR_SERVER_IDENTITY_REJECTED');
 const n=mockPg({badPrincipal:true});
 assert.equal(await checkPrivateRoleConnections({
  Pool:n.Pool,caPem:'offline-test-ca',passwords:secrets
 }),'ROLE_IDENTITY_MISMATCH_'+roles[0]);
});
