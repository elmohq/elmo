import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { getCitationInsightsFn } from "@/server/citation-insights";

export interface CitationInsightsFilters {
	days?: number;
	tags?: string[];
	model?: string;
}

export const citationInsightsKeys = {
	all: ["citation-insights"] as const,
	list: (brandId: string, filters?: CitationInsightsFilters) => [...citationInsightsKeys.all, brandId, filters] as const,
};

/**
 * Loads the experimental citation-landscape insights. Polls every 3s while the
 * DR cache is still warming (`pending > 0`), then stops.
 */
export function useCitationInsights(brandId?: string, filters?: CitationInsightsFilters) {
	const params = useParams({ strict: false }) as { brand?: string };
	const resolvedBrandId = brandId || params.brand;

	const query = useQuery({
		queryKey: citationInsightsKeys.list(resolvedBrandId || "", filters),
		queryFn: () =>
			getCitationInsightsFn({
				data: {
					brandId: resolvedBrandId!,
					days: filters?.days || 7,
					tags: filters?.tags?.join(","),
					model: filters?.model,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		placeholderData: (prev) => prev,
		refetchInterval: (query) => (query.state.data?.pending ? 3000 : false),
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		isError: query.error,
		refetch: query.refetch,
	};
}
