/* MG WEB STUDIO CLOUD — V15 CONTRATO DE RECUPERACIÓN (SOLO SIMULADOR)
 * Verificación de snapshots ficticios, no backup cifrado ni restauración real.
 * Suma de verificación FNV para errores accidentales: NO es criptografía.
 * Nunca transportar datos reales por este mecanismo, ni confiar en él
 * para aceptar un archivo de usuario en un servidor.
 */
(function(root){
"use strict";
const VERSION="15.0-demo";
const keys=["proposals","revisions","reviews","drafts","notifications","outbox","operations"];
const states=["draft","submitted","needs_changes","rejected","approved","applied"];
const events=["submitted","approved","changes","rejected","applied"];
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const isId=v=>typeof v==="string"&&/^[a-z][a-z0-9_-]{0,63}$/.test(v);
const int=v=>Number.isSafeInteger(v)&&v>=0;
const err=(message)=>({ok:false,error:message});
const canonical=x=>Array.isArray(x)?x.map(canonical):obj(x)?
 Object.keys(x).sort().reduce((o,k)=>{o[k]=canonical(x[k]);return o;},{}):x;
function fingerprint(input){
 const source=JSON.stringify(canonical(input));let hash=2166136261;
 for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return (hash>>>0).toString(16).padStart(8,"0");
}
function validateSnapshot(state,directory){
 if(!obj(state)||!obj(directory)||!Array.isArray(directory.organizations)||
  !Array.isArray(directory.sites)||!Array.isArray(directory.members)||!Array.isArray(directory.staff)||
  !keys.every(k=>Array.isArray(state[k]))||!obj(state.counter)||
  !["proposal","notification","event"].every(k=>int(state.counter[k])))
  return err("La estructura de snapshot/directorio no es válida.");
 const str=JSON.stringify(state);
 if(str.length>350000)return err("El snapshot supera el límite de prueba.");
 const sites=new Map(directory.sites.map(s=>[s.clientId+"/"+s.id,s]));
 const orgs=new Map(directory.organizations.map(o=>[o.id,o]));
 const proposals=new Map(),drafts=new Set(),notices=new Set(),outbox=new Set(),ops=new Set(),revisionKeys=new Set(),reviewKeys=new Set();
 let proposalMax=0,noticeMax=0,eventMax=0;
 for(const d of state.drafts){
  if(!obj(d)||!sites.has(d.clientId+"/"+d.siteId)||!int(d.version)||d.version<1||
    !int(d.publishedCount)||!Array.isArray(d.pages)||!d.pages.length ||
    !d.pages.some(p=>obj(p)&&p.slug==="")||
    d.pages.some(p=>!obj(p)||typeof p.slug!=="string")||
    new Set(d.pages.map(p=>p.slug)).size!==d.pages.length ||
    drafts.has(d.clientId+"/"+d.siteId))return err("Borrador inconsistente o duplicado.");
  drafts.add(d.clientId+"/"+d.siteId);
 }
 for(const p of state.proposals){
  if(!obj(p)||!/^p[1-9]\d*$/.test(p.id)||!isId(p.clientId)||!isId(p.siteId)||
    !sites.has(p.clientId+"/"+p.siteId)||!orgs.has(p.clientId)||
    !["Start","Crece","Pro"].includes(p.plan)||!int(p.revision)||p.revision<1||
    !states.includes(p.status)||proposals.has(p.id)||!obj(p.proposal)||
    p.proposal.plan!==p.plan||!Array.isArray(p.proposal.pages)||!Array.isArray(p.history)||
    (p.appliedDraftVersion!==null&&(!int(p.appliedDraftVersion)||p.appliedDraftVersion<2)))
    return err("Registro de propuesta inválido.");
  if(p.status==="applied"&&p.appliedDraftVersion===null)return err("Propuesta aplicada sin versión del borrador.");
  if(p.status!=="applied"&&p.appliedDraftVersion!==null)return err("Propuesta no aplicada con versión de aplicación.");
  proposalMax=Math.max(proposalMax,Number(p.id.slice(1)));proposals.set(p.id,p);
 }
 for(const d of state.drafts){
  if(state.proposals.some(p=>p.clientId===d.clientId&&p.siteId===d.siteId&&
    p.status==="applied"&&p.appliedDraftVersion>d.version))return err("Versión aplicada excede versión del borrador.");
 }
 for(const r of state.revisions){
  const p=proposals.get(r.proposalId),key=r.proposalId+"/"+r.revision;
  if(!obj(r)||!p||!int(r.revision)||r.revision<1||r.revision>p.revision||
    !obj(r.proposal)||r.proposal.plan!==p.plan||!isId(r.author)||revisionKeys.has(key))
    return err("Revisión de propuesta sin referencia válida.");
  revisionKeys.add(key);
 }
 for(const p of state.proposals){
  if(!revisionKeys.has(p.id+"/"+p.revision))return err("La propuesta apunta a revisión inexistente.");
  const latest=state.revisions.find(r=>r.proposalId===p.id&&r.revision===p.revision);
  if(fingerprint(latest.proposal)!==fingerprint(p.proposal))return err("El documento actual no coincide con su revisión.");
  for(let i=1;i<=p.revision;i++)if(!revisionKeys.has(p.id+"/"+i))return err("Falta una revisión intermedia.");
 }
 for(const r of state.reviews){
  const p=proposals.get(r.proposalId),key=r.proposalId+"/"+r.revision;
  if(!obj(r)||!p||!revisionKeys.has(key)||reviewKeys.has(key)||
    !events.includes(r.decision)||!["approved","changes","rejected"].includes(r.decision)||
    !isId(r.reviewer)||typeof r.note!=="string"||r.note.length>500||
    (r.decision!=="approved"&&r.note.trim().length<8))
   return err("Decisión inválida o duplicada.");
  reviewKeys.add(key);
 }
 for(const n of state.notifications){
  const p=proposals.get(n.proposalId),number=String(n.id||"").match(/^n([1-9]\d*)$/);
  if(!obj(n)||!number||!p||!sites.has(n.clientId+"/"+n.siteId)||
    p.clientId!==n.clientId||p.siteId!==n.siteId||
    !int(n.revision)||n.revision<1||n.revision>p.revision||
    !events.includes(n.kind)||!isId(n.recipientId)||!["client","staff"].includes(n.recipientKind)||
    typeof n.read!=="boolean"||!int(n.sequence)||notices.has(n.id))
   return err("Notificación inválida o duplicada.");
  noticeMax=Math.max(noticeMax,Number(number[1]));eventMax=Math.max(eventMax,n.sequence);
  notices.add(n.id);
 }
 for(const x of state.outbox){
  const p=proposals.get(x.proposalId),number=String(x.id||"").match(/^e([1-9]\d*)$/);
  if(!obj(x)||!number||!p||x.clientId!==p.clientId||x.siteId!==p.siteId||
    !int(x.revision)||x.revision<1||x.revision>p.revision||
    !events.includes(x.type)||typeof x.dispatched!=="boolean"||outbox.has(x.id))
    return err("Evento outbox inválido o duplicado.");
  eventMax=Math.max(eventMax,Number(number[1]));outbox.add(x.id);
 }
 for(const op of state.operations){
  const key=[op.organization,op.actorId,op.key].join("/");
  if(!obj(op)||!isId(op.organization)||!orgs.has(op.organization)||
    !isId(op.actorId)||typeof op.key!=="string"||op.key.length<8||
    !obj(op.request)||!obj(op.response)||!int(op.response.status)||
    op.response.status<200||op.response.status>=300||ops.has(key))
    return err("Registro de idempotencia inválido o duplicado.");
  ops.add(key);
 }
 if(state.counter.proposal<proposalMax||state.counter.notification<noticeMax||
  state.counter.event<eventMax)return err("Contadores regresivos: riesgo de colisión de IDs.");
 return {ok:true,summary:{proposals:state.proposals.length,revisions:state.revisions.length,
  reviews:state.reviews.length,drafts:state.drafts.length,notifications:state.notifications.length,
  outbox:state.outbox.length,operations:state.operations.length}};
}
function makeCheckpoint(state,directory){
 const valid=validateSnapshot(state,directory);if(!valid.ok)return valid;
 const frozen=JSON.parse(JSON.stringify(state));
 return {ok:true,checkpoint:{format:"mg-web-studio/v15-memory-checkpoint",
  state:frozen,checksum:fingerprint(frozen),note:"Solo prueba. No es backup real ni firma."},summary:valid.summary};
}
function inspectCheckpoint(checkpoint,directory){
 if(!obj(checkpoint)||checkpoint.format!=="mg-web-studio/v15-memory-checkpoint"||
  !obj(checkpoint.state)||typeof checkpoint.checksum!=="string"||
  !/^[0-9a-f]{8}$/.test(checkpoint.checksum))return err("Formato de checkpoint inválido.");
 if(fingerprint(checkpoint.state)!==checkpoint.checksum)
  return err("No coincide el checksum NO criptográfico. Snapshot modificado o dañado.");
 return validateSnapshot(checkpoint.state,directory);
}
root.MGWebV15Recovery=Object.freeze({version:VERSION,mode:"offline-test-only",
 fingerprint,validateSnapshot,makeCheckpoint,inspectCheckpoint});
})(typeof window!=="undefined"?window:globalThis);
