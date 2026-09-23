import { useMatch } from "@tanstack/react-router";
import { BRAND_ROUTE_ID } from "@/lib/route-subject";

// Read from the brand layout, not the page's route: the layout stays matched
// across brand pages, so a page left mid-hydration can still read it.
export function useBrandId(): string;
export function useBrandId(opts: { shouldThrow: false }): string | undefined;
export function useBrandId(opts?: { shouldThrow: false }): string | undefined {
	return useMatch({
		from: BRAND_ROUTE_ID,
		shouldThrow: opts?.shouldThrow ?? true,
		select: (match) => match.context.brandId,
	});
}

export function useResolvedBrandId(brandId?: string): string | undefined {
	const routeBrandId = useBrandId({ shouldThrow: false });
	return brandId || routeBrandId;
}
