import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { brandDataQuery, computeBrandData } from "@/lib/brand-data/client";
import type { LookbackPeriod } from "@/lib/lookback";

export interface QueryFanoutFilters {
	lookback?: LookbackPeriod;
	model?: string;
	/** Tag filter (resolved to prompt IDs server-side, like Share of Voice). */
	tags?: string[];
	/** Scope to one prompt (prompt-details Web Queries tab) — lists come back uncapped. */
	promptId?: string;
}

const queryFanoutKeys = {
	all: ["query-fanout"] as const,
	list: (brandId: string, filters?: QueryFanoutFilters) => [...queryFanoutKeys.all, brandId, filters] as const,
};

export function useQueryFanout(brandId?: string, filters?: QueryFanoutFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: queryFanoutKeys.list(resolvedBrandId || "", filters),
		queryFn: () =>
			computeBrandData("queryFanout", {
				brandId: resolvedBrandId!,
				lookback: filters?.lookback ?? "1m",
				model: filters?.model,
				tags: filters?.tags?.join(","),
				promptId: filters?.promptId,
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
