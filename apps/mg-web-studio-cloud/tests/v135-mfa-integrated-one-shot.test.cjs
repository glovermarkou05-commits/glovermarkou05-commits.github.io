'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {main,preflight,executeWith,CONSENT}=require('../qa/v135-mfa-integrated-one-shot.cjs');
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
