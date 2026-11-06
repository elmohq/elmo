import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import { getDashboardSummaryFn } from "@/server/dashboard";

export interface DashboardFilters {
	lookback: LookbackPeriod;
	model?: string;
	tags?: string[];
}

export const dashboardKeys = {
	all: ["dashboard"] as const,
	summary: (brandId: string, filters: DashboardFilters) => [...dashboardKeys.all, "summary", brandId, filters] as const,
};

export function useDashboardSummary(brandId?: string, filters: DashboardFilters = { lookback: "1m" }) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: dashboardKeys.summary(resolvedBrandId || "", filters),
		queryFn: () =>
			getDashboardSummaryFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters.lookback,
					model: filters.model,
					tags: filters.tags?.join(","),
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
