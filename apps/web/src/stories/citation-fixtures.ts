/**
 * A month of citations for "Acme", a mid-size CRM: its own site, two tracked
 * competitors, a review site and the usual long tail of third parties. Each
 * page carries per-engine weights in MODELS order, so the Citation Flow and
 * the Citations page read the same numbers.
 */
import {
	type CitationCategory,
	type CitationPageType,
	emptyCategoryCounts,
} from "@workspace/lib/citations/domain-categories";
import type { CitationData } from "@/components/citations/types";
import { type CitationFlowRow, matchesDomain } from "@/lib/citation-flow";

export const MODELS = ["chatgpt", "perplexity", "google-ai-mode", "gemini", "claude"];

interface FixturePage {
	url: string;
	title: string;
	weights: number[];
	pageType: CitationPageType;
}

const page = (url: string, title: string, weights: number[], pageType: CitationPageType = "article"): FixturePage => ({
	url,
	title,
	weights,
	pageType,
});

const ACME: FixturePage[] = [
	page("https://acme.com/", "Acme — The CRM for growing teams", [38, 22, 18, 12, 9], "homepage"),
	page("https://acme.com/pricing", "Pricing | Acme", [31, 26, 12, 9, 7], "product"),
	page("https://acme.com/integrations", "Integrations | Acme", [9, 7, 4, 3, 2], "product"),
	page("https://acme.com/security", "Security & compliance | Acme", [5, 6, 1, 2, 4], "info"),
	page(
		"https://acme.com/blog/best-crm-for-startups",
		"The 9 best CRMs for startups in 2026",
		[24, 14, 29, 17, 3],
		"listicle",
	),
	page("https://acme.com/blog/crm-migration-checklist", "CRM migration checklist", [11, 9, 16, 8, 2], "howto"),
	page("https://acme.com/blog/sales-pipeline-stages", "Sales pipeline stages, explained", [6, 3, 12, 7, 0]),
	page("https://acme.com/blog/what-is-a-crm", "What is a CRM?", [4, 2, 9, 6, 1]),
	page("https://acme.com/blog/lead-scoring-models", "Lead scoring models that work", [2, 3, 5, 2, 0]),
	page("https://acme.com/blog/crm-roi-calculator", "Calculating CRM ROI", [1, 1, 3, 1, 0]),
	page("https://acme.com/compare/acme-vs-hubspot", "Acme vs HubSpot", [21, 18, 11, 8, 6], "comparison"),
	page("https://acme.com/compare/acme-vs-salesforce", "Acme vs Salesforce", [17, 12, 8, 7, 5], "comparison"),
	page("https://acme.com/compare/acme-vs-pipedrive", "Acme vs Pipedrive", [6, 5, 2, 2, 1], "comparison"),
	page("https://acme.com/customers/northwind", "How Northwind doubled pipeline", [3, 4, 2, 1, 1]),
	page("https://acme.com/customers/globex", "Globex case study", [1, 2, 1, 0, 1]),
	page("https://docs.acme.com/api/authentication", "Authentication — Acme API", [8, 19, 2, 3, 11], "doc"),
	page("https://docs.acme.com/api/webhooks", "Webhooks — Acme API", [5, 14, 1, 2, 7], "doc"),
	page("https://docs.acme.com/getting-started", "Getting started", [7, 9, 3, 3, 4], "doc"),
	page("https://docs.acme.com/import/csv", "Import contacts from CSV", [3, 6, 2, 1, 2], "doc"),
	page("https://docs.acme.com/sso/okta", "Set up SSO with Okta", [1, 4, 0, 1, 3], "doc"),
	page("https://help.acme.com/articles/cancel-subscription", "Cancel your subscription", [6, 4, 7, 3, 1], "howto"),
	page("https://help.acme.com/articles/export-data", "Export your data", [3, 5, 2, 2, 2], "howto"),
	page("https://help.acme.com/articles/gdpr", "GDPR at Acme", [1, 2, 1, 1, 2], "info"),
	page("https://community.acme.com/t/zapier-vs-native-sync", "Zapier vs native sync?", [2, 4, 3, 0, 0], "forum"),
	page("https://community.acme.com/t/custom-fields-limit", "Custom fields limit", [1, 2, 1, 0, 0], "forum"),
	page("https://status.acme.com/", "Acme Status", [1, 2, 0, 0, 1], "info"),
];

