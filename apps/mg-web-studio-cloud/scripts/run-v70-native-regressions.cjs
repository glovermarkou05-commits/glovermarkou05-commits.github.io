'use strict';

// V70 native Node test launcher, no network and no Postgres connections.
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { existsSync } = require('node:fs');
const ROOT = resolve(__dirname, '..');
const GUARD = resolve(ROOT, 'server/native-network-guard-v70.cjs');
const REGRESSION_SUITES = Object.freeze([
  'tests/unbound-tenant-stack-v69-real.test.cjs',
  'tests/unbound-tenant-stack-v69.test.cjs',
  'tests/lab-proposal-v69.test.cjs',
  'tests/request-budget-v66.test.cjs',
  'tests/request-budget-v66-integration.test.cjs',
  'tests/http-server-v65-integration.test.cjs',
  'tests/http-site-gate-v63-integration.test.cjs'
]);
function createPlan({ root = ROOT } = {}) {
  // Tests resolve against the fixed project layout, not caller-controlled paths.
  if (root !== ROOT) throw new TypeError('V70 is bound to this project root');
  const paths = REGRESSION_SUITES.map(file => resolve(root, file));
  const missing = paths.filter(file => !existsSync(file));
  return Object.freeze({ command: process.execPath, args: Object.freeze([
    '--require', GUARD, '--test', ...paths
  ]), missing: Object.freeze(missing), plannedSuites: paths.length,
    networkAuthorized: false, databaseAuthorized: false,
    deploymentAuthorized: false, readiness: 'NO_GO' });
}
function run() {
  const plan = createPlan();
  if (plan.missing.length) {
    process.stderr.write(`V70_BLOCKED: ${plan.missing.length} regression source(s) not present.\n`);
    process.exitCode = 2;
    return;
  }
  const result = spawnSync(plan.command, plan.args, {
    cwd: ROOT, shell: false, stdio: 'inherit',
    env: { ...process.env, V70_TEST_ISOLATION: '1' },
    timeout: 120000, windowsHide: true
  });
  if (result.error) {
    process.stderr.write('V70_BLOCKED: Native Node runner unavailable or timed out.\n');
    process.exitCode = 2;
    return;
  }
  process.exitCode = result.status === 0 ? 0 : 1;
}
if (require.main === module) {
  if (process.argv.length === 3 && process.argv[2] === '--run-local-tests') run();
  else if (process.argv.length === 3 && process.argv[2] === '--check') {
    const plan = createPlan();
    process.stdout.write(JSON.stringify({plannedSuites:plan.plannedSuites,missingSuites:plan.missing.length,
      networkAuthorized:false,databaseAuthorized:false,deploymentAuthorized:false,
      readiness:plan.readiness}) + '\n');
    if (plan.missing.length) process.exitCode = 2;
  } else {
    process.stderr.write('Usage: node scripts/run-v70-native-regressions.cjs --check | --run-local-tests\n');
    process.exitCode = 2;
  }
}
module.exports = { createPlan, REGRESSION_SUITES };
