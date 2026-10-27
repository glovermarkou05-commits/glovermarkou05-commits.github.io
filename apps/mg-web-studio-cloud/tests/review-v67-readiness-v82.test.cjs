'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {main}=require('../scripts/review-v67-readiness-v82.cjs');
function capture(args){let output='';return {result:main(args,x=>output+=x),get output(){return output}};}
test('summary is default and contains exactly seven staged groups',()=>{
 const x=capture([]);
 assert.equal(x.result,0);
 for(const id of ['G0','G1','G2','G3','G4','G5','G6'])assert.ok(x.output.includes(id+' '));
 assert.match(x.output,/32\/32 PENDING/);assert.match(x.output,/NO_GO/);
});
test('summary enumerates all original 32 IDs',()=>{
 const x=capture(['--summary']);
 for(const prefix of ['HTTP','LOAD','OBS','AUTH','DATA','REC','OPS']){
  assert.ok(x.output.includes(prefix+'-01'),prefix);
 }
});
test('JSON output is fixed, sanitized, offline and no GO',()=>{
 const x=capture(['--json']);
 assert.equal(x.result,0);
 const json=JSON.parse(x.output);
 assert.equal(json.packet.tests.length,32);
 assert.equal(json.packet.pendingTests,32);
 assert.equal(json.assessment.liveTestsRun,0);
 assert.equal(json.assessment.v67Pending,32);
 assert.equal(json.assessment.decision,'NO_GO');
 assert.equal(json.packet.executionEnvironment,'UNSELECTED');
});
test('any unrecognized flag returns code 2 and does not execute',()=>{
 for(const flags of [['--start'],['--connect'],['--deploy'],['--json','--summary']]){
  const x=capture(flags);
  assert.equal(x.result,2);assert.match(x.output,/Argumento no permitido/);
 }
});
test('help describes only a non-executing offline command',()=>{
 const x=capture(['--help']);
 assert.equal(x.result,0);
 assert.match(x.output,/SIN EJECUTARLAS/);
 assert.match(x.output,/--json/);
});
test('summary does not print endpoint URL, credentials or Docker connection',()=>{
 const x=capture([]);
 assert.ok(!/postgres:\/\//.test(x.output));
 assert.ok(!/https?:\/\//.test(x.output));
 assert.ok(!/P@SSW0RD/.test(x.output));
 assert.ok(!/localhost:\d+/.test(x.output));
});
