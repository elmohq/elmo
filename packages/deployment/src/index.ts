/** Node-safe, so the worker loads no React; the OptimizeButton selector lives in "@workspace/deployment/client". */

export {
	FEATURES_BY_MODE,
	type GetDeploymentOptions,
	getDeployment,
	getDeploymentFeatures,
	resetDeploymentCache,
} from "./deployment";
