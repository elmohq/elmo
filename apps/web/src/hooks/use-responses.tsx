import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import type { ResponseSort, SentimentFilter } from "@/lib/sentiment";
import { getResponseSentimentCountsFn, searchResponsesFn } from "@/server/responses";

export interface ResponseSearchFilters {
	query?: string;
	lookback?: LookbackPeriod;
	model?: string;
	tags?: string[];
	promptIds?: string[];
	sentiment?: SentimentFilter;
	sort?: ResponseSort;
	page?: number;
}

const responsesKeys = {
	all: ["responses"] as const,
	search: (brandId: string, filters?: ResponseSearchFilters) => [...responsesKeys.all, brandId, filters] as const,
};

const scopeParams = (brandId: string, filters?: ResponseSearchFilters) => ({
	brandId,
	query: filters?.query || undefined,
	lookback: filters?.lookback ?? "1m",
	model: filters?.model,
	tags: filters?.tags?.join(","),
	prompts: filters?.promptIds?.length ? filters.promptIds.join(",") : undefined,
	timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
});

/** Independent of the sentiment filter, sort and page. */
export function useResponseSentimentCounts(brandId?: string, filters?: ResponseSearchFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const params = scopeParams(resolvedBrandId || "", filters);
	return useQuery({
		queryKey: [...responsesKeys.all, "sentiments", params] as const,
		queryFn: () => getResponseSentimentCountsFn({ data: params }),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		placeholderData: (prev) => prev,
	});
}

export function useResponseSearch(brandId?: string, filters?: ResponseSearchFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	return useQuery({
		queryKey: responsesKeys.search(resolvedBrandId || "", filters),
		queryFn: () =>
			searchResponsesFn({
				data: {
					...scopeParams(resolvedBrandId!, filters),
					sentiment: filters?.sentiment,
					sort: filters?.sort ?? "newest",
					page: filters?.page ?? 0,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		placeholderData: (prev) => prev,
	});
}
