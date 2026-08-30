import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useBrandParams } from "@/hooks/use-route-params";
import type { PromptDetailTab } from "@/lib/prompt-detail-tabs";

export type PromptDetailSearch = { tab: PromptDetailTab };

export function BrandPromptLink({
	promptId,
	search,
	className,
	children,
}: {
	promptId: string;
	search?: PromptDetailSearch;
	className?: string;
	children: ReactNode;
}) {
	const params = useBrandParams();

	return (
		<Link
			to="/app/org/$org/brand/$brand/prompts/$promptId"
			params={{ ...params, promptId }}
			search={search}
			className={className}
		>
			{children}
		</Link>
	);
}
