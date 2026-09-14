import { useI18n } from "@/lib/i18n";
import { useCallback } from "react";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";
import { READ_ONLY_ERROR, READ_ONLY_MESSAGE, READ_ONLY_REFUSED } from "@/lib/read-only-errors";

function isReadOnlyRefusal(message: string): boolean {
	return message.includes(READ_ONLY_MESSAGE) || message.includes(READ_ONLY_ERROR);
}

export function useWriteErrorMessage(): (error: unknown, fallback: string) => string {
	const readOnly = useDeploymentFeatures()?.readOnly ?? false;
	const { t } = useI18n();

	return useCallback(
		(error: unknown, fallback: string) => {
			const message = error instanceof Error ? error.message : "";
			if (isReadOnlyRefusal(message)) return t(READ_ONLY_REFUSED);
			if (message) return t(message);
			return readOnly ? t(READ_ONLY_REFUSED) : t(fallback);
		},
		[readOnly, t],
	);
}
