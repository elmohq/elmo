import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { type DashboardSummaryResponse, getDashboardSummaryFn } from "@/server/dashboard";

export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";
export type { CitationTimeSeriesPoint, DashboardSummaryResponse, VisibilityTimeSeriesPoint } from "@/server/dashboard";

export const dashboardKeys = {
	all: ["dashboard"] as const,
	summary: (brandId: string, lookback: LookbackPeriod) => [...dashboardKeys.all, "summary", brandId, lookback] as const,
};

export function useDashboardSummary(brandId?: string, lookback: LookbackPeriod = "1m") {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: dashboardKeys.summary(resolvedBrandId || "", lookback),
		queryFn: () =>
			getDashboardSummaryFn({
				data: {
					brandId: resolvedBrandId!,
					lookback,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
		refetchInterval: 60_000, // Auto-refresh every 60 seconds
		placeholderData: (prev) => prev, // Keep previous data while refetching with new filters
	});

	return {
		dashboardSummary: query.data,
		isLoading: query.isLoading,
		isError: query.error,
		revalidate: query.refetch,
	};
}
