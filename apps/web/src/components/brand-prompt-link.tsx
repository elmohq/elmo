import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useBrandParams } from "@/hooks/use-workspaces";

/**
 * A link to a prompt's detail page, from anywhere inside a brand.
 *
 * Five places link here, and each used to decide for itself whether it could —
 * usually by testing a `brandId` prop while building the URL out of the route,
 * so the test and the target could disagree. The route is the only thing that
 * knows, so it answers here once: outside a brand page there is no such page to
 * link to, and the content renders as plain text instead.
 */
export function BrandPromptLink({
	promptId,
	search,
	className,
	fallbackClassName,
	children,
}: {
	promptId: string;
	search?: Record<string, unknown>;
	className?: string;
	/** Applied instead of `className` when there is nothing to link to. */
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
