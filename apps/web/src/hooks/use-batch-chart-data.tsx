import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { fromBatchChartColumns } from "@/lib/chart-utils";
import type { LookbackPeriod } from "@/lib/lookback";
import { getBatchChartDataFn } from "@/server/visibility";

export interface BatchChartDataFilters {
	lookback?: LookbackPeriod;
	model?: string;
}

export function useBatchChartData(brandId?: string, filters?: BatchChartDataFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: ["batch-chart-data", resolvedBrandId, filters?.lookback, filters?.model],
		queryFn: () =>
			getBatchChartDataFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters?.lookback || "1m",
					model: filters?.model,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 60_000,
		refetchOnWindowFocus: false,
		refetchOnReconnect: true,
		placeholderData: (prev) => prev,
		select: (response) => ({ ...response, chartData: fromBatchChartColumns(JSON.parse(response.chartData)) }),
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}
