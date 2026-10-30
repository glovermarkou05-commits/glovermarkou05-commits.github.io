'use strict';

// V92: pure in-memory, fail-closed review of V66 safe aggregate events.
// NOT wired to production, no background collector, logging service, alerts,
// storage, file writes, environment variables, network or operational approval.
const EVENTS=Object.freeze([
  'admitted','rate_limited','overloaded','peer_capacity',
  'completed','transport_error'
]);
const BUCKETS=Object.freeze([0,10,100,1000,10000]);
const FIELDS=Object.freeze(['event','status','durationBucketMs']);
const MAX_OBSERVATIONS=256;
const isPlain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(x));
const ownKeys=x=>Object.keys(x).sort();
function sanitizeV66Event(input){
  // Reject even an accidental extra key; never serialize, copy or retain it.
  let event,status,bucket;
  try{
    if(!isPlain(input)||JSON.stringify(ownKeys(input))!==
      JSON.stringify([...FIELDS].sort()))return null;
    ({event,status,durationBucketMs:bucket}=input);
  }catch{return null;}
  if(typeof event!=='string'||!EVENTS.includes(event)||
    !BUCKETS.includes(bucket))return null;
  if(event==='completed'){
    if(status!==null&&(!Number.isSafeInteger(status)||
      status<100||status>599))return null;
  }else if(
    (event==='admitted'&&status!==0)||
    (event==='rate_limited'&&status!==429)||
    (event!=='admitted'&&event!=='rate_limited'&&status!==503)
  )return null;
  // Output has ONLY three schema-validated primitives, never source reference.
  return Object.freeze({event,status,durationBucketMs:bucket});
}
function createOfflineTelemetryReview({maxObservations=MAX_OBSERVATIONS}={}){
  if(!Number.isSafeInteger(maxObservations)||maxObservations<1||
    maxObservations>MAX_OBSERVATIONS)
    throw new TypeError('V92 bounded, in-memory review capacity required');
  const eventCounts=Object.fromEntries(EVENTS.map(x=>[x,0]));
  let accepted=0,rejected=0,excess=0;
  function inspect(input){
    if(accepted+rejected+excess>=maxObservations){
      excess++;
      return false;
    }
    const safe=sanitizeV66Event(input);
    if(!safe){rejected++;return false;}
    eventCounts[safe.event]++;
    accepted++;
    return true;
  }
  function summary(){
    return Object.freeze({
      mode:'OFFLINE_AGGREGATED_REVIEW_ONLY',
      inputStored:false,rawEventStored:false,hasPersistentLogs:false,
      hasCrossLayerCorrelation:false,alertsConfigured:false,
      policyApproved:false,independentReviewerAssigned:false,
      observationsAccepted:accepted,observationsRejected:rejected,
      observationsOverCapacity:excess,
      counts:Object.freeze({...eventCounts}),
      v67ObservabilityStatus:'FOUR_PENDING',
      formalV67Pending:32,formalV67Verified:0,
      productionAuthorized:false,decision:'NO_GO'
    });
  }
  return Object.freeze({inspect,summary});
}
module.exports=Object.freeze({
  sanitizeV66Event,createOfflineTelemetryReview,EVENTS,BUCKETS,
  MAX_OBSERVATIONS
});
