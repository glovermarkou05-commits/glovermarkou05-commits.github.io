/* MG WEB STUDIO CLOUD V29 — REVIEW-ONLY backend contract validator.
 * No server, HTTP, authentication, SQL, migration, deployment or billing.
 * This validates a STATIC DESIGN. It does not protect a running service.
 */
(function(root){"use strict";
const VERSION="29.0-review",BRANCH="feature/mg-digital-v5-web-services";
const isObj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const ACTIONS=Object.freeze(["create","submit","changes","revise","approve","reject","apply"]);
const V20_STATES=Object.freeze(["draft","submitted","needs_changes","rejected","approved","applied"]);
const APPROVER=Object.freeze(["CLIENT_OWNER","CLIENT_ADMIN"]),EDITOR=Object.freeze([...APPROVER,"CLIENT_EDITOR"]),STAFF=Object.freeze(["SUPERADMIN"]);
const apiBase="/api/v1/organizations/:organizationId/sites/:siteId/proposals";
const endpointSpecs=Object.freeze({
 create:{route:apiBase,roles:STAFF,permission:"staff_mfa",from:null,to:"draft",draft:false},
 submit:{route:apiBase+"/:proposalId/submit",roles:STAFF,permission:"staff_mfa",from:"draft",to:"submitted",draft:false},
 changes:{route:apiBase+"/:proposalId/review",roles:EDITOR,permission:"proposalChanges",from:"submitted",to:"needs_changes",draft:false},
 revise:{route:apiBase+"/:proposalId/revise",roles:STAFF,permission:"staff_mfa",from:["needs_changes","rejected"],to:"draft",draft:false},
 approve:{route:apiBase+"/:proposalId/review",roles:APPROVER,permission:"proposalApprove",from:"submitted",to:"approved",draft:false},
 reject:{route:apiBase+"/:proposalId/review",roles:APPROVER,permission:"proposalReject",from:"submitted",to:"rejected",draft:false},
 apply:{route:apiBase+"/:proposalId/apply",roles:EDITOR,permission:"proposalApply",from:"approved",to:"applied",draft:true}
});
const STEPS=Object.freeze(["verify-authenticated-identity","resolve-tenant-scope-and-resource",
 "check-server-role-and-mfa","lock-or-cas-proposal-revision","validate-status-transition",
 "write-proposal-and-draft-if-applicable","write-operation-idempotency-receipt",
 "write-private-business-audit","write-outbox-event","commit-together"]);
const FINGERPRINT=Object.freeze(["method","canonicalRoute","organizationId","siteId","proposalId",
 "action","expectedRevision","expectedDraftVersion","decisionPayload"]);
const SERVER=Object.freeze(["actorId","role","tenantMembership","siteScope","mfaLevel","requestId","auditEventId"]);
const ERRORS=Object.freeze({
 UNAUTHENTICATED:401,RESOURCE_UNAVAILABLE:404,FORBIDDEN:403,INVALID_REQUEST:400,
 INVALID_TRANSITION:409,STALE_REVISION:409,STALE_DRAFT:409,IDEMPOTENCY_CONFLICT:409,
 RETRY_LATER:503,RATE_LIMITED:429,INTERNAL_ERROR:500,METHOD_NOT_ALLOWED:405
});
const REQUIRED_BLOCKERS=Object.freeze(["STATUS_CONTRACT_MISMATCH","HOME_EXISTENCE_UNPROVEN",
 "SECURITY_DEFINER_REVIEW","CAS_SQL_TRANSACTION_UNPROVEN","POSTGRES_REQUIRED",
 "AUTH_MFA_REAL_UNTESTED","AUDIT_INTEGRITY_UNPROVEN"]);
const VALID_ERRORS=new Set(Object.keys(ERRORS));
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function errors(report){
 const issues=[];const fail=(code)=>issues.push(code);
 if(!isObj(report)||report.format!=="mg-web-studio/backend-contract-v29-review"||
  report.version!==29||report.project!=="MG WEB STUDIO CLOUD"||
  report.sourceBranch!==BRANCH||report.mode!=="design-only-not-implemented")
  fail("SCOPE_INVALID");
 if(!isObj(report)||!isObj(report.authorization)||
   report.authorization.granted!==false||
   report.authorization.approvedEnvironment!==null||report.authorization.approvedCostUsd!==null)
  fail("AUTHORIZATION_FORBIDDEN");
 const exec=report&&report.execution;
 if(!isObj(exec)||exec.reviewOnly!==true||
  !["mayRunSQL","mayProvision","mayDeploy","mayPublish","mayCallPaidAI","mayCharge"]
    .every(x=>exec[x]===false)||
  Object.keys(exec).some(k=>k!=="reviewOnly"&&!["mayRunSQL","mayProvision","mayDeploy",
   "mayPublish","mayCallPaidAI","mayCharge"].includes(k)))
  fail("EXECUTION_FORBIDDEN");
 if(!Array.isArray(report&&report.routes)||report.routes.length!==7)
  fail("ROUTE_SET_INVALID");
 else for(let i=0;i<ACTIONS.length;i++){
  const r=report.routes[i],key=ACTIONS[i],spec=endpointSpecs[key];
  if(!isObj(r)||r.action!==key||r.method!=="POST"||r.route!==spec.route||
   !same(r.roles,spec.roles)||r.permission!==spec.permission||
   !same(r.from,spec.from)||r.to!==spec.to||r.requiresDraftVersion!==spec.draft||
   !Number.isSafeInteger(r.requiresRevision)||r.requiresRevision!==(key==="create"?0:1)||
   r.notImplemented!==true||
   !same(r.serverDerived,SERVER)||
   !same(r.clientSupplied,["Idempotency-Key","expectedRevision",...(spec.draft?["expectedDraftVersion"]:[]),"decisionPayload"])||
   Object.keys(r).some(k=>!["action","method","route","roles","from","to","permission",
    "requiresRevision","requiresDraftVersion","clientSupplied","serverDerived","notImplemented"].includes(k)))
    fail("ROUTE_INVALID_"+key.toUpperCase());
 }
 const ide=report&&report.idempotency;
 if(!isObj(ide)||!same(ide.uniqueScope,["organizationId","authenticatedActorId","Idempotency-Key"])||
  !same(ide.requestFingerprintIncludes,FINGERPRINT)||
  !same(ide.forbiddenFingerprintFields,["password","accessToken","secret","authorizationHeader","cookie","sessionId"])||
  ide.responseReplay!=="after-fresh-auth-and-tenant-scope-check"||
  ide.collision!=="IDEMPOTENCY_CONFLICT"||
  ide.storage!=="future-server-transaction-only"||
  ide.retention!=="UNDECIDED_REQUIRES_POLICY")
  fail("IDEMPOTENCY_DESIGN_INVALID");
 const t=report&&report.transaction;
 if(!isObj(t)||t.boundary!=="single-future-PostgreSQL-transaction"||
  !same(t.sequence,STEPS)||
  t.rollback!=="any-error-reverts-business-state-idempotency-receipt-and-outbox"||
  t.isolation!=="NOT_DECIDED_PENDING_POSTGRES_CONCURRENCY_TEST"||
  t.implementationState!=="NOT_IMPLEMENTED"||t.publishSite!==false)
  fail("TRANSACTION_DESIGN_INVALID");
 const a=report&&report.audit;
 if(!isObj(a)||a.businessLog!=="private-tenant-scoped-after-verified-resource-ownership"||
  a.deniedSecurityLog!=="separate-restricted-server-security-audit-no-unverified-target-tenant-association"||
  !same(a.redact,["credentials","cookies","tokens","notes","proposalBody","paymentData","rawUserInput"])||
  a.actorTrust!=="server-verified-only"||
  a.integrity!=="UNPROVEN_REQUIRES_CRYPTOGRAPHIC_OR_IMMUTABLE_DESIGN"||
  a.securityLogging!=="design-only"||a.clientCanWrite!==false)
  fail("AUDIT_BOUNDARY_INVALID");
 const res=report&&report.responses;
 if(!isObj(res)||!isObj(res.success)||!isObj(res.failure)||
  res.success.serverMintsRequestId!==true||res.failure.serverMintsRequestId!==true||
  res.success.format!=="{ok:true,data:{...},requestId}"||
  res.failure.format!=="{ok:false,error:{code,message},requestId}"||
  res.noSecretsInErrors!==true||res.noRawSqlMessages!==true||
  res.noOutboxPayloadOnClient!==true)
  fail("RESPONSE_CONTRACT_INVALID");
 const er=report&&report.errors;
 if(!Array.isArray(er)||er.length!==Object.keys(ERRORS).length)
  fail("ERROR_LIST_INVALID");
 else for(const [index,code] of Object.keys(ERRORS).entries()){
  const row=er[index];
  if(!isObj(row)||row.code!==code||row.httpStatus!==ERRORS[code]||
   row.revealResource!==false||row.visibility!=="public-generic"||
   row.retryable!==["STALE_REVISION","STALE_DRAFT","RETRY_LATER","RATE_LIMITED"].includes(code)||
   Object.keys(row).some(k=>!["code","httpStatus","retryable","visibility","revealResource"].includes(k)))
   fail("ERROR_INVALID_"+code);
 }
 const integration=report&&report.integration;
 if(!isObj(integration)||integration.existingV14RoutesReviewed!==true||
  !same(integration.canonicalV20States,V20_STATES)||
  !same(integration.legacyReadAliases,{submitted_for_review:"submitted",applied_to_draft:"applied"})||
  integration.migrationRequired!==true||integration.homeSlug!=="home"||integration.homePath!=="/"||
  integration.sqlExecuted!==false||integration.backendImplemented!==false)
  fail("COMPATIBILITY_INVALID");
 if(!Array.isArray(report&&report.blockers)||!same(report.blockers,REQUIRED_BLOCKERS))
  fail("BLOCKERS_CHANGED");
 const acc=report&&report.acceptance;
 if(!isObj(acc)||acc.allRealTests!=="NOT_EXECUTED"||
  acc.stage!=="NO_GO"||acc.production!=="NO_GO")
  fail("GATE_INVALID");
 return [...new Set(issues)];
}
function inspect(report){
 const issues=errors(report);
 return {version:VERSION,mode:"static-design-check",valid:issues.length===0,
  checkedRoutes:Array.isArray(report&&report.routes)?report.routes.length:0,
  checkedErrorCodes:Array.isArray(report&&report.errors)?report.errors.length:0,
  issues,realTestsRun:0,backendImplemented:false,sqlExecuted:false,
  authenticated:false,authorizedToDeploy:false,mayProvision:false,mayRunSQL:false,
  mayDeploy:false,mayPublish:false,mayCharge:false,mayCallPaidAI:false,
  stagingReady:false,productionReady:false,go:false};
}
// Deliberately an error-definition lookup, not a simulated endpoint response.
// Any real authenticated response needs trusted SERVER-generated request IDs.
function classifyError(report,code){
 const r=inspect(report);
 if(!r.valid||typeof code!=="string"||!VALID_ERRORS.has(code))
  return {ok:false,code:"INVALID_CONTRACT_OR_ERROR",go:false,simulationOnly:true};
 const definition=report.errors.find(e=>e.code===code);
 return {ok:true,code,httpStatus:definition.httpStatus,retryable:definition.retryable,
  publicMessage:"Operation could not be completed.",revealsResource:false,
  includesSensitiveDetails:false,simulationOnly:true,go:false};
}
root.MGBackendContractV29=Object.freeze({version:VERSION,actions:ACTIONS,inspect,classifyError});
})(typeof window!=="undefined"?window:globalThis);
