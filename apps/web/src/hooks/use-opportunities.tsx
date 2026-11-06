import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { getOpportunitiesFn, refreshOpportunitiesFn } from "@/server/opportunities-fn";

const opportunitiesKeys = {
	all: ["opportunities-report"] as const,
	detail: (brandId: string) => [...opportunitiesKeys.all, brandId] as const,
};

const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Opportunities AEO report. The server returns a stored report and regenerates it
 * only when the latest is stale, so this is held for the session (staleTime:
 * Infinity, no refetch-on-focus) rather than refetched. `refresh` asks the server
 * to regenerate now, within the brand's daily allowance, and swaps in the result.
 */
export function useOpportunities(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: opportunitiesKeys.detail(resolvedBrandId || ""),
		queryFn: () => getOpportunitiesFn({ data: { brandId: resolvedBrandId!, timezone: timezone() } }),
		enabled: !!resolvedBrandId,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		retry: false,
	});

	const refresh = useMutation({
		mutationFn: () => refreshOpportunitiesFn({ data: { brandId: resolvedBrandId!, timezone: timezone() } }),
		onSuccess: (data) => queryClient.setQueryData(opportunitiesKeys.detail(resolvedBrandId || ""), data),
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
		refresh: refresh.mutate,
		isRefreshing: refresh.isPending,
		refreshError: refresh.error,
	};
}
