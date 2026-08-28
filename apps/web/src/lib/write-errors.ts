import { useCallback } from "react";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";

/**
 * A read-only deployment refuses writes at the edge, before the server function
 * runs — the browser gets a bare 403 whose body never reaches the caller. So
 * the deployment, not the response, is what can say why.
 */
const READ_ONLY_REFUSED = "Edits are not allowed in demo mode.";

/**
 * Phrase a failed write for the person who attempted it.
 *
 * Everywhere else the server's own message is the specific one — a plan limit,
 * a name already taken — and the fallback is only for what isn't an Error at
 * all.
 *
 * Stable, so a handler wrapped in `useCallback` can depend on it without being
 * rebuilt on every render.
 */
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
