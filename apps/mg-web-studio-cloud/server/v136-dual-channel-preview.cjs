'use strict';

// V136 — a pure, offline review preview. NO networking, storage, queues, recipients,
// providers, scheduling, credentials, deployment, or actual notification delivery.
// The V96 observer is not an authoritative 5xx/429 source for a real ingress/proxy.
// Review-only output never authorizes, claims or attempts external delivery.
const CHANNELS=Object.freeze(['WHATSAPP_BUSINESS_PLATFORM','TRANSACTIONAL_EMAIL']);
const SIGNALS=Object.freeze({
  A1:Object.freeze({severity:'HIGH',message:'MG Digital Solutions: indicador HTTP 5xx por encima del umbral propuesto. Revisar el panel seguro cuando esté disponible.'}),
  A2:Object.freeze({severity:'MEDIUM',message:'MG Digital Solutions: indicador HTTP 429 por encima del umbral propuesto. Revisar el panel seguro cuando esté disponible.'})
});
const SNAPSHOT_KEYS=Object.freeze([
  'activeAlerts','candidateSignals','client4xx','correlationAvailable',
  'countedRequestEvents','intervalMinutes','limitations','missingTelemetryStatus',
  'notificationSent','overload503','persisted','proposedAlertStatus',
  'rateLimited429','redirect3xx','server5xx','success2xx','total','valid'
]);
const COUNTER_KEYS=Object.freeze(['total','countedRequestEvents','success2xx','redirect3xx',
  'client4xx','server5xx','rateLimited429','overload503']);
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(value))&&
  Object.keys(value).sort().join('|')===keys.slice().sort().join('|');
const count=n=>Number.isSafeInteger(n)&&n>=0;
function reviewSnapshot(input){
  try {
    if(!exact(input,SNAPSHOT_KEYS)||input.valid!==true||input.intervalMinutes!==5||
       input.persisted!==false||input.notificationSent!==false||
       input.activeAlerts!==false||input.correlationAvailable!==false||
       !COUNTER_KEYS.every(k=>count(input[k]))||
       typeof input.proposedAlertStatus!=='string'||
       input.proposedAlertStatus!=='DRY_RUN_ONLY_NO_OWNER_OR_DELIVERY'||
       input.missingTelemetryStatus!=='NOT_EVALUABLE_WITHOUT_INDEPENDENT_CONFIRMED_TRAFFIC'||
       typeof input.limitations!=='string'||
       !exact(input.candidateSignals,['A1','A2','A3'])||input.candidateSignals.A3!==null) return null;
    const n=input.total;
    if(n!==input.countedRequestEvents||
       n!==input.success2xx+input.redirect3xx+input.client4xx+input.server5xx||
       input.rateLimited429>input.client4xx||input.overload503>input.server5xx) return null;
    const a1=n>=20&&input.server5xx>=Math.ceil(n/20);
    const a2=n>=20&&input.rateLimited429>=Math.ceil(n/10);
    if(input.candidateSignals.A1!==a1||input.candidateSignals.A2!==a2)return null;
    return Object.freeze({A1:a1,A2:a2});
  }catch { return null; }
}
function createV136DualChannelPreview(snapshot) {
  const signals=reviewSnapshot(snapshot);
  const notifications=[];
  if(signals){
    for(const signalId of Object.keys(SIGNALS)){
      if(!signals[signalId])continue;
      const rule=SIGNALS[signalId];
      notifications.push(Object.freeze({
        signal:signalId,severity:rule.severity,text:rule.message,
        transports:Object.freeze(CHANNELS.map(channel=>Object.freeze({
          channel,status:'NOT_CONFIGURED_NOT_SENT'
        })))
      }));
    }
  }
  return Object.freeze({
    validInput:signals!==null,
    decision:'REVIEW_ONLY_NO_GO',
    deliveryAuthorized:false,
    notificationSent:false,
    persistentQueue:false,
    destinationsConfigured:false,
    deduplicationReady:false,
    escalationReady:false,
    signalA3:'NOT_EVALUABLE_WITHOUT_INDEPENDENT_CONFIRMED_TRAFFIC',
    notifications:Object.freeze(notifications)
  });
}
module.exports={createV136DualChannelPreview};
