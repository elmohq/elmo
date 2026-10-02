import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import { searchResponsesFn } from "@/server/responses";

export interface ResponseSearchFilters {
	query?: string;
	lookback?: LookbackPeriod;
	model?: string;
	tags?: string[];
	promptIds?: string[];
	page?: number;
}

const responsesKeys = {
	all: ["responses"] as const,
	search: (brandId: string, filters?: ResponseSearchFilters) => [...responsesKeys.all, brandId, filters] as const,
};

export function useResponseSearch(brandId?: string, filters?: ResponseSearchFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	return useQuery({
		queryKey: responsesKeys.search(resolvedBrandId || "", filters),
		queryFn: () =>
			searchResponsesFn({
				data: {
					brandId: resolvedBrandId!,
					query: filters?.query || undefined,
					lookback: filters?.lookback ?? "1m",
					model: filters?.model,
					tags: filters?.tags?.join(","),
					prompts: filters?.promptIds?.length ? filters.promptIds.join(",") : undefined,
					page: filters?.page ?? 0,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		placeholderData: (prev) => prev,
	});
}
