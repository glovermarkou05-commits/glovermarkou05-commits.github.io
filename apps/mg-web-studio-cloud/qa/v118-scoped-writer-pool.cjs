'use strict';
// V118 LAB-ONLY boundary. Injected PG pool; no secrets, network, DB imports
// or environment access. Not wired into any production application.
// A physical PG session is always destroyed on release: V115 release() is
// synchronous, so it cannot safely await RESET ROLE before pool reuse.
const LOGIN='mg_v118_ci_backend';
const WRITER='mg_auth_ledger_writer';
const WHO='SELECT session_user AS session_user, current_user AS current_user';
const SET='SET ROLE mg_auth_ledger_writer';
function verified(result,role){
 return result&&Array.isArray(result.rows)&&result.rows.length===1&&
  result.rows[0]&&typeof result.rows[0]==='object'&&
  Object.keys(result.rows[0]).length===2&&
  result.rows[0].session_user===LOGIN&&result.rows[0].current_user===role;
}
function createV118ScopedLabWriterPool(underlying){
 if(!underlying||typeof underlying.connect!=='function')
  throw new TypeError('Explicit disposable PostgreSQL pool required');
 let checkedOut=0,disposed=0,rejected=0;
 return Object.freeze({
  async connect(){
   let raw;
   try{
    raw=await underlying.connect();
    if(!raw||typeof raw.query!=='function'||typeof raw.release!=='function')
     throw new Error('BAD_POOL_CLIENT');
    if(!verified(await raw.query(WHO),LOGIN))
     throw new Error('UNEXPECTED_AUTHENTICATED_PRINCIPAL');
    await raw.query(SET); // CI fixture's non-admin member, never superuser.
    if(!verified(await raw.query(WHO),WRITER))
     throw new Error('WRITER_ROLE_NOT_ACTIVE');
    checkedOut++;
    let released=false;
    return Object.freeze({
     query(sql,params){if(released)throw new Error('CONNECTION_RELEASED');return raw.query(sql,params);},
     release(error){
      if(released)throw new Error('DOUBLE_RELEASE');
      released=true;
      // Always evict, whether success, rollback or uncertain COMMIT.
      // No async cleanup racing with an unrelated subsequent checkout.
      disposed++;
      raw.release(error||true);
     }
    });
   }catch{
    rejected++;
    if(raw&&typeof raw.release==='function'){
     try{raw.release(true);disposed++;}catch{}
    }
    throw new Error('V118_SCOPED_WRITER_DENIED');
   }
  },
  snapshot(){return Object.freeze({checkedOut,disposed,rejected});},
  readiness:Object.freeze({
   labOnly:true,sessionReuseAllowed:false,backendRoleProductionApproved:false,
   authSessionRevocationVerified:false,businessTransactionIntegrated:false,
   productionAuthorized:false,formalV67Pass:0,decision:'NO_GO'
  })
 });
}
module.exports={createV118ScopedLabWriterPool,LOGIN,WRITER,WHO,SET};
