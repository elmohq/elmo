import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import { type PromptScopeFilters, promptScopeParams } from "@/lib/prompt-scope";
import { getBatchChartDataFn } from "@/server/visibility";

export interface BatchChartDataFilters extends PromptScopeFilters {
	lookback?: LookbackPeriod;
	model?: string;
	/** Tag filter (resolved to prompt IDs server-side). */
	/** Search term applied to prompt text (resolved server-side). */
	search?: string;
}

export function useBatchChartData(brandId?: string, filters?: BatchChartDataFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: [
			"batch-chart-data",
			resolvedBrandId,
			filters?.lookback,
			filters?.model,
			filters?.tags?.join(","),
			filters?.search,
		],
		queryFn: () =>
			getBatchChartDataFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters?.lookback || "1m",
					model: filters?.model,
					...promptScopeParams(filters),
					search: filters?.search,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 60_000,
		refetchOnWindowFocus: false,
		refetchOnReconnect: true,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}
