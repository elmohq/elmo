import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { routeSubjects } from "@/lib/route-subject";

/**
 * Which rail the shell draws:
 *  - "brand":        a brand's own pages
 *  - "organization": an organization's settings
 *  - "admin":        the admin section and the reports list
 *  - "account":      a gate the user has to clear first, so nothing to reach
 */
export type NavScope = "brand" | "organization" | "admin" | "account";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
		/**
		 * The rail for this route and everything under it. A page whose matches
		 * declare none stands alone, without the shell: the pickers, onboarding,
		 * the printable report.
		 */
		nav?: NavScope;
	}
}

export interface AppChrome {
	nav: NavScope;
	organization?: OrganizationSummary;
	brand?: BrandWithPrompts;
}

interface ChromeMatch {
	routeId: string;
	staticData: { nav?: NavScope };
	loaderData?: unknown;
}

/**
 * The deepest matched route that declares a rail decides which one. The
 * organization and brand come from their layouts' loader data, never from route
 * context: loader data is the route's cached data and stays put through every
 * load state, while beforeLoad context is rebuilt on each navigation.
 */
export function selectAppChrome(matches: ChromeMatch[]): AppChrome | null {
	let nav: NavScope | undefined;
	for (const match of matches) nav = match.staticData.nav ?? nav;
	if (!nav) return null;
	return { nav, ...routeSubjects(matches) };
}
