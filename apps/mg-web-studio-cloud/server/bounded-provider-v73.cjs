'use strict';

// V73: defensive scheduling of injected, trusted, READ-ONLY providers.
// Neither AbortSignal nor a timeout can forcibly stop uncooperative work.
// Consequently a timed-out operation holds capacity until it REALLY settles.
const { performance } = require('node:perf_hooks');
const between = (v, low, high) => Number.isSafeInteger(v) && v >= low && v <= high;
const EVENTS = new Set(['admitted', 'busy', 'circuit_open', 'timeout', 'error', 'success', 'late_settled', 'clock_error', 'stale']);

function createBoundedProviderV73({ run, maxConcurrent = 8, timeoutMs = 500,
  failureThreshold = 3, cooldownMs = 1000, nowMs = () => performance.now(),
  onAudit = () => {} } = {}) {
  if (typeof run !== 'function' || typeof onAudit !== 'function' || typeof nowMs !== 'function' ||
      !between(maxConcurrent, 1, 128) || !between(timeoutMs, 10, 30000) ||
      !between(failureThreshold, 1, 10) || !between(cooldownMs, 100, 300000)) {
    throw new TypeError('Bounded V73 provider and explicit policy required');
  }
  let active = 0, consecutiveFailures = 0, state = 'closed', openedAt = 0, lastClock = -1;
  let probing = false, epoch = 0;
  function emit(event) {
    if (!EVENTS.has(event)) return;
    // Never pass input, JWT, keys, provider result, stack or exception.
    try { onAudit(Object.freeze({event, active, circuit: state})); } catch { /* optional logging */ }
  }
  function failed(at, ticket) {
    if (ticket !== epoch) return;
    consecutiveFailures++;
    if (probing || consecutiveFailures >= failureThreshold) {
      state = 'open';
      openedAt = at;
      epoch++;
      probing = false;
    }
  }
  function succeeded() { consecutiveFailures = 0; state = 'closed'; probing = false; }
  function status() {
    return Object.freeze({ active, maxConcurrent, circuit: state });
  }
  async function execute(input) {
    let now;
    try { now = nowMs(); } catch { emit('clock_error'); return null; }
    if (!Number.isFinite(now) || now < 0 || now < lastClock) {
      emit('clock_error'); return null;
    }
    lastClock = now;
    if (state === 'open' && now - openedAt < cooldownMs) {
      emit('circuit_open'); return null;
    }
    if (state === 'half_open') { emit('circuit_open'); return null; }
    if (active >= maxConcurrent) { emit('busy'); return null; }
    const isProbe = state === 'open';
    if (isProbe) { state = 'half_open'; probing = true; }
    active++;
    const ticket = epoch;
    emit('admitted');
    const controller = new AbortController();
    let timeoutHandle, timedOut = false;
    const work = Promise.resolve().then(() => run(input, Object.freeze({signal:controller.signal})))
      .then(value => ({kind:'ok',value}), () => ({kind:'error'}));
    // Release only when the underlying provider actually settles. A timed out
    // provider which ignores abort() still occupies one of the finite slots.
    void work.then(() => {
      active--;
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      if (timedOut) emit('late_settled');
    });
    const deadline = new Promise(resolve => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        resolve({kind:'timeout'});
      }, timeoutMs);
    });
    const answer = await Promise.race([work, deadline]);
    if (answer.kind === 'ok' && answer.value !== undefined && answer.value !== null && !timedOut) {
      if (ticket !== epoch) { emit('stale'); return null; }
      succeeded();
      emit('success');
      return answer.value;
    }
    failed(now, ticket);
    emit(answer.kind === 'timeout' ? 'timeout' : 'error');
    return null;
  }
  return Object.freeze({ execute, status });
}

module.exports = { createBoundedProviderV73 };
