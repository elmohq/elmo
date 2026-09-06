import { useRouteContext } from "@tanstack/react-router";

export function useLooseRouteContext() {
	return useRouteContext({ strict: false });
}

export function useViewer(): { isAdmin: boolean; hasReportAccess: boolean } {
	const context = useLooseRouteContext();
	return { isAdmin: context.isAdmin ?? false, hasReportAccess: context.hasReportAccess ?? false };
}
