import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import type { OrganizationSummary } from "@/lib/organizations/types";
import { routeSubjects } from "@/lib/route-subject";

export type ShellSection = "brand" | "organization" | "admin" | "account";

declare module "@tanstack/react-router" {
	interface StaticDataRouteOption {
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

export function selectShellScope(matches: ScopeMatch[]): ShellScope | null {
	let section: ShellSection | undefined;
	for (const match of matches) section = match.staticData.shell ?? section;
	if (!section) return null;
	return { section, ...routeSubjects(matches) };
}
