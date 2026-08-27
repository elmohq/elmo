import { Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { GoStack } from "react-icons/go";
import { useBrandSlug, useOrgSlug } from "@/hooks/use-workspaces";

interface HistoryButtonProps {
	brandId?: string;
	promptName?: string;
	promptId?: string;
	/** Prompt-details tab to land on (e.g. "web-queries"); defaults to the first tab. */
	tab?: "mentions" | "web-queries" | "citations" | "responses";
}

export function HistoryButton({ brandId, promptName, promptId, tab }: HistoryButtonProps) {
	const org = useOrgSlug();
	const brand = useBrandSlug();
	if (!brandId || !promptId) {
		return null;
	}

	return (
		<Button size="sm" variant="secondary" className="text-xs cursor-pointer h-6 flex items-center px-2" asChild>
			<Link
				to="/app/org/$org/brand/$brand/prompts/$promptId"
				params={{ org, brand, promptId }}
				search={tab ? { tab } : undefined}
			>
				<GoStack className="size-3 mr-0.5" />
				<span className="text-xs font-normal">View Details</span>
			</Link>
		</Button>
	);
}
