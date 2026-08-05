import { type EnvMap, requireEnvVars } from "@workspace/config/env";
import { ELMO_RUNTIME_FENCE_GENERATION } from "@workspace/lib/deployment-cutover";

export function validateWorkerStartupEnv(env: EnvMap = process.env): void {
	if (env.DEPLOYMENT_MODE === "cloud") {
		requireEnvVars(["DATABASE_URL_UNPOOLED", "ELMO_RUNTIME_FENCE_GENERATION", "SENTRY_DSN", "STRIPE_SECRET_KEY"], env);
	}
	if (env.ELMO_RUNTIME_FENCE_GENERATION !== undefined) {
		requireEnvVars(["DATABASE_URL_UNPOOLED"], env);
		if (env.ELMO_RUNTIME_FENCE_GENERATION !== ELMO_RUNTIME_FENCE_GENERATION) {
			throw new Error(`ELMO_RUNTIME_FENCE_GENERATION must be ${ELMO_RUNTIME_FENCE_GENERATION} for this worker image`);
		}
	}
}
