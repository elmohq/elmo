import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { GoStack } from "react-icons/go";
import { BrandPromptLink } from "@/components/brand-prompt-link";
import { useBrandParams } from "@/hooks/use-route-params";

interface HistoryButtonProps {
	promptId?: string;
	/** Prompt-details tab to land on (e.g. "web-queries"); defaults to the first tab. */
	tab?: "mentions" | "web-queries" | "citations" | "responses";
}

export function HistoryButton({ promptId, tab }: HistoryButtonProps) {
	const brandParams = useBrandParams();

	if (!brandParams || !promptId) return null;

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
