'use strict';
// V135: QA-only backend composition, never mount as a browser/public route.
// Requires user-scoped, pre-authenticated official Supabase Auth client and
// distinct least-privilege PG roles provisioned by backend secret manager.
const {timingSafeEqual}=require('node:crypto');
const {createV133PrivateQaMfaPipeline}=require('./v133-private-qa-mfa-pipeline.cjs');
const HOST='db.tbfhiqkivsoeuudlpkgi.supabase.co';
const ROLES=Object.freeze([
 'mg_qa_mfa_challenge_journal','mg_qa_mfa_receipt_issuer',
 'mg_qa_mfa_receipt_reader'
]);
const DENIED=Object.freeze({ok:false,productionAuthorized:false,formalV67Pass:0});
const equals=(a,b)=>{
 if(typeof a!=='string'||typeof b!=='string')return false;
 const x=Buffer.from(a,'utf8'),y=Buffer.from(b,'utf8');
 return x.length===y.length&&timingSafeEqual(x,y);
};
const secret=x=>typeof x==='string'&&x.length>=24&&x.length<=512&&!/\s/.test(x);
const certificate=x=>typeof x==='string'&&x.length>=80&&x.length<20000&&
 x.includes('-----BEGIN CERTIFICATE-----')&&x.includes('-----END CERTIFICATE-----');
async function createV135PrivateQaRuntime({
 Pool,auth,accessToken,caPem,rolePasswords,receiptKey,
 dbHost=HOST,dbPort=5432,dbName='postgres',nowSec,newReference
}={}){
 if(typeof Pool!=='function'||!auth||typeof auth.getSession!=='function'||
  typeof auth.getClaims!=='function'||typeof auth.getUser!=='function'||
  !auth.mfa||['listFactors','challenge','verify'].some(f=>typeof auth.mfa[f]!=='function')||
  typeof accessToken!=='string'||accessToken.length<10||accessToken.length>16384||
  !Array.isArray(rolePasswords)||rolePasswords.length!==3||
  !rolePasswords.every(secret)||equals(rolePasswords[0],rolePasswords[1])||
  equals(rolePasswords[0],rolePasswords[2])||equals(rolePasswords[1],rolePasswords[2])||
  !certificate(caPem)||dbHost!==HOST||dbPort!==5432||dbName!=='postgres'||
  !Buffer.isBuffer(receiptKey)||receiptKey.length<32||
  (nowSec!==undefined&&typeof nowSec!=='function')||
  (newReference!==undefined&&typeof newReference!=='function'))
  throw new TypeError('V135 requires pinned QA DB, TLS CA, three private credentials and scoped Auth');
 // getSession is a local SDK binding check, NOT an authorization source.
 // V132 immediately checks signed getClaims(jwt) and fresh getUser(jwt).
 let session;
 try{session=await auth.getSession();}catch{return null;}
 if(session?.error||!equals(session?.data?.session?.access_token,accessToken))return null;
 const pools=[];
 let closed=false;
 async function close(){
  if(closed)return;
  closed=true;
  await Promise.allSettled(pools.map(p=>p.end()));
 }
 try{
  for(let i=0;i<3;i++){
   const p=new Pool({
    host:HOST,port:5432,database:'postgres',user:ROLES[i],
    password:rolePasswords[i],
    ssl:{ca:caPem,rejectUnauthorized:true,servername:HOST},
    max:2,connectionTimeoutMillis:6000,idleTimeoutMillis:5000,
    query_timeout:8000,application_name:'mg-web-studio-v135-qa-only'
   });
   if(!p||typeof p.connect!=='function'||typeof p.end!=='function')
    throw Error('Missing private PG pool');
   pools.push(p);
  }
  for(let i=0;i<3;i++){
   let conn;
   try{
    conn=await pools[i].connect();
    if(!conn||typeof conn.query!=='function'||typeof conn.release!=='function')
     throw Error('Missing PG connection');
    const result=await conn.query(
     'SELECT current_database() AS db,current_user AS current_user,'+
     'session_user AS session_user,pg_is_in_recovery() AS is_replica,'+
     '(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS ssl'
    );
    const row=result?.rows?.[0];
    if(result?.rowCount!==1||result.rows?.length!==1||!row||
     row.db!=='postgres'||row.current_user!==ROLES[i]||
     row.session_user!==ROLES[i]||row.is_replica!==false||row.ssl!==true)
     throw Error('Wrong private backend identity or TLS');
   }finally{if(conn){try{conn.release(true);}catch{}}}
  }
  const pipeline=await createV133PrivateQaMfaPipeline({
   auth,accessToken,journalPool:pools[0],receiptIssuerPool:pools[1],
   receiptReaderPool:pools[2],receiptKey,
   ...(nowSec!==undefined?{nowSec}:{}),
   ...(newReference!==undefined?{newReference}:{})
  });
  if(!pipeline)throw Error('Auth session not verified');
  return Object.freeze({
   begin:input=>closed?Promise.resolve(DENIED):pipeline.begin(input),
   confirm:input=>closed?Promise.resolve(DENIED):pipeline.confirm(input),
   readTrustedVerifiedEvent:input=>closed?Promise.resolve(null):pipeline.readTrustedVerifiedEvent(input),
   close,
   readiness:Object.freeze({
    qaOnly:true,pinnedDbHost:HOST,roles:ROLES,
    verifiedTlsAndServerRole:true,sourceSessionBindingVerified:true,
    privatePools:3,publicEndpointWired:false,realMfaTestPassed:false,
    productionAuthorized:false,revocationLinearizable:false,
    authPostgresAtomic:false,formalV67Pass:0,decision:'NO_GO'
   })
  });
 }catch{await close();return null;}
}
module.exports={createV135PrivateQaRuntime,HOST,ROLES};
