import type { QueryClient } from "@tanstack/react-query";
import { getPaywallStateFn } from "@/server/billing";

export const paywallQuery = {
	queryKey: ["paywall"] as const,
	queryFn: () => getPaywallStateFn({ data: {} }),
	staleTime: 30_000,
};

export function forgetPaywall(queryClient: QueryClient): void {
	queryClient.removeQueries({ queryKey: paywallQuery.queryKey });
}
