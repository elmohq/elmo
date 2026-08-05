import { type EnvMap, requireEnvVars } from "@workspace/config/env";

export function validateWorkerStartupEnv(env: EnvMap = process.env): void {
	if (env.DEPLOYMENT_MODE === "cloud") requireEnvVars(["SENTRY_DSN", "STRIPE_SECRET_KEY"], env);
}
