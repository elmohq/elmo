/**
 * The organization and brand a page is about, read off the two layouts that
 * resolved them.
 *
 * Looked up by route id rather than sniffed out of whichever match happens to
 * carry a likely-looking field: a second parser is how the trail, the tab
 * title, and the address bar drift apart. One lookup answers for all of them.
 */
import type { FileRoutesById } from "@/routeTree.gen";

// `satisfies` so a layout that moves is a compile error rather than a crumb
// that quietly stops appearing.
export const ORG_ROUTE_ID = "/_authed/app/org/$org" satisfies keyof FileRoutesById;
export const BRAND_ROUTE_ID = "/_authed/app/org/$org/brand/$brand" satisfies keyof FileRoutesById;

type LoaderDataOf<Id extends keyof FileRoutesById> = FileRoutesById[Id]["types"]["loaderData"];

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
			subjects.organizationName = (match.loaderData as LoaderDataOf<typeof ORG_ROUTE_ID> | undefined)?.name;
		}
		if (match.routeId === BRAND_ROUTE_ID) {
			subjects.brandName = (match.loaderData as LoaderDataOf<typeof BRAND_ROUTE_ID> | undefined)?.brand?.name;
		}
	}
	return subjects;
}
