import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BrandWithPrompts } from "@workspace/lib/db/schema";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { TrackedTarget } from "@/lib/model-filter";
import { getBrand, getCompetitors } from "@/server/brands";

export type BrandWithPromptsAndDataInfo = BrandWithPrompts & {
	earliestDataDate?: string | null;
	/**
	 * What this brand's results can be broken down by, resolved server-side so
	 * the UI never hardcodes a model list. A model appears twice when the brand
	 * runs it both scraped and grounded — see server/brands.ts.
	 */
	trackedTargets: TrackedTarget[];
};

// ============================================================================
// Query keys
// ============================================================================

export const brandKeys = {
	all: ["brands"] as const,
	detail: (brandId: string) => [...brandKeys.all, "detail", brandId] as const,
	competitors: (brandId: string) => [...brandKeys.all, "competitors", brandId] as const,
};

// ============================================================================
// Hooks
// ============================================================================

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

	const revalidate = async () => {
		await query.refetch();
		queryClient.invalidateQueries({ queryKey: brandKeys.all });
	};

	return {
		brandId: resolvedBrandId,
		brand: query.data as BrandWithPromptsAndDataInfo | undefined,
		isLoading: query.isLoading,
		isError: query.error,
		revalidate,
	};
}

/**
 * Get competitors for a brand
 */
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
		competitors: query.data || [],
		isLoading: query.isLoading,
		isError: query.error,
		revalidate: query.refetch,
	};
}
