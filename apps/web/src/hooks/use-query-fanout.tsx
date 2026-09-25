import { useQuery } from "@tanstack/react-query";
import type { PromptType } from "@workspace/lib/prompt-type";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import { getQueryFanoutFn } from "@/server/query-fanout";

export interface QueryFanoutFilters {
	lookback?: LookbackPeriod;
	model?: string;
	/** Tag filter (resolved to prompt IDs server-side, like Share of Voice). */
	tags?: string[];
	type?: PromptType;
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
			getQueryFanoutFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters?.lookback ?? "1m",
					model: filters?.model,
					tags: filters?.tags?.join(","),
					type: filters?.type,
					promptId: filters?.promptId,
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
		error: query.error,
		refetch: query.refetch,
	};
}
