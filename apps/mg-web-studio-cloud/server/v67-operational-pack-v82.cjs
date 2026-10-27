'use strict';

// V82 is an OFFLINE manual-operational test handover packet, NOT a runner.
// No network, database, Docker, filesystem, subprocesses, secrets or credentials.
// All tests remain PENDING. Approval to prepare is NOT approval to execute.
const {createV67Checklist}=require('./security-acceptance-v67.cjs');
const {APPROVAL_NAMES}=(()=>({APPROVAL_NAMES:['database','network','sqlRead',
  'tenantFixtures','restore','production']}))();

const SPEC=Object.freeze({
  'HTTP-01':['network','Send legitimate GET to authorized isolated ingress','Redacted HTTP status, public fields, response safety headers and timestamp'],
  'HTTP-02':['network','Send two differently cased Authorization headers in isolated ingress','Parser rejection and application auth not called'],
  'HTTP-03':['network','Send conflicting repeated Content-Length headers','Parser rejection, no request handler entry'],
  'HTTP-04':['network','Send conflicting Transfer-Encoding and Content-Length','Parser rejection, ingress/backend framing consistent'],
  'HTTP-05':['network','Submit invalid header token/control byte to isolated ingress','Safe rejection and sanitized diagnostic'],
  'HTTP-06':['network','Submit header larger than configured parser and proxy limit','Bounded refusal or closure; no upstream handling'],
  'HTTP-07':['network','Test missing and duplicated HTTP/1.1 Host headers','Ingress rejection and no authority bypass'],
  'HTTP-08':['network','Test encoded path, unexpected query/fragment and absolute-form target','No privileged routing; safe status or closure'],
  'HTTP-09':['network','Submit GET with body and disallowed transfer framing','Safe 400/413 or documented closure; no auth invocation'],
  'HTTP-10':['network','Bound slow-header and half-open requests within approved time limits','Timeout, bounded open sockets and normal service recovery'],
  'HTTP-11':['network','Test Expect 100-continue on forbidden route','Rejection without interim authorization or sensitive body read'],
  'HTTP-12':['network','Try CONNECT and Upgrade on approved test endpoint','No tunnel, WebSocket or unauthorized route'],
  'HTTP-13':['network','Submit malformed request-line and parser syntax','Generic errors, no reflected raw input or stack'],
  'HTTP-14':['network','Spoof forwarding headers through trusted test proxy','Only trusted ingress identity controls admission'],
  'LOAD-01':['network','Generate approved bounded simultaneous requests','Measured in-flight cap, 503 when saturated and later recovery'],
  'LOAD-02':['network','Generate repeat requests from scoped test peers','Measured 429 budget, bounded Retry-After and no bypass'],
  'LOAD-03':['network','Measure connections, memory and queue during bounded traffic','No uncontrolled sockets, SQL jobs, process memory or backlog'],
  'OBS-01':['review','Review sampled sanitized log events for sensitive strings','No tokens, identities, IP, body, SQL or credentials'],
  'OBS-02':['review','Trace an approved test denial across service layers','Safe request correlation, no sensitive values'],
  'OBS-03':['review','Inspect retention, access, encryption and secure deletion policy','Named reviewer and signed retention/access decisions'],
  'OBS-04':['review','Inspect incident response owner and thresholds','Alert criteria, escalation owner and approved runbook'],
  'AUTH-01':['network','Use dedicated test identities for signed JWT expiry and revocation','Issuer, audience, expiry and session revocation independently checked'],
  'AUTH-02':['tenantFixtures','Exercise two synthetic tenants and site scopes under test identities','Forbidden cross-tenant and site reads/writes denied'],
  'AUTH-03':['tenantFixtures','Exercise staff elevation and MFA with synthetic accounts','Server-validated MFA claims; no client-defined privilege'],
  'DATA-01':['sqlRead','Review grants and effective RLS using lab-only roles','Role/grant/RLS evidence, no service role exposure'],
  'DATA-02':['database','Exercise bounded test transaction and cancellation semantics','No stale writes, leaked jobs or cross-tenant changes'],
  'REC-01':['restore','Restore approved sanitized PG17 snapshot to an isolated target','Destination isolation, restore result and no staging/production writes'],
  'REC-02':['restore','Compare synthetic source and recovered target catalogs','Schemas, row counts, indexes, grants and policies reconciled'],
  'REC-03':['restore','Run V53 security contracts against isolated restored copy','Reproducible output with failures and environment declared'],
  'REC-04':['restore','Measure isolated restore times and review backup protection','Measured RPO/RTO, retention, encryption and owner review'],
  'OPS-01':['network','Obtain lab interface, TLS, port and firewall authorization before any listener','Distinct signed approval and declared scope/expiration'],
  'OPS-02':['production','Obtain production window and rollback review separately','Explicit signed production change plan; NOT deployment permission']
});
const PHASES=Object.freeze([
  {id:'G0',name:'Autorizar entorno y preservar proyectos',ids:['OPS-01','OPS-02']},
  {id:'G1',name:'Revisar politica operativa sin red',ids:['OBS-01','OBS-02','OBS-03','OBS-04']},
  {id:'G2',name:'Validar HTTP en ingress aislado',ids:Array.from({length:14},(_,i)=>'HTTP-'+String(i+1).padStart(2,'0'))},
  {id:'G3',name:'Ejecutar carga estrictamente acotada',ids:['LOAD-01','LOAD-02','LOAD-03']},
  {id:'G4',name:'Validar autenticacion y autorizacion multiempresa',ids:['AUTH-01','AUTH-02','AUTH-03']},
  {id:'G5',name:'Verificar roles, RLS y transacciones',ids:['DATA-01','DATA-02']},
  {id:'G6',name:'Ensayar restauracion aislada y recuperacion',ids:['REC-01','REC-02','REC-03','REC-04']}
]);
const freezeDeep=o=>{
  if(o && typeof o==='object'){
    for(const v of Object.values(o))freezeDeep(v);
    Object.freeze(o);
  }
  return o;
};
function createOperationalPacketV82(){
  const catalog=createV67Checklist().tests;
  const ids=catalog.map(c=>c.id);
  if(ids.length!==32 || Object.keys(SPEC).length!==32 ||
    ids.some(id=>!Object.hasOwn(SPEC,id)))throw Error('V67 control catalog changed');
  const phases=PHASES.map(p=>({...p,ids:[...p.ids]}));
  if(phases.flatMap(p=>p.ids).length!==32 ||
    new Set(phases.flatMap(p=>p.ids)).size!==32 ||
    phases.flatMap(p=>p.ids).some(id=>!ids.includes(id)))
    throw Error('V82 phase mapping incomplete');
  const tests=catalog.map(c=>{
    const [gate,operatorInstruction,evidenceToCollect]=SPEC[c.id];
    return {id:c.id,group:c.group,evidenceType:c.evidenceType,
      description:c.description,expected:c.expected,
      phase:phases.find(p=>p.ids.includes(c.id)).id,
      requiredSeparateApproval:gate,operatorInstruction,evidenceToCollect,
      execution:'MANUAL_ONLY_AFTER_AUTHORIZATION',
      status:'PENDING',evidenceRef:null,reviewer:null};
  });
  return freezeDeep({
    version:'V82',sourceCatalog:'V67',purpose:'ISOLATED_OPERATIONAL_EVIDENCE_PREPARATION',
    executionEnvironment:'UNSELECTED',allowedData:'SYNTHETIC_ONLY',
    approvals:Object.fromEntries(APPROVAL_NAMES.map(n=>[n,'PENDING'])),
    hostCapacityIndependentlyCleared:false,bazarContainerProtected:true,
    labCredentialsIssued:false,networkAccessPerformed:false,
    sqlExecuted:false,restorePerformed:false,productionModified:false,
    evidenceIndependentlyVerified:false,tests,phases,
    totalTests:32,pendingTests:32,passedOperationalTests:0,decision:'NO_GO'
  });
}
function auditOperationalPacketV82(candidate){
  // Equality with the fully fixed inventory is intentional: this stage
  // CANNOT accept user-supplied PASS, IDs, refs or approvals as verified.
  const expected=createOperationalPacketV82();
  let intact=false;
  try{
    const isPlain=o=>o===null||(typeof o==='object'&&!Array.isArray(o)&&
       [Object.prototype,null].includes(Object.getPrototypeOf(o)));
    const eq=(a,b)=>{
      if(a===b)return true;
      if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
      if(Array.isArray(a)!==Array.isArray(b))return false;
      if(!Array.isArray(a)&&(!isPlain(a)||!isPlain(b)))return false;
      const ak=Object.keys(a),bk=Object.keys(b);
      return ak.length===bk.length && bk.every(k=>Object.hasOwn(a,k)&&eq(a[k],b[k]));
    };
    intact=eq(candidate,expected);
  }catch{intact=false;}
  return Object.freeze({packetUnmodified:intact,
    issueCodes:Object.freeze(intact?[]:['V82_PACKET_CHANGED_OR_UNTRUSTED']),
    source:'OFFLINE_ONLY',liveTestsRun:0,verifiedPasses:0,
    v67Pending:32,networkAuthorized:false,databaseAuthorized:false,
    restoreAuthorized:false,productionAuthorized:false,decision:'NO_GO'});
}
module.exports={createOperationalPacketV82,auditOperationalPacketV82};
