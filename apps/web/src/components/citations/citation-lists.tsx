import { useMemo, useState } from "react";
import { GoogleShoppingCard, PRODUCTS_PAGE_SIZE, QUERIES_PAGE_SIZE } from "@/components/citations/google-shopping-card";
import { TopDomainsCard } from "@/components/citations/top-domains-card";
import { TopUrlsCard } from "@/components/citations/top-urls-card";
import type {
	CitationData,
	CitationDomainItem,
	CitationListControls,
	CitationUrlItem,
	GoogleModuleData,
} from "@/components/citations/types";
import { usePagedList } from "@/components/list-pagination";
import { type CitationFilters, useCitationDomains, useCitationUrls, useGoogleShopping } from "@/hooks/use-citations";
import { SEARCH_DEBOUNCE_MS, useDebouncedValue } from "@/hooks/use-debounced-value";

function useListFilters() {
	const [page, setPage] = useState(0);
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState("all");
	const [pageType, setPageType] = useState("all");
	const resetting =
		<T,>(set: (value: T) => void) =>
		(value: T) => {
			set(value);
			setPage(0);
		};
	return {
		page,
		setPage,
		search,
		setSearch: resetting(setSearch),
		category,
		setCategory: resetting(setCategory),
		pageType,
		setPageType: resetting(setPageType),
	};
}

function useLocalList<T extends { category: string; pageType?: string }>(
	items: readonly T[],
	pageSize: number,
	matches: (item: T, query: string) => boolean,
): CitationListControls<T> {
	const filters = useListFilters();
	const filtered = useMemo(() => {
		const query = filters.search.toLowerCase();
		return items.filter(
			(item) =>
				(filters.category === "all" || item.category === filters.category) &&
				(filters.pageType === "all" || item.pageType === filters.pageType) &&
				(!query || matches(item, query)),
		);
	}, [items, filters.category, filters.pageType, filters.search, matches]);
	const { page, setPage, pageItems, totalItems } = usePagedList(filtered, pageSize);
	return { ...filters, page, setPage, items: pageItems, totalItems };
}

const urlMatches = (url: CitationUrlItem, query: string) =>
	url.url.toLowerCase().includes(query) ||
	(url.title?.toLowerCase().includes(query) ?? false) ||
	url.domain.toLowerCase().includes(query);

const domainMatches = (domain: CitationDomainItem, query: string) => domain.domain.toLowerCase().includes(query);

interface UrlCardProps {
	sourceTabs: { key: string; label: string }[];
	pageTypeTabs: { key: string; label: string }[];
	maxUrls: number;
	brandName?: string;
	brandShare: number;
	brandIsCited: boolean;
}

interface DomainCardProps {
	sourceTabs: { key: string; label: string }[];
	maxDomains: number;
	brandId?: string;
	brandName?: string;
	competitors?: CitationData["competitors"];
	onCompetitorAdded?: () => void;
	onDomainSelect?: (domain: string) => void;
}

export function LocalTopUrlsCard({ urls, ...props }: UrlCardProps & { urls: CitationUrlItem[] }) {
	const list = useLocalList(urls, props.maxUrls, urlMatches);
	return <TopUrlsCard list={list} {...props} />;
}

export function LocalTopDomainsCard({ domains, ...props }: DomainCardProps & { domains: CitationDomainItem[] }) {
	const list = useLocalList(domains, props.maxDomains, domainMatches);
	return <TopDomainsCard list={list} {...props} />;
}

export interface RemoteListSource {
	brandId: string;
	filters?: CitationFilters;
}

function useRemotePage(
	filters: ReturnType<typeof useListFilters>,
	source: RemoteListSource,
	total: number | undefined,
	pageSize: number,
) {
	const sourceKey = JSON.stringify(source.filters ?? {});
	const [lastSourceKey, setLastSourceKey] = useState(sourceKey);
	if (sourceKey !== lastSourceKey) {
		setLastSourceKey(sourceKey);
		filters.setPage(0);
	}
	const lastPage = total === undefined ? filters.page : Math.max(0, Math.ceil(total / pageSize) - 1);
	return Math.min(filters.page, lastPage);
}

