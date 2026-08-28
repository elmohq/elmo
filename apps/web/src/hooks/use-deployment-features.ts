import { useRouteContext } from "@tanstack/react-router";
import type { PublicClientConfig } from "@/server/config";

/**
 * What this deployment lets the viewer do.
 *
 * The root route resolves the client config into route context; reading it
 * `strict: false` means the type has to be named here rather than inferred, and
 * naming it once is what keeps the cast from being repeated at every component
 * that asks about a feature.
 *
 * Undefined until the root's `beforeLoad` settles, so callers decide what a
 * feature means before the answer arrives rather than being handed a default.
 */
export function useDeploymentFeatures(): PublicClientConfig["features"] | undefined {
	const context = useRouteContext({ strict: false }) as { clientConfig?: PublicClientConfig };
	return context.clientConfig?.features;
}

/** How this deployment presents itself — its name, icon, and parent dashboard. */
export function useBranding(): PublicClientConfig["branding"] | undefined {
	const context = useRouteContext({ strict: false }) as { clientConfig?: PublicClientConfig };
	return context.clientConfig?.branding;
}
