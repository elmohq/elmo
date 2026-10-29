import type { CitationCategory, CitationPageType } from "@workspace/lib/citations/domain-categories";
import type { Subreddit } from "@/lib/subreddits";

interface GoogleProductRow {
	name: string;
	count: number;
	attribution: "brand" | "competitor" | "other";
	competitorName?: string;
	prompts: { id: string; count: number }[];
}
interface GoogleQueryRow {
	query: string;
	count: number;
	prompts: { id: string; count: number }[];
}
export interface GoogleModuleData {
	shopping: {
		totalCitations: number;
		brandCount: number;
		competitorCount: number;
		productCounts: { all: number; brand: number; competitor: number };
		products: GoogleProductRow[];
	};
	search: { totalCitations: number; queryCount: number; queries: GoogleQueryRow[] };
	promptValues: Record<string, string>;
}

export interface CitationDomainItem {
	domain: string;
	count: number;
	category: CitationCategory;
	exampleTitle?: string;
	previousCount?: number;
	changePercent?: number | null;
}

export interface CitationUrlItem {
	url: string;
	title?: string;
	domain: string;
	count: number;
	category: CitationCategory;
	pageType?: CitationPageType;
	avgPosition?: number | null;
	promptCount?: number;
	isNew?: boolean;
}

export interface CitationListControls<T> {
	items: T[];
	totalItems: number;
	page: number;
	setPage: (page: number) => void;
	search: string;
	setSearch: (search: string) => void;
	category: string;
	setCategory: (category: string) => void;
	pageType: string;
	setPageType: (pageType: string) => void;
	isFetching?: boolean;
}

export interface CitationData {
	totalCitations: number;
	uniqueDomains: number;
	categoryCounts: Record<CitationCategory, number>;
	domainDistribution?: CitationDomainItem[];
	specificUrls?: CitationUrlItem[];
	subreddits: Subreddit[];
	pageTypeDistribution?: { pageType: CitationPageType; count: number }[];
	googleModule?: GoogleModuleData;
	citationTimeSeries?: Array<{ date: string } & Partial<Record<CitationCategory, number>>>;
	pageTypeTimeSeries?: Array<{ date: string } & Partial<Record<CitationPageType, number>>>;
	competitors?: Array<{ id: string; name: string; domains: string[] }>;
	competitorOnlyPrompts?: Array<{
		id: string;
		value: string;
		competitorCitationCount: number;
		uniqueCompetitors: number;
	}>;
	whatsChanged?: {
		newUrls: { url: string; domain: string; count: number; promptCount: number; category: CitationCategory }[];
		droppedUrls: {
			url: string;
			domain: string;
			previousCount: number;
			currentCount: number;
			category: CitationCategory;
		}[];
		newDomains: { domain: string; count: number; category: CitationCategory }[];
		droppedDomains: { domain: string; previousCount: number; category: CitationCategory }[];
	};
}
