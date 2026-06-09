import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { getQueryFanoutFn } from "@/server/query-fanout";
import type { LookbackPeriod } from "@/lib/chart-utils";

export interface QueryFanoutFilters {
	lookback?: LookbackPeriod;
	model?: string;
	/** Tag filter (resolved to prompt IDs server-side, like Share of Voice). */
	tags?: string[];
}

export const queryFanoutKeys = {
	all: ["query-fanout"] as const,
	list: (brandId: string, filters?: QueryFanoutFilters) => [...queryFanoutKeys.all, brandId, filters] as const,
};

export function useQueryFanout(brandId?: string, filters?: QueryFanoutFilters) {
	const params = useParams({ strict: false }) as { brand?: string };
	const resolvedBrandId = brandId || params.brand;

	const query = useQuery({
		queryKey: queryFanoutKeys.list(resolvedBrandId || "", filters),
		queryFn: () =>
			getQueryFanoutFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters?.lookback ?? "1m",
					model: filters?.model,
					tags: filters?.tags?.join(","),
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isError: !!query.error,
		revalidate: query.refetch,
	};
}
