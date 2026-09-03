import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { routeSubjects } from "@/lib/route-subject";

/**
 * Which section's shell wraps a route:
 *  - "brand":        a brand's own pages
 *  - "organization": an organization's settings
 *  - "admin":        the admin section and the reports list
 *  - "account":      a gate the user has to clear first, so nothing to reach
 */
export type ShellSection = "brand" | "organization" | "admin" | "account";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/**
		 * The shell for this route and everything under it. A page whose matches
		 * declare none stands alone, without a shell: the pickers, onboarding,
		 * the printable report.
		 */
		shell?: ShellSection;
	}
}

export interface ShellScope {
	section: ShellSection;
	organization?: OrganizationSummary;
	brand?: BrandWithPrompts;
}

interface ScopeMatch {
	routeId: string;
	staticData: { shell?: ShellSection };
	loaderData?: unknown;
}

/**
 * The deepest matched route that declares a shell decides which section it is.
 * The organization and brand come from their layouts' loader data, never from
 * route context: loader data is the route's cached data and stays put through
 * every load state, while beforeLoad context is rebuilt on each navigation.
 */
export function selectShellScope(matches: ScopeMatch[]): ShellScope | null {
	let section: ShellSection | undefined;
	for (const match of matches) section = match.staticData.shell ?? section;
	if (!section) return null;
	return { section, ...routeSubjects(matches) };
}
