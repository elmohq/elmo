import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { getBrand, getCompetitors } from "@/server/brands";

export const brandKeys = {
	all: ["brands"] as const,
	detail: (brandId: string) => [...brandKeys.all, "detail", brandId] as const,
	competitors: (brandId: string) => [...brandKeys.all, "competitors", brandId] as const,
};

/**
 * Get a single brand by ID.
 * If no brandId provided, extracts from route params.
 */
export function useBrand(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const queryClient = useQueryClient();

	const query = useQuery({
		queryKey: brandKeys.detail(resolvedBrandId || ""),
		queryFn: () => getBrand({ data: { brandId: resolvedBrandId! } }),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	const refetch = async () => {
		await query.refetch();
		queryClient.invalidateQueries({ queryKey: brandKeys.all });
	};

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch,
	};
}

export function useCompetitors(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: brandKeys.competitors(resolvedBrandId || ""),
		queryFn: () => getCompetitors({ data: { brandId: resolvedBrandId! } }),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	return {
		data: query.data ?? [],
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}
