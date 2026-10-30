import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { computeBrandData } from "@/lib/brand-data/client";
import type { LookbackPeriod } from "@/lib/lookback";

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
			computeBrandData("dashboardSummary", {
				brandId: resolvedBrandId!,
				lookback: filters.lookback,
				model: filters.model,
				tags: filters.tags?.join(","),
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			}),
		enabled: !!resolvedBrandId,
		staleTime: 5 * 60_000,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}
