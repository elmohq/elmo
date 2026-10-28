import { useParams } from "@tanstack/react-router";
import { BRAND_ROUTE_ID, ORG_ROUTE_ID } from "@/lib/route-subject";

export function useOrganizationParams(): { org: string } {
	return useParams({ from: ORG_ROUTE_ID });
}

export function useBrandParams(): { org: string; brand: string } {
	return useParams({ from: BRAND_ROUTE_ID });
}
