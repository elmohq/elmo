import { useEffect, useMemo, useState } from "react";
import { TopDomainsCard } from "@/components/citations/top-domains-card";
import { TopUrlsCard } from "@/components/citations/top-urls-card";
import type {
	CitationData,
	CitationDomainItem,
	CitationListControls,
	CitationUrlItem,
} from "@/components/citations/types";
import { usePagedList } from "@/components/list-pagination";
import { type CitationFilters, useCitationDomains, useCitationUrls } from "@/hooks/use-citations";

const SEARCH_DEBOUNCE_MS = 250;

function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);
	return debounced;
}

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

/** Back to the first page when the page's filters change, and onto the last when the list shrinks under it. */
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
