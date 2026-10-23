'use strict';

// V69: strictly server-side dependency assembly. This module never creates,
// listens on, or connects to a network socket or database.
const SAFE_KEYS = new Set(['verifyAccessToken', 'query', 'observe', 'makeRequestId']);
const COMPONENT_KEYS = Object.freeze([
  'createAuthBoundary', 'createPgTenantRepository', 'createTenantAuthorizer',
  'createHttpSiteGate', 'createNodeHttpTransport', 'createRequestBudget',
  'createHttpServerBlueprint'
]);
const LAB_POLICY = Object.freeze({
  evidenceClass: 'UNBOUND_ASSEMBLY',
  httpParserTested: false,
  tokenVerifierProven: false,
  postgresVerified: false,
  recoveryVerified: false,
  networkAuthorized: false,
  deploymentAuthorized: false,
  decision: 'NO_GO'
});
const isRecord = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function realComponents() {
  // Late, local CommonJS imports preserve server-only execution. There is no
  // fallback verifier, privileged query, token decoder, or deployment adapter.
  return {
    ...require('./auth-boundary.cjs'),
    ...require('./pg-tenant-repository.cjs'),
    ...require('./tenant-authorization.cjs'),
    ...require('./http-site-gate-v63.cjs'),
    ...require('./node-http-transport-v64.cjs'),
    ...require('./request-budget-v66.cjs'),
    ...require('./http-server-blueprint-v65.cjs')
  };
}
function assembleUnboundTenantHttpV69(options = {}, testComponents) {
  if (!isRecord(options) || Object.keys(options).some(key => !SAFE_KEYS.has(key)) ||
      typeof options.verifyAccessToken !== 'function' || typeof options.query !== 'function' ||
      (options.observe !== undefined && typeof options.observe !== 'function') ||
      (options.makeRequestId !== undefined && typeof options.makeRequestId !== 'function')) {
    throw new TypeError('Explicit server verifier and read-only query required; no network options permitted');
  }
  // The optional second argument is a unit-test seam, never request-controlled.
  const components = testComponents === undefined ? realComponents() : testComponents;
  if (!isRecord(components) || Object.keys(components).some(key => !COMPONENT_KEYS.includes(key)) ||
      COMPONENT_KEYS.some(key => typeof components[key] !== 'function')) {
    throw new TypeError('Complete, explicitly trusted server components required');
  }
  const authenticate = components.createAuthBoundary({verifyAccessToken: options.verifyAccessToken});
  const repository = components.createPgTenantRepository({query: options.query});
  const authorize = components.createTenantAuthorizer({authenticate, repository});
  const gate = components.createHttpSiteGate({authorize,
    ...(options.makeRequestId ? {makeRequestId: options.makeRequestId} : {})});
  const transport = components.createNodeHttpTransport({gate,
    ...(options.makeRequestId ? {makeRequestId: options.makeRequestId} : {})});
  const admission = components.createRequestBudget({serve: transport,
    ...(options.observe ? {observe: options.observe} : {})});
  const blueprint = components.createHttpServerBlueprint({serve: admission});
  if (!isRecord(blueprint) || typeof blueprint.onRequest !== 'function' ||
      typeof blueprint.configure !== 'function' || !isRecord(blueprint.options) ||
      blueprint.options.insecureHTTPParser !== false ||
      blueprint.options.joinDuplicateHeaders !== false ||
      blueprint.options.maxHeaderSize !== 16384 ||
      blueprint.options.requireHostHeader !== true ||
      blueprint.options.requestTimeout !== 10000 ||
      blueprint.options.headersTimeout !== 5000) {
    throw new TypeError('Unsafe or incomplete HTTP server blueprint');
  }
  // This object is deliberately not a Node server and has no listen() method.
  // Configuring an unbound server requires an independent operator decision;
  // calling this factory does NOT authorize lab networking or deployment.
  return Object.freeze({
    serverOptions: Object.freeze({...blueprint.options}),
    onRequest: blueprint.onRequest,
    configureUnboundServer: blueprint.configure,
    readiness: LAB_POLICY
  });
}
module.exports = { assembleUnboundTenantHttpV69 };
