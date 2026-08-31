/**
 * The measurements, all over `analytics-core` — the same functions the
 * dashboard's own server functions call, so a number an agent reads is the
 * number the dashboard shows.
 *
 * Every one of these starts the same way: check the brand is the caller's,
 * resolve the window, apply the filters, and answer inside a `{ brandId, range }`
 * envelope. The two factories below do that once, so each tool is only the call
 * that makes it different. They are separate rather than one with a flag
 * because a tool that doesn't page must not advertise `page` and `limit` — an
 * argument a model is offered is an argument it will use.
 */
import { z } from "zod";
import type { AnalyticsFilters, AnalyticsWindow, Paging } from "@/lib/api/analytics-range";
import { paginate } from "@/lib/api/analytics-range";
import { requireBrandInScope } from "@/lib/api/scope";
import type { Principal } from "@/lib/auth/api-auth";
import {
	getBrandCitations,
	getBrandPlatformBreakdown,
	getBrandPromptPerformance,
	getBrandQueryFanout,
	getBrandShareOfVoice,
	getBrandSummary,
	getBrandVisibility,
} from "@/server/analytics-core";
import { latestOpportunities } from "@/server/opportunities-core";
import {
	brandIdArg,
	defineTool,
	filtersFrom,
	type McpTool,
	pagingArgs,
	pagingFrom,
	resolveAnalyticsWindow,
	type WindowArgs,
	windowArgs,
} from "./define";

interface BrandWindow {
	brand: Awaited<ReturnType<typeof requireBrandInScope>>;
	range: AnalyticsWindow;
	filters: AnalyticsFilters;
}

/** The preamble every tool in this file shares. */
async function brandWindow(auth: Principal, args: WindowArgs & { brandId: string }): Promise<BrandWindow> {
	const brand = await requireBrandInScope(auth, args.brandId);
	return { brand, range: resolveAnalyticsWindow(args), filters: filtersFrom(args) };
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
			const context = await brandWindow(auth, args);
			return { brandId: context.brand.id, range: context.range, ...(await tool.run(context)) };
		},
	});
}

function pagedAnalyticsTool(tool: {
	name: string;
	title: string;
	description: string;
	run(context: BrandWindow & { paging: Paging }): Promise<object>;
}): McpTool {
	return defineTool({
		...tool,
		scopes: ["analytics:read"],
		readOnly: true,
		input: { brandId: brandIdArg, ...windowArgs, ...pagingArgs },
		run: async ({ auth }, args) => {
			const context = await brandWindow(auth, args);
			const paging = pagingFrom(args);
			return { brandId: context.brand.id, range: context.range, ...(await tool.run({ ...context, paging })) };
		},
	});
}

export const getVisibility = analyticsTool({
	name: "get_visibility",
	title: "Get visibility",
	description:
		"How often the answer engines mentioned the brand over a window: the headline figures plus the daily trend behind them. The first thing to read when asked how a brand is doing.",
	run: async ({ brand, range, filters }) => {
		const [summary, visibility] = await Promise.all([
			getBrandSummary(brand.id, range, filters),
			getBrandVisibility(brand.id, range, filters),
		]);
		return { summary, series: visibility.series };
	},
});

export const getShareOfVoice = analyticsTool({
	name: "get_share_of_voice",
	title: "Get share of voice",
	description:
		"The brand's share of mentions against its tracked competitors, as a leaderboard and over time. Shares are fractions of 1, not percentages.",
	run: async ({ brand, range, filters }) => getBrandShareOfVoice(brand.id, range, filters),
});

export const getPlatformBreakdown = analyticsTool({
	name: "get_platform_breakdown",
	title: "Get per-engine visibility",
	description: "Where the brand is strong and where it is invisible, one row per answer engine.",
	run: async ({ brand, range, filters }) => ({ data: await getBrandPlatformBreakdown(brand.id, range, filters) }),
});

export const getPromptPerformance = pagedAnalyticsTool({
	name: "get_prompt_performance",
	title: "Get per-prompt performance",
	description:
		"How each prompt performed over the window — which questions surface the brand and which don't. Enabled prompts only; a disabled one isn't sampled, so it has nothing to report.",
	run: async ({ brand, range, filters, paging }) =>
		paginate(await getBrandPromptPerformance(brand.id, range, filters), paging.page, paging.limit),
});

export const getQueryFanout = pagedAnalyticsTool({
	name: "get_query_fanout",
	title: "Get search queries the engines ran",
	description:
		"The web searches the answer engines actually ran while answering, and how often. These are the phrasings to optimize for — they are frequently not the prompt's own wording.",
	run: async ({ brand, range, filters, paging }) => {
		const analysis = await getBrandQueryFanout(brand.id, range, filters, { uncapped: true });
		// topByRuns carries both figures per query, which is what a caller paging
		// this list wants; topQueries carries only an instance count.
		const queries = analysis.topByRuns.map((entry) => ({
			query: entry.query,
			runs: entry.runs,
			promptCount: entry.prompts,
		}));
		return {
			totalQueries: analysis.totalQueries,
			uniqueQueries: analysis.uniqueQueries,
			fanoutRuns: analysis.fanoutRuns,
			totalRuns: analysis.totalRuns,
			avgQueriesPerRun: analysis.avgPerExecution,
			coverageRate: analysis.coverageRate,
			...paginate(queries, paging.page, paging.limit),
		};
	},
});

/** The one analytics tool with an argument of its own, so it is spelled out. */
export const getCitations = defineTool({
	name: "get_citations",
	title: "Get cited sources",
	description:
		"The pages the answer engines cited while answering about this brand, grouped by domain and by URL, and categorized as the brand's own, a competitor's, or editorial. The core of an AEO content plan: the editorial pages here are where the engines are getting their answers.",
	scopes: ["analytics:read"],
	readOnly: true,
	input: {
		brandId: brandIdArg,
		...windowArgs,
		...pagingArgs,
		groupBy: z.enum(["domain", "url"]).optional().describe("Which grouping to page through. Defaults to domain."),
	},
	run: async ({ auth }, args) => {
		const { brand, range, filters } = await brandWindow(auth, args);
		const { page, limit } = pagingFrom(args);
		const { domains, urls, totals } = await getBrandCitations(brand.id, range, filters);
		return {
			brandId: brand.id,
			range,
			groupBy: args.groupBy ?? "domain",
			totals: { citations: totals.citations, uniqueDomains: totals.uniqueDomains, uniqueUrls: totals.uniqueUrls },
			...(args.groupBy === "url" ? paginate(urls, page, limit) : paginate(domains, page, limit)),
		};
	},
});

/** No window: this reads the newest stored report, whenever it was generated. */
export const getOpportunities = defineTool({
	name: "get_opportunities",
	title: "Get the latest opportunities report",
	description:
		"The most recent stored opportunities report for a brand: what to write, what to fix, and the risks Elmo found. Never regenerates — `status` says whether one exists and whether there was enough data to write it.",
	scopes: ["analytics:read"],
	readOnly: true,
	input: { brandId: brandIdArg },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		return latestOpportunities(brand.id);
	},
});
