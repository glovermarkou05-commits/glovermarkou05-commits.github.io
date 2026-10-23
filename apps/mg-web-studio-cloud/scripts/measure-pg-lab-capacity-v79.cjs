#!/usr/bin/env node
'use strict';
// Explicit local invocation only; no sockets, writes, shell execution or SQL.
const {collectLocalCapacityV79,MIN}=require('../server/lab-capacity-v79.cjs');
const HELP='MG WEB STUDIO CLOUD V79 — consulta local de recursos (solo lectura)\n'+
  'Ejecute: node scripts/measure-pg-lab-capacity-v79.cjs [--json | --help]\n'+
  'No instala, no abre puertos ni conecta a PostgreSQL/Supabase.\n'+
  'El resultado refleja UNICAMENTE el equipo en el que se ejecuta.\n';
function main(args=process.argv.slice(2),write=s=>process.stdout.write(s)) {
  if(args.length===1 && args[0]==='--help') {write(HELP);return 0;}
  if(args.length>1 || args.some(x=>x!=='--json')) {write(HELP);return 2;}
  const r=collectLocalCapacityV79();
  if(args[0]==='--json')write(JSON.stringify(r,null,2)+'\n');
  else {
    write('MG WEB STUDIO CLOUD V79 — Recursos locales, solo lectura\n');
    if(!r.measurementShapeValid)write('No se pudieron leer los recursos: '+r.issueCodes.join(', ')+'\n');
    else {
      const m=r.metrics;
      write('Sistema: '+m.platform+'; CPU disponibles: '+m.availableCpus+'\n');
      write('RAM total: '+m.totalMemoryGiB+' GiB; RAM libre ahora: '+m.availableMemoryGiB+' GiB\n');
      write('Espacio libre unidad de sistema: '+m.systemFreeGiB+' GiB\n');
      write('Espacio libre unidad del proyecto: '+m.workspaceFreeGiB+' GiB\n');
      write('Disco compartido: '+(m.sameDisk?'sí':'no')+'\n');
      write('Umbrales orientativos: '+JSON.stringify(MIN)+'\n');
      write('Recursos candidatos: '+(r.resourceThresholdsMet?'sí':'no')+'\n');
      if(r.issueCodes.length)write('Alertas: '+r.issueCodes.join(', ')+'\n');
    }
    write('Permisos para instalar/conectar/restaurar: NO CONCEDIDOS. Dictamen: NO_GO\n');
  }
  return r.measurementShapeValid?0:1;
}
if(require.main===module)process.exitCode=main();
module.exports={main};
