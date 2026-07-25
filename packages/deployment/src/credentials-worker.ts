import { getDeploymentModeFromEnv } from "@workspace/config/env";
import { instanceCredentialSource } from "@workspace/lib/secrets";
import { startCredentialRefresh } from "./credentials";

/** The worker entry point: managed cloud reads Infisical, every other mode reads
 *  the encrypted provider_credentials table (with environment fallback).
 *
 *  This lives apart from `./credentials` because the web app imports that module.
 *  `@infisical/sdk` pulls in `@aws-sdk/credential-providers` and `@smithy/*`, and
 *  Nitro traces a dynamic import into the bundle whether or not it can run — so
 *  keeping the two together would ship megabytes of AWS SDK into a Vercel
 *  serverless function that never calls it. */
export async function startWorkerCredentialRefresh(
	env: Record<string, string | undefined> = process.env,
): Promise<NodeJS.Timeout> {
	if (getDeploymentModeFromEnv(env) !== "cloud") {
		return startCredentialRefresh(instanceCredentialSource, { required: false });
	}
	const { createInfisicalCredentialLoader } = await import("@workspace/cloud/infisical-credentials");
	return startCredentialRefresh(createInfisicalCredentialLoader({ env }), { required: true });
}
