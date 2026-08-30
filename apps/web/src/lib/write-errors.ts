import { useCallback } from "react";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";

/**
 * A read-only deployment refuses writes at the edge, so the browser gets a bare
 * 403 whose body never reaches the caller — the deployment, not the response,
 * is what can say why.
 */
const READ_ONLY_REFUSED = "Edits are not allowed in demo mode.";

export function useWriteErrorMessage(): (error: unknown, fallback: string) => string {
	const readOnly = useDeploymentFeatures()?.readOnly ?? false;

	return useCallback(
		(error: unknown, fallback: string) => {
			if (readOnly) return READ_ONLY_REFUSED;
			return error instanceof Error && error.message ? error.message : fallback;
		},
		[readOnly],
	);
}
