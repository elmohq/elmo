import { useRouteContext } from "@tanstack/react-router";
import type { PublicClientConfig } from "@/server/config";

/**
 * What a component can read off the router without knowing which route it is
 * under. `strict: false` can't infer this, so it is named here once rather than
 * cast at each caller.
 *
 * Every field is optional because a component may render above the route that
 * provides it — `clientConfig` before the root's `beforeLoad` settles, the
 * viewer facts outside `_authed`, `brandId` outside a brand page. Callers
 * decide what a missing answer means rather than being handed a default.
 */
export interface LooseRouteContext {
	clientConfig?: PublicClientConfig;
	isAdmin?: boolean;
	hasReportAccess?: boolean;
	brandId?: string;
}

export function useLooseRouteContext(): LooseRouteContext {
	return useRouteContext({ strict: false }) as LooseRouteContext;
}

/** The two facts about the signed-in user every shell asks about, from `_authed`. */
export function useViewer(): { isAdmin: boolean; hasReportAccess: boolean } {
	const context = useLooseRouteContext();
	return { isAdmin: context.isAdmin ?? false, hasReportAccess: context.hasReportAccess ?? false };
}
