import { useMatch } from "@tanstack/react-router";
import { BRAND_ROUTE_ID } from "@/lib/route-subject";

/**
 * The `$brand` segment is a slug or an id, so it is not something to hand to a
 * server function or use in a query key. The brand layout loads the brand; this
 * reads its id from that loader data. Undefined outside a brand page.
 */
export function useBrandId(): string | undefined {
	return useMatch({ from: BRAND_ROUTE_ID, shouldThrow: false, select: (match) => match.loaderData?.brand.id });
}

export function useResolvedBrandId(brandId?: string): string | undefined {
	const routeBrandId = useBrandId();
	return brandId || routeBrandId;
}
