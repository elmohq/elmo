import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { getPromptOpportunitiesFn } from "@/server/analysis";
import type { LookbackPeriod } from "@/lib/chart-utils";

export interface PromptOpportunitiesFilters {
	lookback?: LookbackPeriod;
	model?: string;
	/** Tag filter (resolved to prompt IDs server-side, like the visibility page). */
	tags?: string[];
}

export const opportunitiesKeys = {
	all: ["prompt-opportunities"] as const,
	list: (brandId: string, filters?: PromptOpportunitiesFilters) =>
		[...opportunitiesKeys.all, brandId, filters] as const,
};

export function usePromptOpportunities(brandId?: string, filters?: PromptOpportunitiesFilters) {
	const params = useParams({ strict: false }) as { brand?: string };
	const resolvedBrandId = brandId || params.brand;

	const query = useQuery({
		queryKey: opportunitiesKeys.list(resolvedBrandId || "", filters),
		queryFn: () =>
			getPromptOpportunitiesFn({
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
		isError: query.error,
		revalidate: query.refetch,
	};
}
