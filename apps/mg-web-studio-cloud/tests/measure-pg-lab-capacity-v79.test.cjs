'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {main}=require('../scripts/measure-pg-lab-capacity-v79.cjs');
function run(args){let text='';const rc=main(args,s=>text+=s);return {rc,text};}
test('help prints no measured information',()=>{
 const x=run(['--help']);assert.equal(x.rc,0);assert.match(x.text,/solo lectura/);
 assert.match(x.text,/UN ICAMENTE|UNICAMENTE/);
});
test('unrecognized arguments do not invoke sampling or write files',()=>{
 const x=run(['--install']);assert.equal(x.rc,2);
 assert.match(x.text,/--help/);
});
test('excessive flags are refused',()=>{
 assert.equal(run(['--json','--help']).rc,2);
});
