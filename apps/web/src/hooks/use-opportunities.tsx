import { useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { getOpportunitiesFn } from "@/server/opportunities-fn";

const opportunitiesKeys = {
	all: ["opportunities-report"] as const,
	detail: (brandId: string) => [...opportunitiesKeys.all, brandId] as const,
};

/**
 * Opportunities AEO report. Held for the session, except while a first report is
 * being generated in the background, when it polls until that lands.
 */
export function useOpportunities(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: opportunitiesKeys.detail(resolvedBrandId || ""),
		queryFn: () =>
			getOpportunitiesFn({
				data: { brandId: resolvedBrandId!, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
			}),
		enabled: !!resolvedBrandId,
		staleTime: Number.POSITIVE_INFINITY,
		refetchInterval: (query) => (query.state.data?.reason === "generating" ? 10_000 : false),
		refetchOnWindowFocus: false,
		retry: false,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}
