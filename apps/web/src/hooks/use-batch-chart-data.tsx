import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { getBatchChartDataFn, type BatchChartDataResponse } from "@/server/visibility";

export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

export interface BatchChartDataFilters {
	lookback?: LookbackPeriod;
	model?: string;
	promptIds: string[];
}

export function useBatchChartData(brandId?: string, filters?: BatchChartDataFilters) {
	const params = useParams({ strict: false }) as { brand?: string };
	const resolvedBrandId = brandId || params.brand;

	const hasPromptIds = (filters?.promptIds?.length ?? 0) > 0;

	const query = useQuery({
		queryKey: [
			"batch-chart-data",
			resolvedBrandId,
			filters?.lookback,
			filters?.model,
			filters?.promptIds?.join(","),
		],
		queryFn: () =>
			getBatchChartDataFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters?.lookback || "1m",
					model: filters?.model,
					promptIds: filters?.promptIds || [],
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			}),
		enabled: !!resolvedBrandId && hasPromptIds,
		staleTime: 60_000,
		refetchOnWindowFocus: false,
		refetchOnReconnect: true,
		placeholderData: (prev) => prev, // Keep previous data while loading
	});

	return {
		batchChartData: query.data,
		isLoading: query.isLoading,
		isValidating: query.isFetching,
		isError: query.error,
		revalidate: query.refetch,
	};
}
