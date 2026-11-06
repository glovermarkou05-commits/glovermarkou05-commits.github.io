'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createOneShotMfaQaV107,totp,validateScope,PROJECT_NAME}
 =require('./v107-mfa-one-shot.cjs');
const {preflight}=require('./v107-mfa-cli.cjs');
const U='11111111-1111-4111-8111-111111111111';
const S='22222222-2222-4222-8222-222222222222';
const F='33333333-3333-4333-8333-333333333333';
const C='44444444-4444-4444-8444-444444444444';
const NOW=2000000000000, NOWSEC=Math.floor(NOW/1000);
const OLD='old.signed.synthetic.jwt.2026';
const NEW='new.signed.synthetic.jwt.2026';
const BASE32='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
function fixture(change={}){
 const calls=[];
 const event=(name,argument)=>{calls.push({name,argument});};
 const admin={auth:{admin:{
  listUsers:async a=>{event('listUsers',a);return {data:{users:change.users??[]},error:null};},
  createUser:async a=>{event('createUser',{email:a.email,passwordLength:a.password.length,email_confirm:a.email_confirm});
    if(change.createThrows)throw Error('PRIVATE_ACCESS_TOKEN');
    return change.createResponse??{data:{user:{id:U}},error:null};},
  deleteUser:async id=>{event('deleteUser',id);
    if(change.deleteThrows)throw Error('SECRET_ADMIN');
    return change.deleteResponse??{data:{},error:null};}
 }}};
 const user={auth:{
  signInWithPassword:async a=>{event('signIn',{email:a.email,passwordLength:a.password.length});
    return change.signInResponse??{data:{user:{id:U},session:{access_token:OLD}},error:null};},
  getClaims:async token=>{event('getClaims',token===OLD?'old':'new');
    if(token===OLD)return change.initialResponse??{data:{claims:{
      sub:U,session_id:S,aal:'aal1',exp:NOWSEC+900
    }},error:null};
    return change.finalResponse??{data:{claims:{
      sub:U,session_id:S,aal:'aal2',exp:NOWSEC+900,
      amr:[{method:'totp',timestamp:NOWSEC-1}]
    }},error:null};},
  getUser:async token=>{event('getUser',token===NEW?'new':'old');
    return change.userResponse??{data:{user:{id:U}},error:null};},
  mfa:{
   enroll:async a=>{event('enroll',a.factorType);
     return change.enrollResponse??{data:{id:F,totp:{secret:BASE32}},error:null};},
   challenge:async a=>{event('challenge',a.factorId);
     return change.challengeResponse??{data:{id:C},error:null};},
   verify:async a=>{event('verify',{factorId:a.factorId,challengeId:a.challengeId,codeLength:a.code.length});
     return change.verifyResponse??{data:{access_token:NEW},error:null};},
   getAuthenticatorAssuranceLevel:async token=>{event('aal',token===NEW?'new':'bad');
     return change.aalResponse??{data:{currentLevel:'aal2',nextLevel:'aal2'},error:null};}
  },
  signOut:async args=>{event('signOut',args.scope);
    if(change.signOutThrows)throw Error('PRIVATE_USER_SESSION');
    return change.signOutResponse??{error:null};}
 }};
 const engine=createOneShotMfaQaV107({admin,user,nowMs:()=>NOW,
   passwordFactory:()=>('correcthorsebatterystapleX'.repeat(2))});
 return {engine,calls};
}
test('RFC 6238 TOTP SHA-1 fixture (59 seconds, 6 digits) matches known reference',()=>{
 assert.equal(totp(BASE32,59000),'287082');
 assert.equal(totp('not base32',59000),null);
 assert.equal(totp(BASE32,-1),null);
});
test('hash-pinned project rejects all fabricated or neighboring targets',()=>{
 for(const scope of [null,{},{
  projectRef:'zzzzzzzzzzzzzzzzzzzz',
  projectUrl:'https://zzzzzzzzzzzzzzzzzzzz.supabase.co',
  projectName:PROJECT_NAME
 },{
  projectRef:'zzzzzzzzzzzzzzzzzzzz',
  projectUrl:'http://zzzzzzzzzzzzzzzzzzzz.supabase.co',
  projectName:PROJECT_NAME
 }])assert.equal(validateScope(scope),false);
});
test('CLI rejects missing keys/confirmation/project without loading SDK',()=>{
 const v=preflight({});
 assert.equal(v.ok,false);assert.equal(v.code,'WRONG_PROJECT_SCOPE');
});
test('CLI --dry-run performs no network, no secret reading and exits cleanly',()=>{
 const p=spawnSync(process.execPath,[path.join(__dirname,'v107-mfa-cli.cjs'),'--dry-run'],
   {encoding:'utf8',env:{}});
 assert.equal(p.status,0);
 assert.match(p.stdout,/DRY_RUN/);
 assert.doesNotMatch(p.stdout,/SECRET|@example.invalid|JWT/);
});
test('happy path uses one synthetic account, authenticates AAL2, then logs out/deletes',async()=>{
 const {engine,calls}=fixture();
 const result=await engine.run();
 assert.deepEqual(result,{passed:true,stage:'COMPLETE',cleanup:'CONFIRMED',
   productionAuthorized:false,formalV67Pass:0});
 assert.deepEqual(calls.map(x=>x.name),[
  'listUsers','createUser','signIn','getClaims','enroll','challenge',
  'verify','getClaims','getUser','aal','signOut','deleteUser'
 ]);
 const create=calls.find(x=>x.name==='createUser');
 assert.equal(create.argument.email,'mg-webstudio-v107-qa@example.invalid');
 assert.equal(create.argument.email_confirm,true);
 assert.equal(calls.find(x=>x.name==='signOut').argument,'global');
 assert.equal(calls.find(x=>x.name==='deleteUser').argument,U);
 assert.ok(Object.isFrozen(result));
});
test('never returns any secret, account name, ID, TOTP or token',async()=>{
 const {engine}=fixture();
 const raw=JSON.stringify(await engine.run());
 for(const privateValue of [OLD,NEW,U,S,F,C,BASE32,'mg-webstudio-v107-qa@example.invalid']){
   assert.equal(raw.includes(privateValue),false,privateValue);
 }
});
test('second execution from the same engine is refused without creating another user',async()=>{
 const {engine,calls}=fixture();
 assert.equal((await engine.run()).passed,true);
 assert.equal((await engine.run()).passed,false);
 assert.equal(calls.filter(x=>x.name==='createUser').length,1);
});
test('preexisting users prevent any create/delete, without inspecting their data',async()=>{
 const {engine,calls}=fixture({users:[{id:'not-read'}]});
 const x=await engine.run();
 assert.deepEqual({stage:x.stage,cleanup:x.cleanup,passed:x.passed},
  {stage:'EMPTY_LAB',cleanup:'CONFIRMED',passed:false});
 assert.equal(calls.some(x=>x.name==='createUser'),false);
 assert.equal(calls.some(x=>x.name==='deleteUser'),false);
});
test('creation failure with unknown status requests human review, never blind delete',async()=>{
 const {engine,calls}=fixture({createResponse:{data:{},error:null}});
 const x=await engine.run();
 assert.equal(x.passed,false);
 assert.equal(x.cleanup,'MANUAL_REVIEW_CREATION_UNCERTAIN');
 assert.equal(calls.some(v=>v.name==='deleteUser'),false);
});
test('creation provider throwing cannot generate a second account automatically',async()=>{
 const {engine,calls}=fixture({createThrows:true});
 const x=await engine.run();
 assert.equal(x.passed,false);
 assert.equal(x.cleanup,'MANUAL_REVIEW_CREATION_UNCERTAIN');
 assert.equal(calls.filter(v=>v.name==='createUser').length,1);
});
test('sign-in exception or bad returned token triggers deletion of created account',async()=>{
 const {engine,calls}=fixture({signInResponse:{data:{user:{id:U},session:{}},error:null}});
 const x=await engine.run();
 assert.equal(x.passed,false);
 assert.equal(x.stage,'SIGN_IN');
 assert.equal(x.cleanup,'CONFIRMED');
 assert.ok(calls.some(v=>v.name==='deleteUser'));
});
test('wrong initial AAL, user or session stops before factor enrollment and still cleans up',async()=>{
 for(const patch of [{aal:'aal2'},{sub:'wrong'},{session_id:'wrong'}]){
  const {engine,calls}=fixture({initialResponse:{data:{claims:{
   sub:U,session_id:S,aal:'aal1',exp:NOWSEC+900,...patch
  }},error:null}});
  const x=await engine.run();
  assert.equal(x.passed,false);
  assert.equal(x.stage,'AAL1');
  assert.equal(calls.some(v=>v.name==='enroll'),false);
  assert.equal(x.cleanup,'CONFIRMED');
 }
});
test('enroll error triggers logout and delete, without challenge',async()=>{
 const {engine,calls}=fixture({enrollResponse:{data:{},error:{code:'REDACT'}}});
 const x=await engine.run();
 assert.equal(x.stage,'ENROLL');
 assert.equal(x.passed,false);
 assert.equal(x.cleanup,'CONFIRMED');
 assert.equal(calls.some(v=>v.name==='challenge'),false);
});
test('challenge failure prevents OTP verify and triggers cleanup',async()=>{
 const {engine,calls}=fixture({challengeResponse:{data:{id:'fake'},error:null}});
 const x=await engine.run();
 assert.equal(x.stage,'CHALLENGE');
 assert.equal(x.passed,false);
 assert.equal(calls.some(v=>v.name==='verify'),false);
 assert.equal(x.cleanup,'CONFIRMED');
});
test('a provider-rejected MFA code fails closed and deletes the QA identity',async()=>{
 const {engine,calls}=fixture({verifyResponse:{data:null,error:{message:'SECRET_OTP'}}});
 const x=await engine.run();
 assert.equal(x.stage,'VERIFY');
 assert.equal(x.passed,false);
 assert.equal(x.cleanup,'CONFIRMED');
 assert.ok(calls.some(v=>v.name==='deleteUser'));
});
test('after MFA, wrong AAL2 or changed session fails but still cleans up',async()=>{
 for(const patch of [{aal:'aal1'},{session_id:'different'},{sub:'other'},
   {exp:NOWSEC-1},{amr:[]} ]){
  const {engine,calls}=fixture({finalResponse:{data:{claims:{
   sub:U,session_id:S,aal:'aal2',exp:NOWSEC+900,
   amr:[{method:'totp',timestamp:NOWSEC-1}],...patch
  }},error:null}});
  const x=await engine.run();
  assert.equal(x.passed,false);
  assert.equal(x.stage,'AAL2');
  assert.equal(x.cleanup,'CONFIRMED');
  assert.ok(calls.some(v=>v.name==='deleteUser'));
 }
});
test('server identity mismatch or current AAL1 cannot pass',async()=>{
 for(const k of ['identity','aal']){
  const {engine}=fixture(k==='identity'?{userResponse:{data:{user:{id:'other'}},error:null}}:
  {aalResponse:{data:{currentLevel:'aal1',nextLevel:'aal2'},error:null}});
  assert.equal((await engine.run()).passed,false);
 }
});
test('failure to delete QA user overrides any successful MFA test',async()=>{
 const {engine}=fixture({deleteResponse:{data:null,error:{message:'KEY'}}});
 const x=await engine.run();
 assert.equal(x.passed,false);
 assert.equal(x.cleanup,'FAILED_DELETE_MANUAL_REVIEW');
});
test('failed signOut cannot be reported as complete even after delete succeeded',async()=>{
 const {engine}=fixture({signOutThrows:true});
 const x=await engine.run();
 assert.equal(x.passed,false);
 assert.equal(x.cleanup,'PARTIAL_SIGNOUT_FAILED');
});
test('redacted module contains no SQL, keys, URL to another project or logs',()=>{
 const src=fs.readFileSync(path.join(__dirname,'v107-mfa-one-shot.cjs'),'utf8');
 const bad=["require('@supabase/supabase-js')","require('pg')","createServer(",
   'console.log(','console.error(','service_role:',"@gmail.com","INSERT INTO",
   "GRANT SELECT","SECURITY DEFINER","tbfhiqkivsoeuudlpkgi"];
 for(const forbidden of bad)assert.equal(src.includes(forbidden),false,forbidden);
});
