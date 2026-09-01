import type { FileRoutesById } from "@/routeTree.gen";

// `satisfies` so a layout that moves is a compile error rather than a crumb
// that quietly stops appearing.
export const ORG_ROUTE_ID = "/_authed/app/org/$org" satisfies keyof FileRoutesById;
export const BRAND_ROUTE_ID = "/_authed/app/org/$org/brand/$brand" satisfies keyof FileRoutesById;
export const ORG_SETTINGS_ROUTE_ID = "/_authed/app/org/$org/settings" satisfies keyof FileRoutesById;
export const ADMIN_ROUTE_ID = "/_authed/admin" satisfies keyof FileRoutesById;
export const REPORTS_ROUTE_ID = "/_authed/reports/" satisfies keyof FileRoutesById;
export const CHOOSE_PLAN_ROUTE_ID = "/_authed/choose-plan" satisfies keyof FileRoutesById;

type ContextOf<Id extends keyof FileRoutesById> = FileRoutesById[Id]["types"]["allContext"];
type LoaderDataOf<Id extends keyof FileRoutesById> = FileRoutesById[Id]["types"]["loaderData"];

interface SubjectMatch {
	routeId: string;
	context?: unknown;
	loaderData?: unknown;
}

export interface RouteSubjects {
	organization?: ContextOf<typeof ORG_ROUTE_ID>["organization"];
	brand?: LoaderDataOf<typeof BRAND_ROUTE_ID>["brand"];
}

export function routeSubjects(matches: SubjectMatch[]): RouteSubjects {
	const subjects: RouteSubjects = {};
	for (const match of matches) {
		if (match.routeId === ORG_ROUTE_ID) {
			subjects.organization = (match.context as ContextOf<typeof ORG_ROUTE_ID> | undefined)?.organization;
		}
		if (match.routeId === BRAND_ROUTE_ID) {
			subjects.brand = (match.loaderData as LoaderDataOf<typeof BRAND_ROUTE_ID> | undefined)?.brand;
		}
	}
	return subjects;
}
