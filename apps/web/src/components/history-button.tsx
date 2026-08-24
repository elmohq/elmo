import { GoStack } from "react-icons/go";
import { buttonVariants } from "@workspace/ui/components/button";
import { cn } from "@workspace/ui/lib/utils";
import { Link } from "@tanstack/react-router";

interface HistoryButtonProps {
	brandId?: string;
	promptName?: string;
	promptId?: string;
	/** Prompt-details tab to land on (e.g. "web-queries"); defaults to the first tab. */
	tab?: "mentions" | "web-queries" | "citations" | "responses";
}

export function HistoryButton({ brandId, promptName, promptId, tab }: HistoryButtonProps) {
	if (!brandId || !promptId) {
		return null;
	}

	return (
		<Link
			to="/app/$brand/prompts/$promptId"
			params={{ brand: brandId, promptId }}
			search={tab ? { tab } : undefined}
			// No size variant: this button sets its own compact height and padding, and the
			// size variants' has-[>svg] padding would outrank a plain px override.
			className={cn(
				buttonVariants({ variant: "secondary", size: null }),
				"text-xs cursor-pointer h-6 gap-0 px-2",
			)}
		>
			<GoStack className="size-3 mr-0.5" />
			<span className="text-xs font-normal">View Details</span>
		</Link>
	);
}
