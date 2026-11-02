'use strict';

// MG Web Studio Cloud V99: OFFLINE-only decision gate, does NOT connect to Supabase,
// load credentials, perform SQL, launch a sandbox or authorize a deployment.
// A "review candidate" is not an authorization to operate a remote project.

const PURPOSE = 'MG_WEB_STUDIO_CLOUD_V99_DEDICATED_AUTH_SANDBOX';
const REQUIRED = Object.freeze([
  'ownerApprovedScope',
  'isolatedFromOtherProjects',
  'syntheticAccountsOnly',
  'noProductionData',
  'separateBillingReviewed',
  'readOnlyPlanApproved',
  'serverOnlySecretsPlan',
  'cryptographicJwtSourceVerified',
  'primarySessionReadApproved',
  'sessionRevocationPlanVerified',
  'recentMfaServerEventAvailable',
  'mfaEventBoundToVerifiedSession',
  'factorTimestampProvenanceReviewed',
  'independentSecurityReviewerAssigned',
  'rollbackAndDeletionPlanReviewed'
]);
const ALLOWED = new Set([
  'projectPurpose','projectState','dataClass','evidenceSource',
  'roles','evaluatedOn','flags'
]);
const plain = x => x!==null && typeof x==='object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);
const RESULT_CLASS = Object.freeze({
  approvalRequired:true,remoteConnectionAllowed:false,
  queriesAllowed:false,credentialsAllowed:false,sqlAllowed:false,
  usersCreationAllowed:false,mfaChallengeAllowed:false,productionAllowed:false,
  githubMergeAllowed:false, formalV67Pass:0, formalV67Pending:32,
  mode:'STATIC_SCOPE_EVALUATION_ONLY'
});
function assessV99SandboxReadiness(input) {
  const blocks=[];
  if(!plain(input) || Object.keys(input).some(k=>!ALLOWED.has(k)))
    return Object.freeze({...RESULT_CLASS,candidateReadyForHumanReview:false,
      reasonCodes:Object.freeze(['INVALID_OR_MISSING_INPUT'])});
  if(input.projectPurpose!==PURPOSE)blocks.push('NOT_DEDICATED_MG_WEB_STUDIO_SANDBOX');
  if(input.projectState!=='ACTIVE_HEALTHY')blocks.push('PROJECT_NOT_ACTIVE_HEALTHY');
  if(input.dataClass!=='SYNTHETIC_ONLY')blocks.push('NOT_SYNTHETIC_ONLY');
  if(input.evidenceSource!=='INDEPENDENTLY_REVIEWED')blocks.push('EVIDENCE_NOT_INDEPENDENT');
  if(input.roles!=='SERVER_ONLY_LEAST_PRIVILEGE')
    blocks.push('ROLE_SEPARATION_NOT_REVIEWED');
  // Accept only the exact 15 boolean requirements. Never accept project refs,
  // URLs, tokens, raw sessions, emails or user records in this assessment.
  if(!plain(input.flags)||Object.keys(input.flags).length!==REQUIRED.length ||
    Object.keys(input.flags).some(k=>!REQUIRED.includes(k)))
    blocks.push('INVALID_CONTROL_SET');
  else for(const key of REQUIRED) if(input.flags[key]!==true)
    blocks.push(key.toUpperCase()+'_PENDING');
  if(input.evaluatedOn!=='2026-11-02')
    blocks.push('INVENTORY_REQUIRES_NEW_DATE_SCOPED_REVIEW');
  const ready = blocks.length===0;
  return Object.freeze({...RESULT_CLASS,
    candidateReadyForHumanReview:ready,
    reasonCodes:Object.freeze(blocks),
    nextAction:ready?'REQUEST_NEW_SCOPED_OPERATOR_AUTHORIZATION':
      'BLOCK_REMOTE_AUTH_SANDBOX_WORK'});
}
module.exports={assessV99SandboxReadiness,REQUIRED,PURPOSE};
