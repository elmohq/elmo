import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { brandDataQuery, computeBrandData } from "@/lib/brand-data/client";
import type { LookbackPeriod } from "@/lib/lookback";

export interface BatchChartDataFilters {
	lookback?: LookbackPeriod;
	model?: string;
	/** Tag filter (resolved to prompt IDs server-side). */
	tags?: string[];
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
			computeBrandData("batchChartData", {
				brandId: resolvedBrandId!,
				lookback: filters?.lookback || "1m",
				model: filters?.model,
				tags: filters?.tags?.join(","),
				search: filters?.search,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			}),
		enabled: !!resolvedBrandId,
		...brandDataQuery,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}
