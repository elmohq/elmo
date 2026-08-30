import { useRouteContext } from "@tanstack/react-router";
import type { PublicClientConfig } from "@/server/config";

export interface LooseRouteContext {
	clientConfig?: PublicClientConfig;
	isAdmin?: boolean;
	hasReportAccess?: boolean;
	brandId?: string;
}

export function useLooseRouteContext(): LooseRouteContext {
	return useRouteContext({ strict: false }) as LooseRouteContext;
}

export function useViewer(): { isAdmin: boolean; hasReportAccess: boolean } {
	const context = useLooseRouteContext();
	return { isAdmin: context.isAdmin ?? false, hasReportAccess: context.hasReportAccess ?? false };
}
