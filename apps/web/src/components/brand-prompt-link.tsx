import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useBrandParams } from "@/hooks/use-route-params";

/** Which tab of the prompt detail page to land on. */
export type PromptDetailSearch = { tab: "mentions" | "web-queries" | "citations" | "responses" };

/**
 * A link to a prompt's detail page, for the five places that offer one.
 *
 * Whether there is a page to link to is the route's answer, not the caller's,
 * so it is made here once: outside a brand page the content renders as plain
 * text instead.
 */
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
	/**
	 * Used instead of `className` when there is nothing to link to, for the one
	 * caller whose link class carries `group` — on a plain span that would
	 * underline text leading nowhere.
	 */
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
