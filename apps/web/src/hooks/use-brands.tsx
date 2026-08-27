import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BrandWithPrompts, Competitor } from "@workspace/lib/db/schema";
import { useBrandId } from "@/hooks/use-brand-id";
import type { TrackedTarget } from "@/lib/model-filter";
import { getBrand, getBrands, getCompetitors } from "@/server/brands";

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
	list: () => [...brandKeys.all, "list"] as const,
	detail: (brandId: string) => [...brandKeys.all, "detail", brandId] as const,
	competitors: (brandId: string) => [...brandKeys.all, "competitors", brandId] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * Get all brands the user has access to
 */
export function useBrands() {
	const query = useQuery({
		queryKey: brandKeys.list(),
		queryFn: () => getBrands(),
		staleTime: 30_000, // 30 seconds
		refetchOnWindowFocus: true,
		refetchOnReconnect: true,
	});

	return {
		brands: query.data,
		isLoading: query.isLoading,
		isError: query.error,
		revalidate: query.refetch,
	};
}

/**
 * Get a single brand by ID.
 * If no brandId provided, extracts from route params.
 */
export function useBrand(brandId?: string) {
	// The URL segment is the brand's slug where it has one, so the id comes from
	// route context rather than from params.
	const routeBrandId = useBrandId();
	const resolvedBrandId = brandId || routeBrandId;
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
		// Also invalidate the brands list
		queryClient.invalidateQueries({ queryKey: brandKeys.list() });
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
	const routeBrandId = useBrandId();
	const resolvedBrandId = brandId || routeBrandId;

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

/**
 * Utility for invalidating all brand-related queries
 */
export function useBrandsRevalidation() {
	const queryClient = useQueryClient();

	const revalidateAll = () => {
		queryClient.invalidateQueries({ queryKey: brandKeys.all });
	};

	return { revalidateAll };
}
