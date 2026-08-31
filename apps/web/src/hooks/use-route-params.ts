import { useParams } from "@tanstack/react-router";

/** The URL segments of the rendered page — see `useLooseRouteContext`. */
export function useOrganizationParams(): { org: string } {
	const { org } = useParams({ strict: false });
	if (!org) throw new Error("useOrganizationParams was called outside /app/org/$org");
	return { org };
}

export function useBrandParams(): { org: string; brand: string } {
	const { org, brand } = useParams({ strict: false });
	if (!org || !brand) throw new Error("useBrandParams was called outside /app/org/$org/brand/$brand");
	return { org, brand };
}
