import { useLooseRouteContext } from "@/hooks/use-route-context";

/**
 * The brand the page is about, as an id.
 *
 * The `$brand` URL segment is the brand's slug where it has one and its id
 * otherwise, so it is not something to hand to a server function or use in a
 * query key. The `$brand` layout resolves it once and puts the id in route
 * context; this is how everything below reads it.
 *
 * Undefined outside a brand page, which is why callers that render in both
 * places take an explicit id and fall back to this.
 */
export function useBrandId(): string | undefined {
	return useLooseRouteContext().brandId;
}

/**
 * Every brand-scoped hook takes an optional id so a caller outside the brand's
 * own pages — the report viewer — can name one; inside them it comes from the
 * route.
 */
export function useResolvedBrandId(brandId?: string): string | undefined {
	const routeBrandId = useBrandId();
	return brandId || routeBrandId;
}
