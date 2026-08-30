import { useLooseRouteContext } from "@/hooks/use-route-context";

/**
 * The `$brand` segment is a slug or an id, so it is not something to hand to a
 * server function or use in a query key. The layout resolves it once into route
 * context; this reads that. Undefined outside a brand page.
 */
export function useBrandId(): string | undefined {
	return useLooseRouteContext().brandId;
}

export function useResolvedBrandId(brandId?: string): string | undefined {
	const routeBrandId = useBrandId();
	return brandId || routeBrandId;
}
