'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createV67Checklist } = require('../server/security-acceptance-v67.cjs');
const fixture = JSON.parse(readFileSync(path.join(__dirname,'../docs/V67-EVIDENCIAS-PENDIENTES.json'),'utf8'));
const doc = readFileSync(path.join(__dirname,'../docs/V67-MATRIZ-HTTP-OBSERVABILIDAD-RECUPERACION.md'),'utf8');
const checks=createV67Checklist().tests;
test('persistent evidence template has exactly the 32 canonical V67 IDs',()=>{
  assert.equal(fixture.version,'V67');
  assert.equal(fixture.cases.length,checks.length);
  assert.deepEqual(fixture.cases.map(x=>x.id),checks.map(x=>x.id));
});
test('all evidence defaults to PENDING without fictitious artifacts',()=>{
  assert.ok(fixture.cases.every(x=>x.status==='PENDING'&&x.evidenceRef===null));
  for(let i=0;i<checks.length;i++)assert.equal(fixture.cases[i].evidenceType,checks[i].evidenceType);
});
test('template grants no lab, database, recovery, or production authorization',()=>{
  for(const key of ['networkAuthorized','databaseAccessAuthorized','restoreAuthorized','deploymentAuthorized','allEvidenceIndependentlyVerified']){
    assert.equal(fixture[key],false);
  }
  assert.equal(fixture.decision,'NO_GO');
  assert.equal(fixture.environment,'NOT_SELECTED');
});
test('documented matrix includes every canonical case',()=>{
  for(const entry of checks){
    assert.ok(doc.includes('| '+entry.id+' | '),entry.id);
    assert.ok(doc.includes(entry.expected),entry.id+' expectation');
  }
});
test('documentation distinguishes simulated tests from real parser/restore evidence',()=>{
  for(const phrase of ['no abrir conexiones TCP','No se ejecutó dump/restauración','NO GO','PENDING','JWT real','PostgreSQL 17']){
    assert.ok(doc.includes(phrase),phrase);
  }
});
test('documentation and evidence template never include secret keys',()=>{
  const joined=JSON.stringify(fixture)+doc;
  assert.doesNotMatch(joined,/\b(?:sk_live_|sb_secret_|eyJhbGciOi)\S+/);
  assert.doesNotMatch(joined,/postgres(?:ql)?:\/\/[^\s]+@/);
});
