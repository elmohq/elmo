import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { getPromptOpportunitiesFn } from "@/server/analysis";

export interface PromptOpportunitiesFilters {
	days?: number;
	model?: string;
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
					days: filters?.days ?? 42,
					model: filters?.model,
					tags: filters?.tags?.join(","),
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
