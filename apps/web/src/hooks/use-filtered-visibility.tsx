import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { computeBrandData } from "@/lib/brand-data/client";
import type { LookbackPeriod } from "@/lib/lookback";

export interface FilteredVisibilityFilters {
	lookback?: LookbackPeriod;
	model?: string;
	/** Tag filter (resolved to prompt IDs server-side). */
	tags?: string[];
	/** Search term applied to prompt text (resolved server-side). */
	search?: string;
}

export function useFilteredVisibility(brandId?: string, filters?: FilteredVisibilityFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: [
			"filtered-visibility",
			resolvedBrandId,
			filters?.lookback,
			filters?.model,
			filters?.tags?.join(","),
			filters?.search,
		],
		queryFn: () =>
			computeBrandData("filteredVisibility", {
				brandId: resolvedBrandId!,
				lookback: filters?.lookback || "1m",
				model: filters?.model,
				tags: filters?.tags?.join(","),
				search: filters?.search,
				timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			}),
		enabled: !!resolvedBrandId,
		staleTime: 5 * 60_000,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		error: query.error,
		refetch: query.refetch,
	};
}
