#!/usr/bin/env node
'use strict';
// Read-only inventory reconciliation. Cannot alter canonical V67, authorize a
// service, publish, connect to a DB or validate real operational ownership.
const fs=require('node:fs');
const path=require('node:path');
const {auditV91Coverage,STAGES}=require('../server/v91-evidence-audit.cjs');
const ROOT=path.resolve(__dirname,'..');
const SOURCE='docs/V91-MATRIZ-COBERTURA-V67.json';
const CANONICAL='docs/V67-EVIDENCIAS-PENDIENTES.json';
function main(args=process.argv.slice(2),write=x=>process.stdout.write(x),read=fs){
 if(args.length>1||args.some(x=>x!=='--json')){
  write('V91: solo --json, sin acciones operativas\n');return 2;
 }
 try{
  const manifest=JSON.parse(read.readFileSync(path.join(ROOT,SOURCE),'utf8'));
  const canonical=JSON.parse(read.readFileSync(path.join(ROOT,CANONICAL),'utf8'));
  const result=auditV91Coverage({
   manifest,canonical,sourceExists:rel=>{
    if(!Object.values(STAGES).includes(rel))return false;
    const info=read.lstatSync(path.join(ROOT,rel));
    return info.isFile()&&!info.isSymbolicLink();
   }
  });
  const lines=manifest.controls.map(item=>({
   id:item.id,classification:item.coverage,evidenceStages:item.sourceStages,
   formal:'PENDING',remaining:item.missing
  }));
  write(JSON.stringify({assessment:result,
   note:'Laboratory observations are NOT independently approved V67 PASS results.',
   controls:lines},null,2)+'\n');
  return result.documentationConsistent?0:1;
 }catch{
  write(JSON.stringify({
   version:'V91',documentationConsistent:false,issueCodes:['V91_AUDIT_INPUT_INVALID'],
   formalPending:32,formalIndependentPass:0,decision:'NO_GO'
  })+'\n');
  return 1;
 }
}
if(require.main===module)process.exitCode=main();
module.exports={main};
