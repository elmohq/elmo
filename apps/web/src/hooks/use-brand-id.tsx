import { useRouteContext } from "@tanstack/react-router";

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
	const context = useRouteContext({ strict: false }) as { brandId?: string };
	return context.brandId;
}