const HUBSPOT: FixturePage[] = [
	page("https://www.hubspot.com/products/crm", "Free CRM Software | HubSpot", [44, 21, 30, 19, 12], "product"),
	page("https://www.hubspot.com/pricing/crm", "CRM Pricing | HubSpot", [26, 19, 14, 9, 6], "product"),
	page(
		"https://blog.hubspot.com/sales/crm-for-startups",
		"The best CRMs for startups",
		[18, 12, 25, 14, 4],
		"listicle",
	),
	page("https://blog.hubspot.com/sales/what-is-crm", "What is a CRM? The complete guide", [12, 8, 21, 16, 3]),
	page("https://blog.hubspot.com/sales/sales-pipeline", "How to build a sales pipeline", [5, 4, 11, 6, 1], "howto"),
	page("https://blog.hubspot.com/marketing/lead-scoring", "Lead scoring, explained", [3, 2, 6, 3, 0]),
	page("https://knowledge.hubspot.com/records/import-objects", "Import records", [4, 9, 2, 1, 3], "doc"),
	page(
		"https://knowledge.hubspot.com/integrations/connect-zapier",
		"Connect HubSpot and Zapier",
		[2, 5, 1, 1, 2],
		"doc",
	),
	page("https://www.hubspot.com/", "HubSpot | Software & tools for your business", [9, 4, 6, 3, 2], "homepage"),
	page("https://www.hubspot.com/compare/salesforce", "HubSpot vs Salesforce", [7, 6, 3, 2, 3], "comparison"),
];

const G2: FixturePage[] = [
	page("https://www.g2.com/categories/crm", "Best CRM Software 2026 | G2", [41, 52, 18, 12, 9], "listicle"),
	page(
		"https://www.g2.com/categories/sales-force-automation",
		"Best Sales Force Automation Software",
		[9, 17, 6, 3, 2],
		"listicle",
	),
	page(
		"https://www.g2.com/categories/crm/small-business",
		"Best CRM for Small Business",
		[12, 21, 8, 5, 1],
		"listicle",
	),
	page("https://www.g2.com/products/acme/reviews", "Acme Reviews 2026 | G2", [14, 22, 4, 3, 5], "review"),
	page(
		"https://www.g2.com/products/hubspot-sales-hub/reviews",
		"HubSpot Sales Hub Reviews",
		[11, 16, 6, 2, 3],
		"review",
	),
	page(
		"https://www.g2.com/products/salesforce-sales-cloud/reviews",
		"Salesforce Sales Cloud Reviews",
		[8, 13, 3, 2, 2],
		"review",
	),
	page("https://www.g2.com/products/pipedrive/reviews", "Pipedrive Reviews", [4, 6, 1, 1, 1], "review"),
	page(
		"https://www.g2.com/compare/acme-vs-hubspot-sales-hub",
		"Acme vs HubSpot Sales Hub",
		[7, 12, 2, 1, 2],
		"comparison",
	),
	page(
		"https://www.g2.com/compare/hubspot-sales-hub-vs-pipedrive",
		"HubSpot vs Pipedrive",
		[3, 7, 1, 0, 1],
		"comparison",
	),
	page("https://learn.g2.com/best-crm-software", "The best CRM software, ranked", [6, 4, 9, 5, 1], "listicle"),
	page("https://learn.g2.com/what-is-crm", "What is CRM?", [2, 1, 4, 3, 0]),
	page("https://research.g2.com/reports/crm-grid", "Grid Report for CRM", [1, 3, 0, 0, 1], "info"),
];

const PIPEDRIVE: FixturePage[] = [
	page(
		"https://www.pipedrive.com/en/blog/crm-for-startups",
		"CRM for startups | Pipedrive",
		[12, 8, 6, 4, 0],
		"listicle",
	),
];

const OTHERS: { domain: string; category: CitationCategory; pages: FixturePage[] }[] = [
	{
		domain: "reddit.com",
		category: "social",
		pages: [
			page(
				"https://www.reddit.com/r/sales/comments/1a/best_crm",
				"Best CRM for a 10 person team?",
				[9, 31, 22, 8, 1],
				"forum",
			),
			page("https://www.reddit.com/r/startups/comments/2b/crm", "What CRM do you use?", [4, 18, 12, 5, 0], "forum"),
		],
	},
	{
		domain: "forbes.com",
		category: "editorial",
		pages: [
			page(
				"https://www.forbes.com/advisor/business/software/best-crm-software",
				"Best CRM Software Of 2026",
				[28, 12, 19, 11, 6],
				"listicle",
			),
		],
	},
	{
		domain: "capterra.com",
		category: "reviews",
		pages: [
			page(
				"https://www.capterra.com/customer-relationship-management-software",
				"Best CRM Software 2026",
				[11, 19, 8, 4, 2],
				"listicle",
			),
		],
	},
	{
		domain: "techradar.com",
		category: "editorial",
		pages: [
			page(
				"https://www.techradar.com/best/best-crm-software",
				"Best CRM software of 2026",
				[9, 6, 12, 7, 2],
				"listicle",
			),
		],
	},
	{
		domain: "en.wikipedia.org",
		category: "reference",
		pages: [
			page(
				"https://en.wikipedia.org/wiki/Customer_relationship_management",
				"Customer relationship management",
				[7, 3, 2, 6, 9],
				"info",
			),
		],
	},
];

