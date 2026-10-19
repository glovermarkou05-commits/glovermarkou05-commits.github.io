/* MG WEB STUDIO CLOUD — V16 — CHECKLIST DE PREPARACIÓN (NO AUTORIZA DESPLIEGUE)
 * Las casillas son declaraciones personales NO verificadas por servicios reales.
 * Este módulo NUNCA habilita producción ni confirma seguridad efectiva.
 */
(function(root){
"use strict";
const gates=Object.freeze([
 {id:"project",group:"infra",title:"Proyecto exclusivo y aislamiento",details:"Proyecto staging MG WEB STUDIO CLOUD nuevo, separado de FINZY, BAZAR y otros."},
 {id:"region",group:"infra",title:"Región, presupuesto y proveedor",details:"Aprobación explícita de costos, región y alcance antes de crear infraestructura."},
 {id:"auth",group:"security",title:"Autenticación y MFA reales",details:"Sesiones verificadas en servidor, MFA del SUPERADMIN y revocación funcional."},
 {id:"scopes",group:"security",title:"Permisos por organización y sitio",details:"OWNER/ADMIN/EDITOR/VIEWER comprobados contra datos autoritativos en servidor."},
 {id:"rls",group:"security",title:"GRANT y RLS configurados",details:"Esquema aislado, privilegios mínimos y RLS sin políticas amplias heredadas."},
 {id:"rlsqa",group:"security",title:"Pruebas reales de aislamiento",details:"Verificar cruce de tenants, dos sitios del mismo negocio y usuarios revocados."},
 {id:"migrations",group:"data",title:"Migraciones ensayadas en staging",details:"Migraciones versionadas, pruebas SQL, rollback y compatibilidad con datos."},
 {id:"transactions",group:"data",title:"Transacciones e idempotencia reales",details:"Operaciones PostgreSQL atómicas, reintentos, CAS y carreras entre procesos."},
 {id:"recovery",group:"data",title:"Respaldos y recuperación verificados",details:"Retención, cifrado, RPO/RTO y restauración ensayada sin exposición."},
 {id:"audit",group:"ops",title:"Auditoría y observabilidad",details:"Outbox transaccional, monitoreo de errores, alertas y minimización de datos."},
 {id:"privacy",group:"ops",title:"Privacidad y seguridad de contenido",details:"Control de acceso a archivos, formularios y datos personales, límites y retención."},
 {id:"browser",group:"ops",title:"QA de navegador y móvil",details:"Experiencia y accesibilidad comprobadas en navegadores y dispositivos reales."},
 {id:"publishing",group:"ops",title:"Publicación y reversión controladas",details:"DNS, certificados, control de dominios, autorización de publicación y rollback."},
 {id:"ai",group:"optional-ai",title:"IA real y presupuesto autorizados",details:"Proveedor, consentimiento, claves solo servidor, límites de uso y aprobación de borradores."}
]);
const IDs=new Set(gates.map(g=>g.id));
function assess(input){
 const entries=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
 const declarations=Object.keys(entries).filter(k=>IDs.has(k)&&entries[k]===true);
 const core=gates.filter(x=>x.group!=="optional-ai");
 const pendingCore=core.filter(x=>!declarations.includes(x.id));
 return {
  mode:"planning-only",authorized:false,verified:false,productionReady:false,
  coreTotal:core.length,coreDeclared:core.length-pendingCore.length,
  corePending:pendingCore.map(x=>x.id),aiDeclared:declarations.includes("ai"),
  items:gates.map(g=>({id:g.id,group:g.group,title:g.title,details:g.details,
   status:declarations.includes(g.id)?"Declarado por el usuario · NO VERIFICADO":"Pendiente de evidencia independiente"})),
  message:"Las marcas de este tablero son recordatorios personales; no autorizan infraestructura, despliegue ni conexión a IA."
 };
}
root.MGWebV16Readiness=Object.freeze({version:"16.0-planning",gates:gates.map(g=>({...g})),assess});
})(typeof window!=="undefined"?window:globalThis);
