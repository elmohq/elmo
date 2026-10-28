import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { GoStack } from "react-icons/go";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import type { PromptDetailTab } from "@/lib/prompt-detail-tabs";

interface HistoryButtonProps {
	promptId?: string;
	/** Defaults to the first tab. */
	tab?: PromptDetailTab;
}

export function HistoryButton({ promptId, tab }: HistoryButtonProps) {
	if (!promptId) return null;

	return (
		<BrandPromptLink
			promptId={promptId}
			search={tab ? { tab } : undefined}
			className={cn(
				buttonVariants({ variant: "secondary", size: "sm" }),
				"text-xs cursor-pointer h-6 flex items-center px-2",
			)}
		>
			<GoStack className="size-3 mr-0.5" />
			<span className="text-xs font-normal">View Details</span>
		</BrandPromptLink>
	);
}
