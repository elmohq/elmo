import { IconAlertTriangle } from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";

export function RunDelayAlert({ overduePrompts, totalPrompts }: { overduePrompts: number; totalPrompts: number }) {
	if (overduePrompts === 0) return null;

	return (
		<Alert className="border-amber-500/30 bg-amber-500/10 text-amber-900">
			<IconAlertTriangle />
			<AlertTitle>Runs Are Delayed</AlertTitle>
			<AlertDescription className="text-amber-900/80">
				{overduePrompts} of {totalPrompts} prompts haven't completed a run on schedule, so the data shown here may be
				out of date. Check that the worker is running and look in its logs for errors such as a missing API key.
			</AlertDescription>
		</Alert>
	);
}
