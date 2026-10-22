'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createV67Checklist, assessV67Evidence } = require('../server/security-acceptance-v67.cjs');
const plan = createV67Checklist();
const claim = (id, outcome = 'PASS', changes = {}) => ({
  id, outcome, kind: plan.tests.find(x => x.id === id).evidenceType,
  evidenceRef: `evidence/v67/${id}.json`, ...changes
});

test('V67 catalogue is immutable, complete, and does not perform network or SQL', () => {
  assert.equal(plan.version, 'V67');
  assert.equal(plan.tests.length, 32);
  assert.ok(Object.isFrozen(plan) && Object.isFrozen(plan.tests));
  assert.ok(plan.tests.every(x => Object.isFrozen(x)));
});
test('each checklist ID is unique, classified and has an observable expectation', () => {
  const ids = plan.tests.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(plan.tests.every(x => x.description.length > 15 && x.expected.length > 10));
  assert.deepEqual(new Set(plan.tests.map(x => x.group)), new Set(plan.groups));
});
test('parser security plan includes all risky HTTP edge cases', () => {
  const required = Array.from({ length: 14 }, (_, i) => `HTTP-${String(i + 1).padStart(2, '0')}`);
  assert.deepEqual(plan.tests.filter(x => x.group === 'parser').map(x => x.id), required);
});
test('matrix distinguishes sockets from identity, database, recovery, and policy evidence', () => {
  for (const group of plan.groups) assert.ok(plan.tests.some(x => x.group === group));
  assert.ok(plan.tests.filter(x => x.evidenceType === 'real_http').length >= 16);
  assert.ok(plan.tests.filter(x => x.evidenceType === 'restore').length >= 4);
});
test('default state accurately states all checks pending and always NO_GO', () => {
  const result = assessV67Evidence();
  assert.equal(result.submitted, 0);
  assert.equal(result.total, 32);
  assert.equal(result.pendingIds.length, 32);
  assert.deepEqual(result.failedIds, []);
  assert.equal(result.decision, 'NO_GO');
  assert.equal(result.liveHttpTestedByThisModule, false);
  assert.equal(result.recoveryTestedByThisModule, false);
  assert.equal(result.evidenceIndependentlyVerified, false);
  assert.equal(result.labAuthorized, false);
  assert.equal(result.deploymentAuthorized, false);
});
test('a partial claim never authorizes a socket or marks other cases passed', () => {
  const result = assessV67Evidence([claim('HTTP-01')]);
  assert.equal(result.submitted, 1);
  assert.equal(result.reportedPassCount, 1);
  assert.equal(result.pendingIds.length, 31);
  assert.equal(result.documentationComplete, false);
  assert.equal(result.decision, 'NO_GO');
});
test('reported failure and blocked status are separately preserved', () => {
  const result = assessV67Evidence([claim('HTTP-02', 'FAIL'), claim('REC-01', 'BLOCKED')]);
  assert.deepEqual(result.failedIds, ['HTTP-02']);
  assert.deepEqual(result.blockedIds, ['REC-01']);
  assert.equal(result.reportedPassCount, 0);
});
test('self-declared ALL PASS with plausible references is still unverified and NO_GO', () => {
  const all = plan.tests.map(x => claim(x.id));
  const result = assessV67Evidence(all);
  assert.equal(result.submitted, 32);
  assert.equal(result.reportedPassCount, 32);
  assert.deepEqual(result.pendingIds, []);
  assert.equal(result.documentationComplete, true);
  assert.equal(result.evidenceIndependentlyVerified, false);
  assert.equal(result.labAuthorized, false);
  assert.equal(result.deploymentAuthorized, false);
  assert.equal(result.decision, 'NO_GO');
});
test('even a claimed approval record does not grant authorization', () => {
  const result = assessV67Evidence([claim('OPS-01'), claim('OPS-02')]);
  assert.equal(result.labAuthorized, false);
  assert.equal(result.deploymentAuthorized, false);
});
test('duplicate case IDs fail closed', () => {
  assert.throws(() => assessV67Evidence([claim('HTTP-01'), claim('HTTP-01')]), TypeError);
});
test('unknown case IDs and unsupported outcome strings fail closed', () => {
  for (const x of [claim('HTTP-01', 'PASSED'), claim('HTTP-01', ''),
    {...claim('HTTP-01'), id: 'HTTP-99'}, {...claim('HTTP-01'), id: '../secret'}]) {
    assert.throws(() => assessV67Evidence([x]), TypeError);
  }
});
test('evidence kind must match the declared type for the case', () => {
  assert.throws(() => assessV67Evidence([claim('REC-01', 'PASS', {kind:'real_http'})]), TypeError);
  assert.throws(() => assessV67Evidence([claim('OBS-01', 'PASS', {kind:'restore'})]), TypeError);
});
test('missing or malformed evidence references cannot be counted', () => {
  for (const evidenceRef of ['', null, undefined, '/root/token.txt', 'https://secret.local',
    '../../passwords', 'evidence/v67/../a.json', 'evidence/v67/token?secret=1',
    `evidence/v67/${'X'.repeat(130)}`]) {
    assert.throws(() => assessV67Evidence([claim('HTTP-01', 'PASS', {evidenceRef})]), TypeError);
  }
});
test('unknown fields are rejected rather than copied or logged', () => {
  for (const extra of [{authorization:'Bearer SECRET'}, {password:'SECRET'}, {approver:true},
    {ip:'127.0.0.1'}, {role:'SUPERADMIN'}]) {
    assert.throws(() => assessV67Evidence([claim('HTTP-01', 'PASS', extra)]), TypeError);
  }
});
test('arrays, non-records and polluted prototypes are rejected', () => {
  for (const items of [null, {}, 'PASS', 42, [null], [[claim('HTTP-01')]],
    [Object.create({id:'HTTP-01'})]]) {
    assert.throws(() => assessV67Evidence(items), TypeError);
  }
});
test('no externally controlled fields are reflected in summary', () => {
  const result = assessV67Evidence([claim('OBS-02')]);
  const text = JSON.stringify(result);
  assert.ok(!text.includes('evidence/v67/'));
  assert.ok(!text.includes('SECRET'));
});
test('returned assessment and arrays cannot be modified between users', () => {
  const result = assessV67Evidence([claim('HTTP-01')]);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.pendingIds));
  assert.throws(() => result.pendingIds.push('INJECT'), TypeError);
  assert.equal(assessV67Evidence().submitted, 0);
});
test('catalogue requires real network/restore claims before describing real validation', () => {
  const matrix = createV67Checklist();
  const parser = matrix.tests.filter(x => x.group === 'parser');
  assert.ok(parser.every(x => x.evidenceType === 'real_http'));
  const recovery = matrix.tests.filter(x => x.group === 'recovery');
  assert.ok(recovery.every(x => x.evidenceType === 'restore'));
  assert.equal(matrix.defaultAssessment.liveHttpTestedByThisModule, false);
});
test('empty evidence and repeated invocations are deterministic', () => {
  assert.deepEqual(assessV67Evidence(), assessV67Evidence([]));
  assert.deepEqual(assessV67Evidence([claim('HTTP-01')]), assessV67Evidence([claim('HTTP-01')]));
});
