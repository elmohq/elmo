/**
 * The connection pages hand out steps somebody is meant to follow elsewhere, and
 * a read-only deployment refuses most of them. Each page says which of its own
 * steps won't work rather than sharing one vague sentence.
 */
import { IconAlertTriangle } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import type { ReactNode } from "react";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";

export function DemoModeAlert({ children }: { children: ReactNode }) {
	const readOnly = useDeploymentFeatures()?.readOnly ?? false;
	if (!readOnly) return null;

	return (
		<Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
			<IconAlertTriangle />
			<AlertTitle>Demo mode</AlertTitle>
			<AlertDescription className="text-amber-900/80 dark:text-amber-200/80">{children}</AlertDescription>
		</Alert>
	);
}
