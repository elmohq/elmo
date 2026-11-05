import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import type { LookbackPeriod } from "@/lib/lookback";
import {
	getCitationDomainsFn,
	getCitationFlowFn,
	getCitationsFn,
	getCitationUrlsFn,
	getGoogleShoppingFn,
} from "@/server/citations";

export interface CitationFilters {
	lookback?: LookbackPeriod;
	tags?: string[];
	model?: string;
}

export interface CitationListQuery {
	search: string;
	category: string;
	pageType?: string;
	page: number;
	pageSize: number;
}

export const citationKeys = {
	all: ["citations"] as const,
	list: (brandId: string, filters?: CitationFilters) => [...citationKeys.all, brandId, filters] as const,
	urls: (brandId: string, filters: CitationFilters | undefined, query: CitationListQuery) =>
		[...citationKeys.all, brandId, filters, "urls", query] as const,
	domains: (brandId: string, filters: CitationFilters | undefined, query: CitationListQuery) =>
		[...citationKeys.all, brandId, filters, "domains", query] as const,
	google: (brandId: string, filters: CitationFilters | undefined, query: GoogleListQuery) =>
		[...citationKeys.all, brandId, filters, "google", query] as const,
};

export interface GoogleListQuery {
	list: "products" | "queries";
	attribution: "all" | "brand" | "competitor";
	page: number;
	pageSize: number;
}

export function useGoogleShopping(
	brandId: string,
	filters: CitationFilters | undefined,
	query: GoogleListQuery,
	enabled: boolean,
) {
	return useQuery({
		enabled,
		queryKey: citationKeys.google(brandId, filters, query),
		queryFn: () =>
			getGoogleShoppingFn({
				data: {
					brandId,
					lookback: filters?.lookback ?? "1w",
					tags: filters?.tags?.join(","),
					model: filters?.model,
					...query,
				},
			}),
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchInterval: 60_000,
		placeholderData: keepPreviousData,
	});
}

function filterParams(brandId: string, filters: CitationFilters | undefined, query: CitationListQuery) {
	return {
		brandId,
		lookback: filters?.lookback ?? "1w",
		tags: filters?.tags?.join(","),
		model: filters?.model,
		search: query.search || undefined,
		category: query.category === "all" ? undefined : query.category,
		page: query.page,
		pageSize: query.pageSize,
	};
}

export function useCitationUrls(brandId: string, filters: CitationFilters | undefined, query: CitationListQuery) {
	return useQuery({
		queryKey: citationKeys.urls(brandId, filters, query),
		queryFn: () =>
			getCitationUrlsFn({
				data: {
					...filterParams(brandId, filters, query),
					pageType: query.pageType === "all" ? undefined : query.pageType,
				},
			}),
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchInterval: 60_000,
		placeholderData: keepPreviousData,
	});
}

export function useCitationDomains(brandId: string, filters: CitationFilters | undefined, query: CitationListQuery) {
	return useQuery({
		queryKey: citationKeys.domains(brandId, filters, query),
		queryFn: () => getCitationDomainsFn({ data: filterParams(brandId, filters, query) }),
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchInterval: 60_000,
		placeholderData: keepPreviousData,
	});
}

export function useCitations(brandId?: string, filters?: CitationFilters) {
	const resolvedBrandId = useResolvedBrandId(brandId);

	const query = useQuery({
		queryKey: citationKeys.list(resolvedBrandId || "", filters),
		queryFn: () =>
			getCitationsFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters?.lookback ?? "1w",
					tags: filters?.tags?.join(","),
					model: filters?.model,
				},
			}),
		enabled: !!resolvedBrandId,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchInterval: 60_000,
		placeholderData: (prev) => prev,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		error: query.error,
		refetch: query.refetch,
	};
}

export function useCitationFlow(brandId: string | undefined, filters: CitationFilters, domain: string | undefined) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	return useQuery({
		queryKey: [...citationKeys.all, resolvedBrandId || "", filters, "flow", domain] as const,
		queryFn: () =>
			getCitationFlowFn({
				data: {
					brandId: resolvedBrandId!,
					lookback: filters.lookback ?? "1w",
					tags: filters.tags?.join(","),
					model: filters.model,
					domain: domain!,
				},
			}),
		enabled: !!resolvedBrandId && !!domain,
		staleTime: 30_000,
		refetchOnWindowFocus: true,
		refetchInterval: 60_000,
		// Keep the chart up while a filter changes, but never show one domain's flow under another's name.
		placeholderData: (prev, prevQuery) => (prevQuery?.queryKey.at(-1) === domain ? prev : undefined),
	});
}