export function RemoteTopUrlsCard({ source, ...props }: UrlCardProps & { source: RemoteListSource }) {
	const filters = useListFilters();
	const search = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS);
	const [total, setTotal] = useState<number>();
	const page = useRemotePage(filters, source, total, props.maxUrls);
	const query = useCitationUrls(source.brandId, source.filters, {
		search,
		category: filters.category,
		pageType: filters.pageType,
		page,
		pageSize: props.maxUrls,
	});
	if (query.data && query.data.total !== total) setTotal(query.data.total);
	const list: CitationListControls<CitationUrlItem> = {
		...filters,
		page,
		items: query.data?.items ?? [],
		totalItems: query.data?.total ?? 0,
		isFetching: query.isFetching,
	};
	return <TopUrlsCard list={list} {...props} />;
}

export function RemoteTopDomainsCard({ source, ...props }: DomainCardProps & { source: RemoteListSource }) {
	const filters = useListFilters();
	const search = useDebouncedValue(filters.search, SEARCH_DEBOUNCE_MS);
	const [total, setTotal] = useState<number>();
	const page = useRemotePage(filters, source, total, props.maxDomains);
	const query = useCitationDomains(source.brandId, source.filters, {
		search,
		category: filters.category,
		page,
		pageSize: props.maxDomains,
	});
	if (query.data && query.data.total !== total) setTotal(query.data.total);
	const list: CitationListControls<CitationDomainItem> = {
		...filters,
		page,
		items: query.data?.items ?? [],
		totalItems: query.data?.total ?? 0,
		isFetching: query.isFetching,
	};
	return <TopDomainsCard list={list} {...props} />;
}

type ProductFilter = "all" | "brand" | "competitor";

export function LocalGoogleShoppingCard({ googleModule }: { googleModule: GoogleModuleData }) {
	const [productFilter, setProductFilter] = useState<ProductFilter>("all");
	const filtered = useMemo(
		() =>
			googleModule.shopping.products.filter(
				(product) => productFilter === "all" || product.attribution === productFilter,
			),
		[googleModule, productFilter],
	);
	const products = usePagedList(filtered, PRODUCTS_PAGE_SIZE);
	const queries = usePagedList(googleModule.search.queries, QUERIES_PAGE_SIZE);
	return (
		<GoogleShoppingCard
			totals={googleModule}
			products={{ ...products, items: products.pageItems, total: products.totalItems }}
			productFilter={productFilter}
			setProductFilter={(filter) => {
				setProductFilter(filter);
				products.setPage(0);
			}}
			queries={{ ...queries, items: queries.pageItems, total: queries.totalItems }}
			promptValues={googleModule.promptValues}
		/>
	);
}

export function RemoteGoogleShoppingCard({ totals, source }: { totals: GoogleModuleData; source: RemoteListSource }) {
	const [productFilter, setProductFilter] = useState<ProductFilter>("all");
	const productFilters = useListFilters();
	const queryFilters = useListFilters();
	const productPage = useRemotePage(
		productFilters,
		source,
		totals.shopping.productCounts[productFilter],
		PRODUCTS_PAGE_SIZE,
	);
	const queryPage = useRemotePage(queryFilters, source, totals.search.queryCount, QUERIES_PAGE_SIZE);
	const products = useGoogleShopping(
		source.brandId,
		source.filters,
		{
			list: "products",
			attribution: productFilter,
			page: productPage,
			pageSize: PRODUCTS_PAGE_SIZE,
		},
		totals.shopping.productCounts.all > 0,
	);
	const queries = useGoogleShopping(
		source.brandId,
		source.filters,
		{
			list: "queries",
			attribution: "all",
			page: queryPage,
			pageSize: QUERIES_PAGE_SIZE,
		},
		totals.search.queryCount > 0,
	);
	return (
		<GoogleShoppingCard
			totals={totals}
			products={{
				items: (products.data?.items ?? []) as GoogleModuleData["shopping"]["products"],
				total: totals.shopping.productCounts[productFilter],
				page: productPage,
				setPage: productFilters.setPage,
				isFetching: products.isFetching,
			}}
			productFilter={productFilter}
			setProductFilter={(filter) => {
				setProductFilter(filter);
				productFilters.setPage(0);
			}}
			queries={{
				items: (queries.data?.items ?? []) as GoogleModuleData["search"]["queries"],
				total: totals.search.queryCount,
				page: queryPage,
				setPage: queryFilters.setPage,
				isFetching: queries.isFetching,
			}}
			promptValues={{ ...products.data?.promptValues, ...queries.data?.promptValues }}
		/>
	);
}
