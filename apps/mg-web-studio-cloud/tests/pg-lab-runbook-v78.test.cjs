'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createPgLabRunbookV78,reviewPgLabRunbookV78}
  =require('../server/pg-lab-runbook-v78.cjs');
const get=()=>createPgLabRunbookV78();
const valid=()=>({origin:'SYNTHETIC_RUNBOOK_ONLY',
  request:structuredClone(get().request),
  statuses:get().statuses.map(s=>({...s}))});
test('ten manual phases cover preparation, dry run, cleanup and final review',()=>{
 const m=get();
 assert.deepEqual(m.tasks.map(x=>x.id),[
  'PRE_01','PRE_02','PRE_03','PRE_04',
  'RUN_05','RUN_06','RUN_07','END_08','END_09','END_10'
 ]);
 assert.equal(m.tasks.length,10);
});
test('every runbook item is PENDING with expected evidence and a separate approval',()=>{
 const m=get();
 for(let i=0;i<m.tasks.length;i++){
  const p=m.tasks[i];
  assert.equal(m.statuses[i].id,p.id);assert.equal(m.statuses[i].status,'PENDING');
  assert.ok(p.exitEvidence.length>15);
  assert.ok(Object.hasOwn(m.request.approvals,p.requiredApproval));
 }
});
test('first four phases require resource, network, SQL, and fixtures review',()=>{
 const phases=get().tasks.slice(0,4);
 assert.deepEqual(phases.map(x=>x.requiredApproval),['database','network','sqlRead','tenantFixtures']);
});
test('SQL preview is explicitly a dry run rather than an executor',()=>{
 const p=get().tasks.find(x=>x.id==='RUN_05');
 assert.equal(p.category,'dry_run');
 assert.match(p.task,/seven V77 catalog SELECT statements/);
 assert.ok(!('execute' in p));
});
test('recovery retains its own independent restore approval',()=>{
 const p=get().tasks.find(x=>x.id==='END_09');
 assert.equal(p.requiredApproval,'restore');
 assert.match(p.exitEvidence,/pending/);
});
test('cleanup does not claim backup deletion or rollback execution',()=>{
 const p=get().tasks.find(x=>x.id==='END_08');
 assert.match(p.task,/explicit approval/);
 assert.equal(get().readiness.restoreAllowed,false);
});
test('only final review mentions production and it cannot approve deployment',()=>{
 const p=get().tasks.find(x=>x.id==='END_10');
 assert.equal(p.requiredApproval,'production');
 assert.equal(get().readiness.productionAllowed,false);
});
test('regression case counts and V67 pending numbers remain fixed',()=>{
 const p=get().readiness;
 assert.equal(p.readOnlyCatalogQueries,7);
 assert.equal(p.tenantNegativeAndPositiveCases,12);
 assert.equal(p.pg17OperationalEvidencePassed,0);
 assert.equal(p.v67Pending,32);
});
test('valid synthetic runbook is still NO_GO with no SQL run',()=>{
 const out=reviewPgLabRunbookV78(valid());
 assert.equal(out.syntheticRunbookShapeValid,true);
 assert.equal(out.tasksExecuted,0);assert.equal(out.queriesExecuted,0);
 assert.equal(out.tenantCasesExecuted,0);assert.equal(out.approvalsGranted,false);
 assert.equal(out.recoveryPerformed,false);
 assert.equal(out.actualPgEvidenceValidated,false);
 assert.equal(out.productionAuthorized,false);assert.equal(out.decision,'NO_GO');
});
test('claiming a completed task does not count as evidence or validation',()=>{
 const v=valid();v.statuses[0].status='PASS';
 const result=reviewPgLabRunbookV78(v);
 assert.equal(result.syntheticRunbookShapeValid,false);
 assert.equal(result.tasksExecuted,0);
});
test('claiming approval in embedded manifest must fail',()=>{
 const v=valid();v.request.approvals.sqlRead='APPROVED';
 assert.equal(reviewPgLabRunbookV78(v).syntheticRunbookShapeValid,false);
});
test('pending list rejects added or missing phases',()=>{
 const one=valid();one.statuses.pop();
 assert.equal(reviewPgLabRunbookV78(one).syntheticRunbookShapeValid,false);
 const two=valid();two.statuses.push({id:'RUN_11',status:'PENDING'});
 assert.equal(reviewPgLabRunbookV78(two).syntheticRunbookShapeValid,false);
});
test('phase IDs must be ordered and duplicates are rejected',()=>{
 const v=valid();v.statuses.reverse();
 assert.equal(reviewPgLabRunbookV78(v).syntheticRunbookShapeValid,false);
 const x=valid();x.statuses[1].id=x.statuses[0].id;
 assert.equal(reviewPgLabRunbookV78(x).syntheticRunbookShapeValid,false);
});
test('unrecognized checklist fields cannot authorize actions',()=>{
 const v=valid();v.statuses[0].token='SECRET';
 const r=reviewPgLabRunbookV78(v);
 assert.equal(r.syntheticRunbookShapeValid,false);
 assert.ok(!JSON.stringify(r).includes('SECRET'));
});
test('live origin or unknown root property is rejected',()=>{
 const v=valid();v.origin='LIVE_SUPABASE';
 assert.equal(reviewPgLabRunbookV78(v).syntheticRunbookShapeValid,false);
 const w=valid();w.allowSql=true;
 assert.equal(reviewPgLabRunbookV78(w).syntheticRunbookShapeValid,false);
});
test('null, arrays, inherited or partial inputs fail without exception',()=>{
 for(const v of [null,undefined,{},[],1,'bad',Object.create(valid())]){
  assert.equal(reviewPgLabRunbookV78(v).syntheticRunbookShapeValid,false);
 }
});
test('runbook objects and statuses are immutable',()=>{
 const m=get(),r=reviewPgLabRunbookV78(valid());
 assert.ok(Object.isFrozen(m)&&Object.isFrozen(m.tasks)&&Object.isFrozen(m.statuses));
 assert.ok(m.tasks.every(Object.isFrozen)&&m.statuses.every(Object.isFrozen));
 assert.ok(Object.isFrozen(r));
 assert.throws(()=>{m.statuses[0].status='PASS'},TypeError);
});
test('no real operations are exported and all four capabilities remain disabled',()=>{
 const m=get();
 for(const field of ['databaseConnectionAllowed','networkAllowed','fixtureWritesAllowed',
    'restoreAllowed','productionAllowed'])assert.equal(m.readiness[field],false);
 for(const name of ['connect','query','restore','listen','publish','grant','createUser'])
  assert.equal(name in m,false);
});
