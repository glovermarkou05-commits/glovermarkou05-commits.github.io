"use strict";
/* V29: pure static contract tests, no HTTP, shell, SQL, Supabase or execution.
 * node apps/mg-web-studio-cloud/tests/backend-contract-v29.test.cjs
 */
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=p=>fs.readFileSync(path.join(__dirname,"..",p),"utf8");
const root={};new Function("window",read("shared/mg-backend-contract-v29.js"))(root);
const M=root.MGBackendContractV29,fixture=()=>JSON.parse(read("staging/v29-backend-contract.review.json"));
const clone=x=>JSON.parse(JSON.stringify(x));const doc=fixture();
let count=0;function check(label,ok){assert.ok(ok,label);count++;}
const result=M.inspect(doc);
check("Validator version",M.version==="29.0-review");
check("Seven actions",M.actions.length===7);
check("Baseline review valid",result.valid===true);
check("Baseline issues empty",result.issues.length===0);
check("Seven endpoint contracts",result.checkedRoutes===7);
check("Twelve error definitions",result.checkedErrorCodes===12);
check("No real tests",result.realTestsRun===0);
check("No backend implemented",result.backendImplemented===false);
check("No SQL executed",result.sqlExecuted===false);
check("No authentication",result.authenticated===false);
check("No deployment authorization",result.authorizedToDeploy===false);
check("No provisioning",result.mayProvision===false);
check("No SQL permission",result.mayRunSQL===false);
check("No deployment",result.mayDeploy===false);
check("No publication",result.mayPublish===false);
check("No charging",result.mayCharge===false);
check("No paid AI",result.mayCallPaidAI===false);
check("No staging GO",result.stagingReady===false);
check("No production GO",result.productionReady===false);
check("No GO",result.go===false);
check("Document immutable",JSON.stringify(doc)===JSON.stringify(fixture()));
check("V14 reviewed",doc.integration.existingV14RoutesReviewed===true);
check("Migration explicitly required",doc.integration.migrationRequired===true);
check("Legacy states acknowledged",doc.integration.legacyReadAliases.submitted_for_review==="submitted");
check("Home canonical",doc.integration.homeSlug==="home"&&doc.integration.homePath==="/");
check("Separate security audit",doc.audit.deniedSecurityLog.includes("separate-restricted"));
check("No unverified tenant association",doc.audit.deniedSecurityLog.includes("no-unverified-target-tenant"));
check("Server-minted IDs",doc.responses.success.serverMintsRequestId&&doc.responses.failure.serverMintsRequestId);
check("No client audit write",doc.audit.clientCanWrite===false);
check("Transaction atomicity declared future",doc.transaction.implementationState==="NOT_IMPLEMENTED");
check("No site publication in transaction",doc.transaction.publishSite===false);
check("Proposed rollback",doc.transaction.rollback.includes("outbox"));
check("Idempotency independent of session",!doc.idempotency.uniqueScope.includes("sessionId"));
check("Canonical fingerprint retains tenant",doc.idempotency.requestFingerprintIncludes.includes("organizationId"));
check("Actual policy undecided",doc.idempotency.retention==="UNDECIDED_REQUIRES_POLICY");
const actions=["create","submit","changes","revise","approve","reject","apply"];
for(const [i,action] of actions.entries()){
 const route=doc.routes[i];
 check(action+" action name",route.action===action);
 check(action+" POST",route.method==="POST");
 check(action+" not executable",route.notImplemented===true);
 check(action+" idempotency requested",route.clientSupplied.includes("Idempotency-Key"));
 check(action+" identity server derived",route.serverDerived.includes("actorId"));
 check(action+" MFA scope server derived",route.serverDerived.includes("mfaLevel"));
 check(action+" request ID server derived",route.serverDerived.includes("requestId"));
 check(action+" audit ID server derived",route.serverDerived.includes("auditEventId"));
 check(action+" no secret key in clientSupplied",!route.clientSupplied.includes("secret"));
}
check("Creates with MFA staff only",JSON.stringify(doc.routes[0].roles)==='["SUPERADMIN"]');
check("Editors cannot approve",!doc.routes[4].roles.includes("CLIENT_EDITOR"));
check("Editors can request changes",doc.routes[2].roles.includes("CLIENT_EDITOR"));
check("Editors can apply",doc.routes[6].roles.includes("CLIENT_EDITOR"));
check("Apply requires draft CAS",doc.routes[6].requiresDraftVersion===true);
check("Create revision zero",doc.routes[0].requiresRevision===0);
check("Review endpoint matches V14",doc.routes[2].route.endsWith("/review")&&doc.routes[5].route.endsWith("/review"));
for(const code of Object.keys({
 UNAUTHENTICATED:1,RESOURCE_UNAVAILABLE:1,FORBIDDEN:1,INVALID_REQUEST:1,
 INVALID_TRANSITION:1,STALE_REVISION:1,STALE_DRAFT:1,IDEMPOTENCY_CONFLICT:1,
 RETRY_LATER:1,RATE_LIMITED:1,INTERNAL_ERROR:1,METHOD_NOT_ALLOWED:1
})){
 const classification=M.classifyError(doc,code);
 check(code+" classified",classification.ok&&classification.code===code);
 check(code+" cannot authorize",classification.go===false);
 check(code+" no leak",classification.revealsResource===false&&!classification.includesSensitiveDetails);
 check(code+" generic",classification.publicMessage==="Operation could not be completed.");
 check(code+" simulation",classification.simulationOnly===true);
}
check("Unknown code rejected",M.classifyError(doc,"DB_SECRET").ok===false);
check("Prototype code rejected",M.classifyError(doc,"__proto__").ok===false);
check("Empty code rejected",M.classifyError(doc,"").ok===false);
check("Untrusted number rejected",M.classifyError(doc,100).ok===false);
check("Null contract invalid",M.inspect(null).valid===false);
check("Null contract GO false",M.inspect(null).go===false);
check("Malformed scalar invalid",M.inspect("some").valid===false);
const tamper=[
 ["version",d=>d.version=30,"SCOPE_INVALID"],
 ["main branch",d=>d.sourceBranch="main","SCOPE_INVALID"],
 ["another project",d=>d.project="FINZY","SCOPE_INVALID"],
 ["real mode",d=>d.mode="enabled","SCOPE_INVALID"],
 ["forged approval",d=>d.authorization.granted=true,"AUTHORIZATION_FORBIDDEN"],
 ["cost provisioned",d=>d.authorization.approvedCostUsd=250,"AUTHORIZATION_FORBIDDEN"],
 ["deployment flag",d=>d.execution.mayDeploy=true,"EXECUTION_FORBIDDEN"],
 ["SQL enabled",d=>d.execution.mayRunSQL=true,"EXECUTION_FORBIDDEN"],
 ["paid AI flag",d=>d.execution.mayCallPaidAI=true,"EXECUTION_FORBIDDEN"],
 ["charge flag",d=>d.execution.mayCharge=true,"EXECUTION_FORBIDDEN"],
 ["publish flag",d=>d.execution.mayPublish=true,"EXECUTION_FORBIDDEN"],
 ["extra execution flag",d=>d.execution.mayDoAnything=true,"EXECUTION_FORBIDDEN"],
 ["drop apply",d=>d.routes.pop(),"ROUTE_SET_INVALID"],
 ["route method GET",d=>d.routes[0].method="GET","ROUTE_INVALID_CREATE"],
 ["route path becomes arbitrary",d=>d.routes[0].route="/api/admin/delete","ROUTE_INVALID_CREATE"],
 ["add editor approval",d=>d.routes[4].roles.push("CLIENT_EDITOR"),"ROUTE_INVALID_APPROVE"],
 ["remove owner approval",d=>d.routes[4].roles.shift(),"ROUTE_INVALID_APPROVE"],
 ["no staff MFA",d=>d.routes[0].permission="none","ROUTE_INVALID_CREATE"],
 ["expose cookie",d=>d.routes[0].clientSupplied.push("cookie"),"ROUTE_INVALID_CREATE"],
 ["actor from browser",d=>d.routes[0].serverDerived.shift(),"ROUTE_INVALID_CREATE"],
 ["route activates backend",d=>d.routes[1].notImplemented=false,"ROUTE_INVALID_SUBMIT"],
 ["apply draft version optional",d=>d.routes[6].requiresDraftVersion=false,"ROUTE_INVALID_APPLY"],
 ["remove tenant idempotency scope",d=>d.idempotency.uniqueScope.shift(),"IDEMPOTENCY_DESIGN_INVALID"],
 ["idempotency session-bound",d=>d.idempotency.uniqueScope.push("sessionId"),"IDEMPOTENCY_DESIGN_INVALID"],
 ["replay without fresh auth",d=>d.idempotency.responseReplay="from-cache-without-check","IDEMPOTENCY_DESIGN_INVALID"],
 ["hash omits payload",d=>d.idempotency.requestFingerprintIncludes.pop(),"IDEMPOTENCY_DESIGN_INVALID"],
 ["replay stores tokens",d=>d.idempotency.forbiddenFingerprintFields=[],"IDEMPOTENCY_DESIGN_INVALID"],
 ["operation stored in browser",d=>d.idempotency.storage="localStorage","IDEMPOTENCY_DESIGN_INVALID"],
 ["transaction loses outbox",d=>d.transaction.sequence.splice(8,1),"TRANSACTION_DESIGN_INVALID"],
 ["transaction reordered auth",d=>d.transaction.sequence.reverse(),"TRANSACTION_DESIGN_INVALID"],
 ["commit partial allowed",d=>d.transaction.rollback="partial","TRANSACTION_DESIGN_INVALID"],
 ["transaction falsely implemented",d=>d.transaction.implementationState="DONE","TRANSACTION_DESIGN_INVALID"],
 ["publish in transaction",d=>d.transaction.publishSite=true,"TRANSACTION_DESIGN_INVALID"],
 ["audit mixed denied tenant",d=>d.audit.deniedSecurityLog=d.audit.businessLog,"AUDIT_BOUNDARY_INVALID"],
 ["client can write audit",d=>d.audit.clientCanWrite=true,"AUDIT_BOUNDARY_INVALID"],
 ["client claimed actor",d=>d.audit.actorTrust="request-actor","AUDIT_BOUNDARY_INVALID"],
 ["redaction dropped",d=>d.audit.redact=[],"AUDIT_BOUNDARY_INVALID"],
 ["audit claim strong without evidence",d=>d.audit.integrity="VERIFIED","AUDIT_BOUNDARY_INVALID"],
 ["secret error messages",d=>d.responses.noSecretsInErrors=false,"RESPONSE_CONTRACT_INVALID"],
 ["raw DB errors leaked",d=>d.responses.noRawSqlMessages=false,"RESPONSE_CONTRACT_INVALID"],
 ["outbox visible",d=>d.responses.noOutboxPayloadOnClient=false,"RESPONSE_CONTRACT_INVALID"],
 ["missing error",d=>d.errors.pop(),"ERROR_LIST_INVALID"],
 ["resource enumeration",d=>d.errors[1].revealResource=true,"ERROR_INVALID_RESOURCE_UNAVAILABLE"],
 ["error messages detailed",d=>d.errors[0].visibility="debug","ERROR_INVALID_UNAUTHENTICATED"],
 ["HTTP success for missing",d=>d.errors[1].httpStatus=200,"ERROR_INVALID_RESOURCE_UNAVAILABLE"],
 ["rate limit non-retryable",d=>d.errors[9].retryable=false,"ERROR_INVALID_RATE_LIMITED"],
 ["hide SQL incompatibility",d=>d.integration.migrationRequired=false,"COMPATIBILITY_INVALID"],
 ["fake SQL executed",d=>d.integration.sqlExecuted=true,"COMPATIBILITY_INVALID"],
 ["fake backend implemented",d=>d.integration.backendImplemented=true,"COMPATIBILITY_INVALID"],
 ["fake HOME path",d=>d.integration.homePath="/home","COMPATIBILITY_INVALID"],
 ["remove blocker",d=>d.blockers.shift(),"BLOCKERS_CHANGED"],
 ["fake live test",d=>d.acceptance.allRealTests="PASSED","GATE_INVALID"],
 ["stage GO",d=>d.acceptance.stage="GO","GATE_INVALID"],
 ["production GO",d=>d.acceptance.production="GO","GATE_INVALID"]
];
for(const [name,alter,expected] of tamper){
 const doc2=fixture();alter(doc2);
 const out=M.inspect(doc2);
 check("Tamper "+name+" detected",!out.valid&&out.issues.includes(expected));
 check("Tamper "+name+" stays NO GO",out.go===false&&!out.authorizedToDeploy&&!out.mayRunSQL);
 check("Tamper "+name+" cannot classify",M.classifyError(doc2,"UNAUTHENTICATED").ok===false);
}
const v28=JSON.parse(read("staging/v28-backend-rls-matrix.review.json"));
const v18=JSON.parse(read("staging/v18-manifest.review.json"));
check("V28 all future backend tests pending",v28.cases.length===30&&v28.cases.every(x=>x.evidenceStatus==="NOT_EXECUTED"));
check("V28 no SQL",v28.execution.mayRunSQL===false);
check("V18 still NOT_AUTHORIZED",v18.state==="NOT_AUTHORIZED"&&v18.authorization.granted===false);
check("V18 staging checks pending",v18.checks.filter(x=>x.status==="pending").length===16);
check("No direct Supabase",!read("shared/mg-backend-contract-v29.js").includes("supabase."));
check("No fetch",!read("shared/mg-backend-contract-v29.js").includes("fetch("));
check("No shell",!read("shared/mg-backend-contract-v29.js").includes("child_process"));
console.log(count+" / "+count+" V29 static backend contract checks passed; NO GO remains.");
