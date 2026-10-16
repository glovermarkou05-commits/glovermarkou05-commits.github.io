/* MG WEB STUDIO CLOUD — Revisiones de propuestas V11 (simulación local)
 * No es firma, autenticación, integridad criptográfica ni consentimiento legal.
 * Los paquetes y las respuestas JSON son EDITABLES y se intercambian manualmente.
 */
(function(root){
"use strict";
const FORMAT="mg-web-studio-review/v11-demo-1";
const DECISIONS={approved:"Aprobada (demo)",changes:"Cambios solicitados (demo)",rejected:"Rechazada (demo)"};
const PLAN={Start:true,Crece:true,Pro:true};
const validId=x=>typeof x==="string"&&/^[a-z][a-z0-9_-]{0,63}$/.test(x);
const validRevision=x=>Number.isSafeInteger(x)&&x>=1&&x<=1000000;
const obj=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const copy=x=>JSON.parse(JSON.stringify(x));
const fail=error=>({ok:false,error});
function fingerprint(proposal){
 if(!obj(proposal)||!Array.isArray(proposal.pages))return null;
 const str=JSON.stringify(proposal);
 // FNV1a 32: detecta diferencias accidentales, NO es firma ni protección.
 let hash=2166136261;
 for(let i=0;i<str.length;i++){hash^=str.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return ("00000000"+(hash>>>0).toString(16)).slice(-8);
}
function contextOK(x){return obj(x)&&validId(x.clientId)&&validId(x.siteId)&&PLAN[x.plan]===true;}
function proposalMetadata(proposal,revision){
 if(!validRevision(revision))return fail("Revisión de propuesta inválida.");
 const digest=fingerprint(proposal);
 if(!digest)return fail("Documento de propuesta inválido.");
 return {ok:true,review:{revision,fingerprint:digest,mode:"local-checksum-not-signature"}};
}
function readProposalMetadata(json,proposal){
 if(typeof json!=="string"||json.length>40000)return fail("Paquete demasiado grande.");
 let packet;
 try{packet=JSON.parse(json);}catch(e){return fail("El paquete no contiene JSON.");}
 if(!obj(packet))return fail("Paquete inválido.");
 if(packet.review===undefined){
  // Compatibilidad con V10, también exige revisión en el portal.
  const fallback=proposalMetadata(proposal,1);
  return fallback.ok?{ok:true,review:{...fallback.review,legacy:true}}:fallback;
 }
 const r=packet.review;
 if(!obj(r)||!validRevision(r.revision)||r.mode!=="local-checksum-not-signature"||
    typeof r.fingerprint!=="string"||r.fingerprint!==fingerprint(proposal))
  return fail("Revisión inválida o contenidos modificados respecto al resumen.");
 return {ok:true,review:copy(r)};
}
function packReview(args){
 if(!obj(args)||!contextOK(args.target)||!validRevision(args.revision)||
    !Object.hasOwn(DECISIONS,args.decision))return fail("Contexto, revisión o decisión inválidos.");
 const note=String(args.note||"").trim();
 if(note.length>500||/[<>]|[\u0000-\u001f]/.test(note)||
    ((args.decision==="changes"||args.decision==="rejected")&&note.length<8))
  return fail("Incluye una observación ficticia de 8 a 500 caracteres para solicitar cambios o rechazar.");
 const digest=fingerprint(args.proposal);
 if(!digest)return fail("Propuesta inválida.");
 const packet={format:FORMAT,target:copy(args.target),revision:args.revision,fingerprint:digest,
  decision:args.decision,note,source:"client-review-demo"};
 const json=JSON.stringify(packet,null,2);
 return json.length>5000?fail("Respuesta demasiado extensa."):{ok:true,json,packet};
}
function readReview(json,expected){
 if(typeof json!=="string"||json.length<50||json.length>5000)return fail("Tamaño del dictamen incorrecto.");
 let packet;
 try{packet=JSON.parse(json);}catch(e){return fail("La respuesta no es JSON válido.");}
 if(!obj(packet)||packet.format!==FORMAT||packet.source!=="client-review-demo"||
    !contextOK(packet.target)||!obj(expected)||!contextOK(expected.target)||
    !validRevision(packet.revision)||packet.revision!==expected.revision||
    packet.target.clientId!==expected.target.clientId||
    packet.target.siteId!==expected.target.siteId||
    packet.target.plan!==expected.target.plan||!Object.hasOwn(DECISIONS,packet.decision)||
    packet.fingerprint!==fingerprint(expected.proposal))
  return fail("La respuesta corresponde a otro sitio, versión o propuesta.");
 const note=packet.note;
 if(typeof note!=="string"||note.length>500||/[<>]|[\u0000-\u001f]/.test(note)||
   ((packet.decision==="changes"||packet.decision==="rejected")&&note.trim().length<8))
  return fail("Observación de revisión inválida.");
 return {ok:true,review:{revision:packet.revision,fingerprint:packet.fingerprint,
  decision:packet.decision,label:DECISIONS[packet.decision],note:note.trim()}};
}
root.MGWebProposalReview=Object.freeze({version:"11.0-demo",format:FORMAT,
 decisions:copy(DECISIONS),fingerprint,proposalMetadata,readProposalMetadata,packReview,readReview});
})(typeof window!=="undefined"?window:globalThis);
