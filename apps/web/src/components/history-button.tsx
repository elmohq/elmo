
import { GoStack } from "react-icons/go";
import { Button } from "@workspace/ui/components/button";
import { Link } from "@tanstack/react-router";

interface HistoryButtonProps {
	brandId?: string;
	promptName?: string;
	promptId?: string;
}

export function HistoryButton({
	brandId,
	promptName,
	promptId,
}: HistoryButtonProps) {
	if (!brandId || !promptId) {
		return null;
	}

	const historyUrl = `/app/${brandId}/prompts/${promptId}`;

	return (
		<Button
			size="sm"
			variant="secondary"
			className="text-xs cursor-pointer h-6 flex items-center px-2"
			render={<Link to={historyUrl} />}
		>
			<GoStack className="size-3 mr-0.5" />
			<span className="text-xs font-normal">View Details</span>
		</Button>
	);
}
