import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import { getDashboardSummaryFn } from "@/server/dashboard";

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
