import type { QueryClient } from "@tanstack/react-query";
import { getPaywallStateFn } from "@/server/billing";

export const paywallQuery = {
	queryKey: ["paywall"] as const,
	queryFn: () => getPaywallStateFn({ data: {} }),
	staleTime: 30_000,
};

/**
 * Drops the cached answer so the next gate check asks the server. Invalidating
 * would leave the stale answer in place for `ensureQueryData` to hand back.
 */
export function forgetPaywall(queryClient: QueryClient): void {
	queryClient.removeQueries({ queryKey: paywallQuery.queryKey });
}
