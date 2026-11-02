'use strict';

// V96: opt-in, process-local, privacy-minimized aggregates for the V66 observe callback.
// Not wired to production. No storage, network, files, timer, identifiers or alerts.
// Intended only for deterministic, offline tests and independent security review.
const { performance } = require('node:perf_hooks');

const ALLOWED_EVENTS = new Set([
  'admitted','completed','rate_limited','overloaded','peer_capacity','transport_error'
]);
const DURATION_BUCKETS = new Set([0,10,100,1000,10000]);
const ALLOWED_KEYS = 'durationBucketMs,event,status';
const PERIOD_MS = 60_000;
const PERIODS = 5;
const noEvent = () => ({ total:0, success2xx:0, redirect3xx:0, client4xx:0,
  server5xx:0, rateLimited429:0, overload503:0 });

const positiveStatus = status => Number.isSafeInteger(status) && status >= 100 && status <= 599;
const validStatus = status => status === null || status === 0 || positiveStatus(status);

// Strict shape: otherwise discard silently. A callback supplying headers, IP, path,
// requestId, token, raw error, etc. is never passed through or retained.
function sanitize(input) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).sort().join(',') !== ALLOWED_KEYS) return null;
    const {event,status,durationBucketMs}=input;
    if (!ALLOWED_EVENTS.has(event) || !validStatus(status) ||
        !DURATION_BUCKETS.has(durationBucketMs)) return null;
    if (event==='rate_limited' && status!==429) return null;
    if ((event==='overloaded'||event==='peer_capacity') && status!==503) return null;
    return {event,status};
  } catch { return null; }
}

function createV96PrivateObserver({now=()=>performance.now()}={}) {
  if (typeof now!=='function') throw new TypeError('monotonic clock required');
  let latest=-1;
  const periods=new Map();

  function pointInTime() {
    try {
      const timestamp=now();
      if (!Number.isFinite(timestamp) || timestamp < 0 || timestamp > Number.MAX_SAFE_INTEGER) return null;
      return Math.floor(timestamp/PERIOD_MS);
    } catch { return null; }
  }
  function advance(index) {
    if (index === null || index < latest) return false;
    if (index > latest) {
      latest=index;
      for (const key of periods.keys()) {
        if (key <= latest-PERIODS) periods.delete(key);
      }
    }
    return true;
  }
  function observe(input) {
    const event=sanitize(input);
    if (event===null) return false;
    const time=pointInTime();
    if (!advance(time)) return false;

    // Rejections without an admitted request can be counted once. 'transport_error'
    // may be emitted once again with 'completed': never double count that marker.
    const countable = (event.event==='completed' && positiveStatus(event.status)) ||
      event.event==='rate_limited'||event.event==='overloaded'||
      event.event==='peer_capacity';
    if (!countable) return true;

    let entry=periods.get(time);
    if (!entry) {
      entry=noEvent();
      periods.set(time,entry);
    }
    entry.total++;
    if (event.status>=200&&event.status<300) entry.success2xx++;
    if (event.status>=300&&event.status<400) entry.redirect3xx++;
    if (event.status>=400&&event.status<500) entry.client4xx++;
    if (event.status>=500&&event.status<600) entry.server5xx++;
    if (event.event==='rate_limited') entry.rateLimited429++;
    if (event.event==='overloaded'||event.event==='peer_capacity') entry.overload503++;
    return true;
  }
  function snapshot() {
    const time=pointInTime();
    if (time===null || !advance(time)) {
      return Object.freeze({
        valid:false,intervalMinutes:5,persisted:false,notificationSent:false,
        activeAlerts:false,correlationAvailable:false
      });
    }
    const totals=noEvent();
    for(const entry of periods.values()) {
      for (const key of Object.keys(totals)) totals[key]+=entry[key];
    }
    const total=totals.total;
    const enoughSamples=total>=20;
    const errorRate=total?totals.server5xx/total:0;
    const limitRate=total?totals.rateLimited429/total:0;
    const result={
      valid:true,intervalMinutes:5,persisted:false,notificationSent:false,
      activeAlerts:false,correlationAvailable:false,
      countedRequestEvents:total,
      ...totals,
      // Dry-run *only*, not active alerts or automatic incident decisions.
      candidateSignals:Object.freeze({
        A1:enoughSamples&&errorRate>=0.05,
        A2:enoughSamples&&limitRate>=0.10,
        A3:null
      }),
      proposedAlertStatus:'DRY_RUN_ONLY_NO_OWNER_OR_DELIVERY',
      missingTelemetryStatus:'NOT_EVALUABLE_WITHOUT_INDEPENDENT_CONFIRMED_TRAFFIC',
      limitations:'TRANSPORT_ERROR_WITHOUT_COMPLETED_NOT_COUNTED;NO_REAL_PROXY_OR_SINK'
    };
    return Object.freeze(result);
  }
  return Object.freeze({observe,snapshot});
}
module.exports={createV96PrivateObserver,sanitize};
