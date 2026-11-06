/**
 * Mock for @/server/citations used in Storybook stories. The real module
 * imports pg via @workspace/lib/db, which is not browser-safe.
 */
import { type CitationFlowRow, matchesDomain } from "@/lib/citation-flow";

interface MockDomain {
	domain: string;
	count: number;
	category: string;
}

let _citations: unknown;
let _domains: MockDomain[] = [];
let _urls: { url: string; domain: string; count: number; category: string; title?: string }[] = [];
let _flowRows: CitationFlowRow[] = [];

export function setMockCitations(data: unknown) {
	_citations = data;
}

export function setMockCitationDomains(domains: MockDomain[]) {
	_domains = domains;
}

export function setMockCitationUrls(urls: typeof _urls) {
	_urls = urls;
}

export function setMockCitationFlowRows(rows: CitationFlowRow[]) {
	_flowRows = rows;
}

export const getCitationsFn = async (..._args: unknown[]) => _citations;
export const getCitationUrlsFn = async ({ data }: { data: { category?: string; page: number; pageSize: number } }) => {
	const matching = _urls.filter((u) => !data.category || u.category === data.category);
	const items = matching
		.slice(data.page * data.pageSize, (data.page + 1) * data.pageSize)
		.map((u) => ({ ...u, promptCount: 1, isNew: false }));
	return { items, total: matching.length };
};
export const getGoogleShoppingFn = async (..._args: unknown[]) => ({ items: [], total: 0, promptValues: {} });

export const getCitationDomainsFn = async ({
	data,
}: {
	data: { search?: string; category?: string; page: number; pageSize: number };
}) => {
	const matching = _domains.filter(
		(d) =>
			(!data.category || d.category === data.category) &&
			(!data.search || d.domain.includes(data.search.toLowerCase())),
	);
	const items = matching
		.slice(data.page * data.pageSize, (data.page + 1) * data.pageSize)
		.map((d) => ({ ...d, previousCount: 0, changePercent: null }));
	return { items, total: matching.length };
};

export const getCitationFlowFn = async ({ data }: { data: { domain: string } }) =>
	_flowRows.filter((row) => matchesDomain(new URL(row.url).hostname, data.domain));
