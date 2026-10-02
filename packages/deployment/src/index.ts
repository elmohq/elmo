/**
 * This entry point is Node-safe: it exposes only the server config accessor so
 * the worker can read its config without loading React. The client-only
 * OptimizeButton selector lives at "@workspace/deployment/client".
 */

export {
	FEATURES_BY_MODE,
	type GetDeploymentOptions,
	getDeployment,
	getDeploymentFeatures,
	resetDeploymentCache,
} from "./deployment";
