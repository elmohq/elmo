import { IconAlertTriangle } from "@tabler/icons-react";
import { Alert, AlertTitle } from "@workspace/ui/components/alert";
import type { ReactNode } from "react";
import { useDeploymentFeatures } from "@/hooks/use-deployment-features";

export function DemoModeAlert({ children }: { children: ReactNode }) {
	const readOnly = useDeploymentFeatures()?.readOnly ?? false;
	if (!readOnly) return null;

	return (
		<Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
			<IconAlertTriangle />
			<AlertTitle>{children}</AlertTitle>
		</Alert>
	);
}
