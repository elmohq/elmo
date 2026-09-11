import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import { getPromptsSummaryFn } from "@/server/prompts";

export interface PromptsSummaryFilters {
	lookback?: LookbackPeriod;
	webSearchEnabled?: boolean;
	model?: string;
	tags?: string[];
}

export const promptsSummaryKeys = {
	all: ["prompts-summary"] as const,
	list: (brandId: string, filters?: PromptsSummaryFilters) => [...promptsSummaryKeys.all, brandId, filters] as const,
};

export function usePromptsSummary(brandId?: string, filters?: PromptsSummaryFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: promptsSummaryKeys.list(resolvedBrandId || "", filters),
		queryFn: () =>
			getPromptsSummaryFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters?.lookback || "1m",
					webSearchEnabled: filters?.webSearchEnabled?.toString(),
					model: filters?.model,
					tags: filters?.tags?.join(","),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		refetchInterval: 60_000,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}

/**
 * Hook to get an invalidation function for prompts summary cache.
 * Call at the top level of a component, then invoke the returned function in handlers.
 */
export function useInvalidatePromptsSummary() {
	const queryClient = useQueryClient();

	return (brandId: string) => {
		queryClient.invalidateQueries({
			queryKey: [...promptsSummaryKeys.all, brandId],
		});
	};
}
