import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import { getCitationFlowFn, getCitationsFn } from "@/server/citations";

export interface CitationFilters {
	lookback?: LookbackPeriod;
	tags?: string[];
	model?: string;
}

export const citationKeys = {
	all: ["citations"] as const,
	list: (brandId: string, filters?: CitationFilters) => [...citationKeys.all, brandId, filters] as const,
};

export function useCitations(brandId?: string, filters?: CitationFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: citationKeys.list(resolvedBrandId || "", filters),
		queryFn: () =>
			getCitationsFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters?.lookback ?? "1w",
					tags: filters?.tags?.join(","),
					model: filters?.model,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchInterval: 60_000,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}

/** One domain's citations per engine and page, under the same filters as the rest of the Citations page. */
export function useCitationFlow(brandId: string | undefined, filters: CitationFilters, domain: string | undefined) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	return useQuery({
		queryKey: [...citationKeys.list(resolvedBrandId || "", filters), "flow", domain] as const,
		queryFn: () =>
			getCitationFlowFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters.lookback ?? "1w",
					tags: filters.tags?.join(","),
					model: filters.model,
					domain: domain!,
				},
			}),
		enabled: !!resolvedBrandId && !!domain,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchInterval: 60_000,
		// Keep the chart up while a filter changes, but never show one domain's flow under another's name.
		placeholderData: (prev, prevQuery) => (prevQuery?.queryKey.at(-1) === domain ? prev : undefined),
	});
}
