#!/usr/bin/env node
'use strict';
// Local-files only; no network, SQL, GitHub writes, signatures, promotions or deploy.
const fs=require('node:fs');
const path=require('node:path');
const {audit}=require('../server/v95-evidence-crosswalk.cjs');
const docs=path.resolve(__dirname,'../docs');
const load=p=>JSON.parse(fs.readFileSync(path.join(docs,p),'utf8'));
function main(args=process.argv.slice(2),write=x=>process.stdout.write(x)){
 if(args.length!==1||args[0]!=='--json'){write('V95 usage: --json (offline only)\n');return 2;}
 try{
  const out=audit(
   load('V67-EVIDENCIAS-PENDIENTES.json'),
   load('V91-MATRIZ-COBERTURA-V67.json'),
   load('V93-PAQUETE-REVISION-INDEPENDIENTE.json'),
   load('V94-MANIFIESTO-DEPENDENCIAS-SIN-EJECUCION.json'),
   load('V95-TRAZABILIDAD-32-CONTROLES-V94B.json')
  );
  write(JSON.stringify({version:'V95',mode:'OFFLINE_READ_ONLY',...out},null,2)+'\n');
  return 0;
 }catch(e){
  write(JSON.stringify({version:'V95',valid:false,decision:'NO_GO',
    errorCode:String(e.message).startsWith('V95_AUDIT_BLOCKED_')?e.message:'V95_INPUT_OR_IO_ERROR'})+'\n');
  return 1;
 }
}
if(require.main===module)process.exitCode=main();
module.exports={main};
