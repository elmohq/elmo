/**
 * Over `analytics-core`, the same functions the dashboard calls. None paginate,
 * because none can grow without bound; the lists that can have their own tools.
 */
import { publicRange } from "@/lib/api/analytics-range";
import { requireBrandInScope } from "@/lib/api/scope";
import type { AnalyticsFilters, AnalyticsWindow } from "@/server/analytics-core";
import {
	getBrandAnalytics,
	getBrandCitations,
	getBrandPromptPerformance,
	getBrandQueryFanout,
} from "@/server/analytics-core";
import { publishedOpportunities } from "@/server/opportunities-core";
import { brandIdArg, defineTool, filtersFrom, type McpTool, windowArgs, windowFor } from "./define";

interface BrandWindow {
	brand: Awaited<ReturnType<typeof requireBrandInScope>>;
	range: AnalyticsWindow;
	filters: AnalyticsFilters;
}

function analyticsTool(tool: {
	name: string;
	title: string;
	description: string;
	run(context: BrandWindow): Promise<object>;
}): McpTool {
	return defineTool({
		...tool,
		scopes: ["analytics:read"],
		readOnly: true,
		input: { brandId: brandIdArg, ...windowArgs },
		run: async ({ auth }, args) => {
			const brand = await requireBrandInScope(auth, args.brandId);
			const range = windowFor(args);
			const context = { brand, range, filters: filtersFrom(args) };
			return { brandId: brand.id, range: publicRange(range), ...(await tool.run(context)) };
		},
	});
}

export const getAnalytics = analyticsTool({
	name: "get_analytics",
	title: "Get a brand's analytics",
	description:
		"Everything a brand's window says in one call: visibility and its daily trend, share of voice against tracked competitors, the per-model breakdown, and citation totals. The first thing to read when asked how a brand is doing. Rates are fractions of 1, not percentages.",
	run: async ({ brand, range, filters }) => getBrandAnalytics(brand.id, range, filters),
});

export const getPromptPerformance = analyticsTool({
	name: "get_prompt_performance",
	title: "Get per-prompt performance",
	description:
		"How each prompt performed over the window — which questions surface the brand and which don't. Enabled prompts only; a disabled one isn't sampled, so it has nothing to report.",
	run: async ({ brand, range, filters }) => ({ data: await getBrandPromptPerformance(brand.id, range, filters) }),
});

export const getCitations = analyticsTool({
	name: "get_citations",
	title: "Get cited sources",
	description:
		"The pages the models cited while answering about this brand, by domain and by URL, each categorized as the brand's own, a competitor's, or editorial. The core of an AEO content plan: the editorial pages here are where the models are getting their answers.",
	run: async ({ brand, range, filters }) => {
		const { domains, urls, totals } = await getBrandCitations(brand.id, range, filters);
		return {
			totals: { citations: totals.citations, uniqueDomains: totals.uniqueDomains, uniqueUrls: totals.uniqueUrls },
			domains,
			urls,
		};
	},
});

export const getQueryFanout = analyticsTool({
	name: "get_query_fanout",
	title: "Get the searches the models ran",
	description:
		"The web searches the models actually ran while answering, and how often. These are the phrasings to optimize for — they are frequently not the prompt's own wording.",
	run: async ({ brand, range, filters }) => {
		const analysis = await getBrandQueryFanout(brand.id, range, filters, { uncapped: true });
		return {
			totalQueries: analysis.totalQueries,
			uniqueQueries: analysis.uniqueQueries,
			fanoutRuns: analysis.fanoutRuns,
			totalRuns: analysis.totalRuns,
			avgQueriesPerRun: analysis.avgPerExecution,
			coverageRate: analysis.coverageRate,
			data: analysis.topByRuns.map((entry) => ({
				query: entry.query,
				runs: entry.runs,
				promptCount: entry.prompts,
			})),
		};
	},
});

/** No window: this reads the newest stored report, whenever it was generated. */
export const getOpportunities = defineTool({
	name: "get_opportunities",
	title: "Get the latest opportunities report",
	description:
		"The most recent stored opportunities report for a brand: what to write, what to fix, and the risks Elmo found. `status` says whether there was enough data to write one.",
	scopes: ["analytics:read"],
	readOnly: true,
	input: { brandId: brandIdArg },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		return publishedOpportunities(brand.id);
	},
});
