#!/usr/bin/env node
'use strict';
// Read-only V93 review handoff report. No HTTP, SQL, Docker or writes.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {auditV93Review}=require('../server/v93-independent-review-audit.cjs');
const {STAGES}=require('../server/v91-evidence-audit.cjs');
const files=Object.freeze({
 packet:'docs/V93-PAQUETE-REVISION-INDEPENDIENTE.json',
 v91:'docs/V91-MATRIZ-COBERTURA-V67.json',
 v92:'docs/V92-PAQUETE-REVISION-OBSERVABILIDAD.json',
 canonical:'docs/V67-EVIDENCIAS-PENDIENTES.json'
});
const safe=x=>Object.hasOwn(files,x)?files[x]:null;
function main(args=process.argv.slice(2),write=x=>process.stdout.write(x),
 fileReader=fs){
 if(args.length>1||args.some(x=>x!=='--json')){
  write('V93 solo admite --json: auditoría documental sin permisos operativos\n');
  return 2;
 }
 try{
  const inputs={};
  for(const key of Object.keys(files)){
   inputs[key]=JSON.parse(fileReader.readFileSync(path.join(root,safe(key)),'utf8'));
  }
  const report=auditV93Review({
   ...inputs,sourceExists:relative=>{
    if(!Object.values(STAGES).includes(relative))return false;
    const stat=fileReader.lstatSync(path.join(root,relative));
    return stat.isFile()&&!stat.isSymbolicLink();
   }
  });
  write(JSON.stringify({
   report,
   note:'UNSIGNED REVIEW PACKAGE ONLY: no V67 PASS, no production approval.',
   workstreams:inputs.packet.workstreams.map(x=>({
    rank:x.rank,key:x.key,caseCount:x.ids.length,ids:x.ids,
    operationalAuthorization:x.approval,readiness:x.readiness
   }))
  },null,2)+'\n');
  return report.packetConsistent?0:1;
 }catch{
  write(JSON.stringify({version:'V93',packetConsistent:false,
   issueCodes:['V93_INPUT_NOT_READABLE_OR_INVALID'],
   formalV67Pending:32,formalV67Approved:0,decision:'NO_GO'})+'\n');
  return 1;
 }
}
if(require.main===module)process.exitCode=main();
module.exports={main};
