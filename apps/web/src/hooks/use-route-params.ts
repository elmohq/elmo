import { useParams } from "@tanstack/react-router";

export function useOrganizationParams(): { org: string } | null {
	const org = useParams({ strict: false, select: (params) => params.org });
	return org ? { org } : null;
}

export function useBrandParams(): { org: string; brand: string } | null {
	const params = useParams({ strict: false, select: ({ org, brand }) => ({ org, brand }) });
	return params.org && params.brand ? { org: params.org, brand: params.brand } : null;
}
