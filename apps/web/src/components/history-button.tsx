import { Button } from "@workspace/ui/components/button";
import { GoStack } from "react-icons/go";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { useBrandParams } from "@/hooks/use-workspaces";

interface HistoryButtonProps {
	promptId?: string;
	/** Prompt-details tab to land on (e.g. "web-queries"); defaults to the first tab. */
	tab?: "mentions" | "web-queries" | "citations" | "responses";
}

export function HistoryButton({ promptId, tab }: HistoryButtonProps) {
	const brandParams = useBrandParams();

	// A button labelled "View Details" with nowhere to go is worse than no
	// button, so this one is absent rather than inert off a brand page.
	if (!brandParams || !promptId) return null;

	return (
		<Button size="sm" variant="secondary" className="text-xs cursor-pointer h-6 flex items-center px-2" asChild>
			<BrandPromptLink promptId={promptId} search={tab ? { tab } : undefined}>
				<GoStack className="size-3 mr-0.5" />
				<span className="text-xs font-normal">View Details</span>
			</BrandPromptLink>
		</Button>
	);
}
