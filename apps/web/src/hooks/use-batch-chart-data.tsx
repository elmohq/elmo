import { useQuery } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { fromBatchChartColumns } from "@/lib/chart-utils";
import type { LookbackPeriod } from "@/lib/lookback";
import { browserTimezone } from "@/lib/viewer-timezone";
import { getBatchChartDataFn } from "@/server/visibility";

export interface BatchChartDataFilters {
	lookback?: LookbackPeriod;
	model?: string;
}

export const batchChartDataQuery = (brandId: string, filters: BatchChartDataFilters | undefined, timezone: string) => ({
	queryKey: ["batch-chart-data", brandId, filters?.lookback, filters?.model, timezone],
	queryFn: () =>
		getBatchChartDataFn({
			data: { brandId, lookback: filters?.lookback || "1m", model: filters?.model, timezone },
		}),
	staleTime: 60_000,
});

export function useBatchChartData(brandId?: string, filters?: BatchChartDataFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	// The server renders the loading state even when a loader sent the data along.
	const hydrated = useHydrated();

	const query = useQuery({
		...batchChartDataQuery(resolvedBrandId || "", filters, browserTimezone()),
		enabled: !!resolvedBrandId,
		refetchOnWindowFocus: false,
		refetchOnReconnect: true,
		placeholderData: (prev) => prev,
		select: (response) => ({ ...response, chartData: fromBatchChartColumns(JSON.parse(response.chartData)) }),
	});

	return {
		data: hydrated ? query.data : undefined,
		isLoading: !hydrated || query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}
