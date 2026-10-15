import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import type { ResponseSort, ToneFilter } from "@/lib/tone";
import { getResponseToneCountsFn, searchResponsesFn } from "@/server/responses";

export interface ResponseSearchFilters {
	query?: string;
	lookback?: LookbackPeriod;
	model?: string;
	tags?: string[];
	promptIds?: string[];
	sentiment?: ToneFilter;
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

/** How the search's matches split by tone; unchanged by the tone filter, sort or page. */
export function useResponseToneCounts(brandId?: string, filters?: ResponseSearchFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const params = scopeParams(resolvedBrandId || "", filters);
	return useQuery({
		queryKey: [...responsesKeys.all, "tones", params] as const,
		queryFn: () => getResponseToneCountsFn({ data: params }),
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
