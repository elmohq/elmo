/**
 * This entry point is Node-safe: it exposes only the server config accessor so
 * the worker can build a Deployment without loading React. The client-only
 * OptimizeButton selector lives at "@workspace/deployment/client".
 */

export { type GetDeploymentOptions, getDeployment, resetDeploymentCache } from "./deployment";
