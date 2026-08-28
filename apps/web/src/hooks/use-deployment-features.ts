import { useRouteContext } from "@tanstack/react-router";
import type { PublicClientConfig } from "@/server/config";

/**
 * `strict: false` can't infer the context type, so it is named here once rather
 * than cast at every component that asks about a feature.
 *
 * Undefined until the root's `beforeLoad` settles, so callers decide what a
 * missing answer means instead of being handed a default.
 */
export function useDeploymentFeatures(): PublicClientConfig["features"] | undefined {
	const context = useRouteContext({ strict: false }) as { clientConfig?: PublicClientConfig };
	return context.clientConfig?.features;
}

export function useBranding(): PublicClientConfig["branding"] | undefined {
	const context = useRouteContext({ strict: false }) as { clientConfig?: PublicClientConfig };
	return context.clientConfig?.branding;
}
