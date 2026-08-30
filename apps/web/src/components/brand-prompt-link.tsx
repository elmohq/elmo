import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useBrandParams } from "@/hooks/use-route-params";

export type PromptDetailSearch = { tab: "mentions" | "web-queries" | "citations" | "responses" };

export function BrandPromptLink({
	promptId,
	search,
	className,
	fallbackClassName,
	children,
}: {
	promptId: string;
	search?: PromptDetailSearch;
	className?: string;
	fallbackClassName?: string;
	children: ReactNode;
}) {
	const params = useBrandParams();

	if (!params) return <span className={fallbackClassName ?? className}>{children}</span>;

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
