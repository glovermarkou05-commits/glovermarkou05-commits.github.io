#!/usr/bin/env node
'use strict';
// Offline-only read of the canonical V67 controls. Never collects evidence,
// touches localhost/Internet, invokes Docker, installs, reads secrets or deploys.
const {createOperationalPacketV82,auditOperationalPacketV82}=
  require('../server/v67-operational-pack-v82.cjs');

function main(args=process.argv.slice(2),write=s=>process.stdout.write(s)){
  if(args.length===1&&args[0]==='--help'){
    write('V82 - Preparacion de 32 pruebas operativas V67 (SIN EJECUTARLAS)\n'+
      'Opciones: --summary (defecto), --json, --help\n');
    return 0;
  }
  if(args.length>1 || (args.length===1 &&
    !['--summary','--json'].includes(args[0]))){
    write('Argumento no permitido; use --help\n');
    return 2;
  }
  const p=createOperationalPacketV82();
  const result=auditOperationalPacketV82(p);
  if(args[0]==='--json'){
    write(JSON.stringify({packet:p,assessment:result},null,2)+'\n');
  } else {
    write('MG WEB STUDIO CLOUD V82 - PLAN V67 (SOLO LECTURA)\n');
    write('Entorno: SIN SELECCIONAR | Credenciales: NO EMITIDAS | Decision: NO_GO\n');
    for(const group of p.phases){
      write(group.id+' '+group.name+': '+group.ids.length+' casos PENDING\n');
      write('  '+group.ids.join(', ')+'\n');
    }
    write('TOTAL '+p.pendingTests+'/32 PENDING | '+p.passedOperationalTests+
      ' controles aprobados operativamente | '+result.decision+'\n');
    write('No ejecuta HTTP, SQL, restauracion, Docker, Supabase ni despliegues.\n');
  }
  return 0;
}
if(require.main===module)process.exitCode=main();
module.exports={main};