const SOURCES: { domain: string; category: CitationCategory; pages: FixturePage[] }[] = [
	{ domain: "acme.com", category: "brand", pages: ACME },
	{ domain: "hubspot.com", category: "competitor", pages: HUBSPOT },
	{ domain: "g2.com", category: "reviews", pages: G2 },
	{ domain: "pipedrive.com", category: "competitor", pages: PIPEDRIVE },
	...OTHERS,
];

const normalize = (url: string) => url.replace("://www.", "://").replace(/\/$/, "");
const hostOf = (url: string) => new URL(url).hostname;

/** Every page's citations per engine, normalized the way the rollups store them. */
export const ALL_FLOW_ROWS: CitationFlowRow[] = SOURCES.flatMap((source) =>
	source.pages.flatMap((p) =>
		p.weights.flatMap((count, i) =>
			count > 0 ? [{ model: MODELS[i], url: normalize(p.url) || p.url, title: p.title, count }] : [],
		),
	),
);

/** What the server read answers for a domain: its own pages and its subdomains'. */
export function flowRowsFor(domain: string, rows: readonly CitationFlowRow[] = ALL_FLOW_ROWS): CitationFlowRow[] {
	return rows.filter((row) => matchesDomain(hostOf(row.url), domain));
}

function buildCitationData(): CitationData {
	const urls = SOURCES.flatMap((source) =>
		source.pages.map((p) => {
			const url = normalize(p.url);
			return {
				url,
				title: p.title,
				domain: hostOf(url),
				count: p.weights.reduce((sum, w) => sum + w, 0),
				category: source.category,
				pageType: p.pageType,
				avgPosition: 2.4,
				promptCount: 6,
				isNew: false,
			};
		}),
	).sort((a, b) => b.count - a.count);

	const byDomain = new Map<
		string,
		{ domain: string; count: number; category: CitationCategory; exampleTitle?: string }
	>();
	for (const url of urls) {
		const entry = byDomain.get(url.domain) ?? {
			domain: url.domain,
			count: 0,
			category: url.category,
			exampleTitle: url.title,
		};
		entry.count += url.count;
		byDomain.set(url.domain, entry);
	}
	const domainDistribution = [...byDomain.values()]
		.sort((a, b) => b.count - a.count)
		.map((d) => ({ ...d, previousCount: Math.round(d.count * 0.9), changePercent: 11 }));

	const categoryCounts = emptyCategoryCounts();
	const pageTypes = new Map<CitationPageType, number>();
	for (const url of urls) {
		categoryCounts[url.category] = (categoryCounts[url.category] ?? 0) + url.count;
		pageTypes.set(url.pageType, (pageTypes.get(url.pageType) ?? 0) + url.count);
	}
	const totalCitations = urls.reduce((sum, url) => sum + url.count, 0);
	const share = (category: CitationCategory) => Math.round((categoryCounts[category] / totalCitations) * 100);

	const citationTimeSeries = Array.from({ length: 30 }, (_, i) => {
		const date = new Date(Date.UTC(2026, 8, 16 + i)).toISOString().slice(0, 10);
		const wobble = Math.round(Math.sin(i / 3) * 2);
		return {
			date,
			brand: share("brand") + wobble,
			competitor: share("competitor") - wobble,
			reviews: share("reviews"),
			editorial: share("editorial"),
			social: share("social"),
			reference: share("reference"),
		};
	});

	return {
		totalCitations,
		uniqueDomains: domainDistribution.length,
		categoryCounts,
		domainDistribution,
		specificUrls: urls,
		pageTypeDistribution: [...pageTypes].map(([pageType, count]) => ({ pageType, count })),
		citationTimeSeries,
		pageTypeTimeSeries: [],
		competitors: [
			{ id: "c1", name: "HubSpot", domains: ["hubspot.com"] },
			{ id: "c2", name: "Pipedrive", domains: ["pipedrive.com"] },
		],
		competitorOnlyPrompts: [],
		subreddits: [],
	};
}

export const mockCitationData = buildCitationData();
