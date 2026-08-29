/**
 * The organization and brand a page is about, read off the two layouts that
 * resolved them.
 *
 * Looked up by route id rather than sniffed out of whichever match happens to
 * carry a likely-looking field: a second parser is how the trail, the tab
 * title, and the address bar drift apart. One lookup answers for all of them.
 */
import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import type { OrganizationSummary } from "@/lib/organizations/types";

export const ORG_ROUTE_ID = "/_authed/app/org/$org";
export const BRAND_ROUTE_ID = "/_authed/app/org/$org/brand/$brand";

/** Only the shapes this reads; both layouts' loaders return more. */
interface SubjectMatch {
	routeId: string;
	loaderData?: unknown;
}

export interface RouteSubjects {
	organizationName?: string;
	brandName?: string;
}

/**
 * Either may be absent mid-load, when the layout that resolves it hasn't
 * finished — the trail leaves that crumb out, and a title falls back to the app
 * name until it arrives.
 */
export function routeSubjects(matches: SubjectMatch[]): RouteSubjects {
	const subjects: RouteSubjects = {};
	for (const match of matches) {
		if (match.routeId === ORG_ROUTE_ID) {
			subjects.organizationName = (match.loaderData as OrganizationSummary | undefined)?.name;
		}
		if (match.routeId === BRAND_ROUTE_ID) {
			subjects.brandName = (match.loaderData as { brand?: BrandWithPrompts } | undefined)?.brand?.name;
		}
	}
	return subjects;
}
