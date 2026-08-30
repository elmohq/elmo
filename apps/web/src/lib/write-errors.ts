import { useCallback } from "react";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { READ_ONLY_ERROR, READ_ONLY_MESSAGE } from "@/lib/auth/policies";

const READ_ONLY_REFUSED = "Edits are not allowed in demo mode.";

function isReadOnlyRefusal(message: string): boolean {
	return message.includes(READ_ONLY_MESSAGE) || message.includes(READ_ONLY_ERROR);
}

export function useWriteErrorMessage(): (error: unknown, fallback: string) => string {
	const readOnly = useDeploymentFeatures()?.readOnly ?? false;

	return useCallback(
		(error: unknown, fallback: string) => {
			const message = error instanceof Error ? error.message : "";
			if (isReadOnlyRefusal(message)) return READ_ONLY_REFUSED;
			if (message) return message;
			return readOnly ? READ_ONLY_REFUSED : fallback;
		},
		[readOnly],
	);
}
