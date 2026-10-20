"use strict";
/* V43: OFFLINE / GITHUB-ONLY PRE-SQL AUTHORIZATION REVIEW.
 * NO database access, migrations, network, writes, or credentials.
 * Runs with built-in Node fs/path only. Exit code 2 = valid packet but NO GO.
 */
const fs=require("node:fs"),path=require("node:path");
const BASE=path.join(__dirname,"..");
const FILES=Object.freeze({
 manifest:"staging/v43-approval-package.review.json",
 ddl:"db/v42-drafts/INSTALL_ATOMIC.review.sql.txt",
 catalog:"db/v43-drafts/CATALOG_ONLY_SELECT.review.sql.txt",
 prior:"staging/v42-review-manifest.json",
 snapshot:"staging/v39-initial-readonly-inventory.review.json"
});
function utf8Bytes(source) {
 const out=[];
 for(const char of source) {
  const c=char.codePointAt(0);
  if(c<128)out.push(c);
  else if(c<2048)out.push(192|(c>>6),128|(c&63));
  else if(c<65536)out.push(224|(c>>12),128|((c>>6)&63),128|(c&63));
  else out.push(240|(c>>18),128|((c>>12)&63),128|((c>>6)&63),128|(c&63));
 }
 return out;
}
const rot=(x,k)=>(x<<k)|(x>>>(32-k));
function sha1bytes(msg){
 const data=msg.slice(),bitLength=msg.length*8;
 data.push(128);
 while(data.length%64!==56)data.push(0);
 // Inputs are small review files. Still encode the full 64-bit length.
 const high=Math.floor(bitLength/4294967296),low=bitLength>>>0;
 for(const n of [high,low])for(let i=3;i>=0;i--)data.push((n>>>(i*8))&255);
 let h0=0x67452301,h1=0xefcdab89,h2=0x98badcfe,h3=0x10325476,h4=0xc3d2e1f0;
 for(let offset=0;offset<data.length;offset+=64){
  const w=new Array(80);
  for(let t=0;t<16;t++){const i=offset+t*4;w[t]=
   ((data[i]<<24)|(data[i+1]<<16)|(data[i+2]<<8)|data[i+3])>>>0}
  for(let t=16;t<80;t++)w[t]=rot(w[t-3]^w[t-8]^w[t-14]^w[t-16],1)>>>0;
  let a=h0,b=h1,c=h2,d=h3,e=h4;
  for(let t=0;t<80;t++){
   let f,k;
   if(t<20){f=(b&c)|(~b&d);k=0x5a827999}
   else if(t<40){f=b^c^d;k=0x6ed9eba1}
   else if(t<60){f=(b&c)|(b&d)|(c&d);k=0x8f1bbcdc}
   else{f=b^c^d;k=0xca62c1d6}
   const temp=(rot(a,5)+f+e+k+w[t])>>>0;
   e=d;d=c;c=rot(b,30)>>>0;b=a;a=temp;
  }
  h0=(h0+a)>>>0;h1=(h1+b)>>>0;h2=(h2+c)>>>0;
  h3=(h3+d)>>>0;h4=(h4+e)>>>0;
 }
 return [h0,h1,h2,h3,h4].map(n=>n.toString(16).padStart(8,"0")).join("");
}
function gitBlobSha(source){
 const bytes=utf8Bytes(source);
 const header=utf8Bytes("blob "+bytes.length+"\0");
 return sha1bytes(header.concat(bytes));
}
const plain=x=>!!x&&typeof x==="object"&&!Array.isArray(x);
const uniq=a=>Array.isArray(a)&&new Set(a).size===a.length;
function readFiles(reader){
 const load=typeof reader==="function"?reader:p=>fs.readFileSync(path.join(BASE,p),"utf8");
 const f={};for(const [name,p] of Object.entries(FILES)){
  const raw=load(p);f[name]=["manifest","prior","snapshot"].includes(name)?JSON.parse(raw):raw;
 }return f;
}
function result(errors={},additional={}){
 return {version:43,mode:"offline-review-only",valid:errors.length===0,issues:errors,
 decision:"NO_GO",catalogSqlExecuted:0,ddlExecuted:0,restoreTests:0,
 mayRunCatalogSql:false,mayApplyDDL:false,mayDeploy:false,mayPublish:false,
 stagingSqlReady:false,productionReady:false,...additional};
}
function clean(sql){return sql.replace(/\/\*[\s\S]*?\*\//g,"").replace(/--[^\n]*/g,"")}
function assess(input){
 const issues=[],flag=s=>{if(!issues.includes(s))issues.push(s)};
 if(!plain(input)||Object.keys(FILES).some(k=>!(k in input))){
  flag("INPUT_MISSING");return result(issues);
 }
 const m=input.manifest;
 if(!plain(m)||m.format!=="mg-web-studio/v43-sql-approval-review"||
 m.version!==43||m.project!=="MG WEB STUDIO CLOUD"||
 m.branch!=="feature/mg-digital-v5-web-services"||
 m.mode!=="GITHUB_ONLY_PREAUTHORIZATION"||
 m.target!=="MG WEB STUDIO CLOUD - STAGING")
 flag("IDENTITY_DRIFT");
 const auth=m&&m.authorizationBoundaries;
 if(!plain(auth)||auth.githubDraftReview!==true||
  Object.entries(auth).length!==10||
  Object.entries(auth).some(([k,v])=>k==="githubDraftReview"?v!==true:v!==false))
 flag("PERMISSION_BOUNDARY_BROKEN");
 const ds=m&&m.source;
 if(!plain(ds)||!plain(ds.ddl)||!plain(ds.catalogReadOnly)||
 ds.ddl.path!==FILES.ddl||ds.catalogReadOnly.path!==FILES.catalog||
 ![ds.ddl,ds.catalogReadOnly].every(x=>/^[a-f0-9]{40}$/.test(x.githubBlobSha)&&x.chars>500))
 flag("SOURCE_PIN_MISSING");
 if(typeof input.ddl!=="string"||!ds||ds.ddl.githubBlobSha!==gitBlobSha(input.ddl)||
  ds.ddl.chars!==input.ddl.length)flag("DDL_BLOB_CHANGED");
 if(typeof input.catalog!=="string"||!ds||ds.catalogReadOnly.githubBlobSha!==gitBlobSha(input.catalog)||
  ds.catalogReadOnly.chars!==input.catalog.length)flag("CATALOG_BLOB_CHANGED");
 const p=m&&m.scope;
 if(!plain(p)||p.catalogOperations!==7||
  p.catalogTransaction!=="REPEATABLE READ READ ONLY; ROLLBACK"||
  p.ddlExpectedTables!==16||p.ddlExpectedRlsEnable!==16||
  p.ddlExpectedSelectPolicies!==12||p.ddlSourceContainsActiveSql!==true||
  p.ddlRunAttempts!==0||p.catalogRunAttempts!==0||
  p.targetIdPublicGitHubRedacted!==true)
 flag("SCOPE_CHANGED");
 const cat=typeof input.catalog==="string"?clean(input.catalog):"";
 const stmts=cat.split(";").map(s=>s.trim()).filter(Boolean);
 if(stmts.length!==9||
 !/^BEGIN\s+TRANSACTION\s+ISOLATION\s+LEVEL\s+REPEATABLE\s+READ\s+READ\s+ONLY$/i.test(stmts[0])||
 !/^ROLLBACK$/i.test(stmts[stmts.length-1])||
 stmts.slice(1,-1).some(s=>!/^SELECT\b/i.test(s))||
 !cat.includes("pg_catalog.pg_default_acl")||
 !cat.includes("pg_catalog.pg_roles")||
 !cat.includes("pg_catalog.pg_class")||
 !cat.includes("information_schema.tables")||
 /(?:\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bCREATE\b|\bALTER\b|\bGRANT\b|\bREVOKE\b|\bDO\b|\bEXECUTE\b|\bCALL\b|\bCOPY\b|\bTRUNCATE\b|\bCOMMIT\b)/i.test(cat))
 flag("UNSAFE_CATALOG_SQL");
 const ddl=typeof input.ddl==="string"?clean(input.ddl):"";
 const n=(regexp)=>[...ddl.matchAll(regexp)].length;
 if(n(/\bBEGIN\s*;/gi)!==1||n(/\bCOMMIT\s*;/gi)!==1||
 n(/\bCREATE\s+TABLE\b/gi)!==16||
 n(/ENABLE\s+ROW\s+LEVEL\s+SECURITY\b/gi)!==16||
 n(/\bCREATE\s+POLICY\b/gi)!==12||
 n(/\bALTER\s+DEFAULT\s+PRIVILEGES\b/gi)!==4||
 !ddl.includes("mg_v42_outbox_business_key")||
 !ddl.includes("mg_v42_notification_event_recipient_key")||
 !ddl.includes("'draft','review','suspended'"))
 flag("DDL_CONTRACT_DRIFT");
 if(!Array.isArray(m&&m.reviewItems)||m.reviewItems.length!==10||
 !uniq(m.reviewItems.map(x=>x&&x.id))||
 !m.reviewItems.every(x=>x.status==="PENDING_REAL_CATALOG"||
 x.status==="PENDING_HUMAN_SIGNOFF"||x.status==="PENDING_REAL_QA"||
 x.status==="NOT_AUTHORIZED"||x.status==="PENDING_BACKEND"||
 x.status==="BLOCKED_BY_DEFAULT"))
 flag("GATES_NOT_PENDING");
 const owner=m&&m.ownerDecision;
 if(!plain(owner)||Object.keys(owner).length!==8||
  Object.values(owner).some(x=>x!==null))
 flag("APPROVAL_FORGED");
 const evidence=m&&m.realEvidence;
 if(!plain(evidence)||evidence.projectExistencePreviouslyChecked!==true||
  evidence.allSchemasVerifiedEmpty!==false||
  ["roleOwnersVerified","defaultAclVerified","backupCreated","restoreTested",
  "postgresParserTested","rlsRolesTested","backendPublished"].some(k=>evidence[k]!==false)||
  evidence.readOnlySQLQueriesRun!==0||evidence.ddlStatementsRun!==0)
 flag("REAL_EVIDENCE_FABRICATED");
 const d=m&&m.decision;
 if(!plain(d)||d.reviewPackageReady!==true||
  d.catalogSQLReadyToRun!==false||d.ddlReadyToRun!==false||
  d.backendReady!==false||d.productionGo!==false)
 flag("RELEASE_GATE_FORGED");
 const old=input.prior,base=input.snapshot;
 if(!plain(old)||old.version!==42||old.status!=="NO_GO"||
 old.authorization?.sql!==false||old.sqlExecuted!==0||
 !plain(base)||base.version!==39||base.approvalBoundary?.executeSQLApproved!==false||
 base.counts?.publicTables!==0||base.counts?.migrations!==0)
 flag("SOURCE_BASELINE_INVALID");
 return result(issues,{sourceShaVerified:!issues.includes("DDL_BLOB_CHANGED")&&!issues.includes("CATALOG_BLOB_CHANGED"),
  catalogStatements:7,approvalQuestionsOpen:8,mandatoryOperationalRemaining:8});
}
function output(r){
 return [
 "MG WEB STUDIO CLOUD V43 — DIAGNÓSTICO / PAQUETE PRE-SQL",
 "Archivo íntegro: "+(r.valid?"VERIFICADO":"ERROR"),
 "Solicitudes de permiso: SELECT catálogo por separado de DDL",
 "SQL real ejecutado: 0 | Restauraciones: 0",
 "DECISIÓN: NO GO",
 "Inconsistencias: "+r.issues.join(", ")
 ].join("\n");
}
if(require.main===module){
 let r;try{r=assess(readFiles());}catch(e){r=result(["REVIEW_SOURCE_UNREADABLE"]);}
 console.log(output(r));process.exitCode=r.valid?2:1;
}
module.exports={FILES,utf8Bytes,gitBlobSha,readFiles,assess,output};
