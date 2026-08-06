/**
 * @workspace/deployment - Deployment facade package
 *
 * Thin switch that picks the active deployment mode based on DEPLOYMENT_MODE
 * and delegates to the appropriate package (@workspace/local, @workspace/whitelabel,
 * @workspace/cloud).
 *
 * This entry point is Node-safe: it exposes only the server config accessor so
 * the worker can build a Deployment without loading React. The client-only
 * OptimizeButton selector lives at "@workspace/deployment/client".
 */

export { getDeployment, resetDeploymentCache, type GetDeploymentOptions } from "./deployment";
