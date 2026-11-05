'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {main,preflight,CONSENT}=require('../qa/v135-mfa-integrated-one-shot.cjs');
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
