'use strict';

// V69: informational, offline review of a proposed isolated HTTP-parser lab.
// This module cannot grant permission or start a listener, regardless of input.
const PROPOSAL_KEYS = new Set(['interface', 'port', 'transport', 'database',
  'identities', 'exposure', 'purpose', 'nodeMajor']);
const REQUIRED = Object.freeze({
  transport: 'HTTP_ONLY_LOOPBACK', database: 'SYNTHETIC_ONLY',
  identities: 'SYNTHETIC_ONLY', exposure: 'LOCAL_MACHINE_ONLY',
  purpose: 'HTTP_PARSER_VALIDATION'
});
const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(x));
function reviewLabProposalV69(proposal = {}) {
  const reasons = [];
  if (!isRecord(proposal)) reasons.push('INVALID_SCHEMA');
  else {
    if (Object.keys(proposal).some(k => !PROPOSAL_KEYS.has(k))) reasons.push('UNRECOGNIZED_SETTING');
    if (!['127.0.0.1', '::1'].includes(proposal.interface)) reasons.push('LOOPBACK_REQUIRED');
    if (!Number.isSafeInteger(proposal.port) || proposal.port < 1024 || proposal.port > 65535)
      reasons.push('EXPLICIT_UNPRIVILEGED_PORT_REQUIRED');
    if (!Number.isSafeInteger(proposal.nodeMajor) || proposal.nodeMajor < 22 || proposal.nodeMajor > 26)
      reasons.push('SUPPORTED_NODE_MAJOR_REQUIRED');
    for (const [key, value] of Object.entries(REQUIRED)) {
      if (proposal[key] !== value) reasons.push('INCOMPATIBLE_' + key.toUpperCase());
    }
  }
  return Object.freeze({
    proposalHasSafeShape: reasons.length === 0,
    issues: Object.freeze(reasons),
    // Passing schema checks never grants permission or validates real network behavior.
    authorizationMustBeRecordedSeparately: true,
    portOpened: false, labAuthorized: false, stagingAuthorized: false,
    deploymentAuthorized: false, httpParserTested: false,
    decision: 'NO_GO'
  });
}
module.exports = { reviewLabProposalV69 };
