import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { getDomainRatingsFn } from "@/server/domain-ratings";

export interface DomainRatingFilters {
	days?: number;
	tags?: string[];
	model?: string;
}

export const domainRatingKeys = {
	all: ["domain-ratings"] as const,
	list: (brandId: string, filters?: DomainRatingFilters) => [...domainRatingKeys.all, brandId, filters] as const,
};

/**
 * Loads DR ↔ citation correlation data for a brand. While the cache is still
 * warming (`pending > 0`) the query re-polls every 3s so the section fills in,
 * then stops automatically once everything is resolved.
 */
export function useDomainRatings(brandId?: string, filters?: DomainRatingFilters) {
	const params = useParams({ strict: false }) as { brand?: string };
	const resolvedBrandId = brandId || params.brand;

	const query = useQuery({
		queryKey: domainRatingKeys.list(resolvedBrandId || "", filters),
		queryFn: () =>
			getDomainRatingsFn({
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
