/**
 * The tools `/api/mcp` offers, and the only place they are declared.
 *
 * Each one is a projection of something `/api/v1` already answers, over the
 * same edge-agnostic functions — `analytics-core`, `prompts-core`, `tags-core`
 * — so a number an agent reads here is the number the dashboard shows. Nothing
 * in this file queries anything the REST surface doesn't.
 *
 * Two properties are load-bearing:
 *
 *  - **`scopes` decides what a connection can even see.** The server registers
 *    only the tools the caller holds every scope for, so `tools/list` *is* the
 *    caller's capabilities. A key issued read-only is not told about writes and
 *    then refused; it is never offered them.
 *  - **`readOnly` is required, not inferred.** A read-only deployment drops
 *    every tool that declares `false`, and a test pins the exact partition — so
 *    adding a tool that writes is a deliberate act with a test to update, never
 *    an accident of forgetting a flag.
 *
 * Tenancy is not restated here. Every brand-scoped tool starts at
 * `requireBrandInScope`, the same call every REST route starts at, which is
 * what makes another tenant's brand read as one that doesn't exist.
 */

import { getModelMeta, KNOWN_MODELS } from "@workspace/config/models";
import { PREMIUM_MODELS } from "@workspace/config/plans";
import { parseScrapeTargets } from "@workspace/config/scrape-targets";
import { db } from "@workspace/lib/db/db";
import { brandOpportunities, brands, citations, competitors, promptRuns, prompts } from "@workspace/lib/db/schema";
import { extractTextContent } from "@workspace/lib/text-extraction";
import { and, asc, count, desc, eq, ilike, type SQL } from "drizzle-orm";
import { z } from "zod";
import { type AnalyticsFilters, paginate, resolveAnalyticsWindow, resolvePaging } from "@/lib/api/analytics-range";
import { ApiError } from "@/lib/api/handler";
import { brandScopeCondition, isBrandInScope, requireBrandInScope } from "@/lib/api/scope";
import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";
import type { Principal } from "@/lib/auth/api-auth";
import { getDeployment } from "@/lib/config/server";
import { countPromptRuns, getPromptRuns } from "@/lib/postgres-read";
import {
	getBrandCitations,
	getBrandPlatformBreakdown,
	getBrandPromptPerformance,
	getBrandQueryFanout,
	getBrandShareOfVoice,
	getBrandSummary,
	getBrandVisibility,
} from "@/server/analytics-core";
import { buildBrandResult } from "@/server/onboarding-core";
import {
	createPrompts,
	deletePrompt,
	listPrompts,
	MAX_PROMPT_BATCH,
	requirePrompt,
	updatePrompt,
} from "@/server/prompts-core";
import { listBrandTags } from "@/server/tags-core";
import { principalLabel, principalScopes } from "./auth";

export interface McpToolContext {
	auth: Principal;
}

export interface McpTool {
	name: string;
	title: string;
	description: string;
	/** Scopes an organization key must hold for this tool to be offered at all. */
	scopes: readonly ApiScope[];
	/** False for anything that changes data. Also what a read-only deployment drops. */
	readOnly: boolean;
	/** Set where the effect cannot be undone, so a client can confirm before calling. */
	destructive?: boolean;
	input: z.ZodRawShape;
	run(ctx: McpToolContext, args: never): Promise<unknown>;
}

function defineTool<S extends z.ZodRawShape>(tool: {
	name: string;
	title: string;
	description: string;
	scopes?: readonly ApiScope[];
	readOnly: boolean;
	destructive?: boolean;
	input: S;
	run(ctx: McpToolContext, args: z.output<z.ZodObject<S>>): Promise<unknown>;
}): McpTool {
	return { ...tool, scopes: tool.scopes ?? [] } as McpTool;
}

// ============================================================================
// Shared argument shapes
// ============================================================================

const brandIdArg = z.string().describe("Brand id, from list_brands.");

/**
 * The window every analytics tool takes, worded for a model rather than for a
 * query string: `lookback` is the one an agent should reach for, and the
 * explicit pair is there for when it is comparing against a fixed period.
 */
const dateWindowArgs = {
	lookback: z
		.enum(["1w", "1m", "3m", "6m", "1y", "all"])
		.optional()
		.describe("Relative window ending today. Defaults to none — pass this or startDate+endDate."),
	startDate: z.string().optional().describe("Window start, YYYY-MM-DD. Use with endDate instead of lookback."),
	endDate: z.string().optional().describe("Window end, YYYY-MM-DD."),
	timezone: z.string().optional().describe("IANA time zone the day boundaries are drawn in. Defaults to UTC."),
};

const modelArg = z.string().optional().describe("Restrict to one answer engine, by id from list_platforms.");

/** The window plus the two filters every brand-level analytics tool shares. */
const windowArgs = {
	...dateWindowArgs,
	model: modelArg,
	tags: z.string().optional().describe("Comma-separated prompt tags; only prompts carrying one are counted."),
};

const pagingArgs = {
	page: z.number().int().min(1).optional().describe("1-based page number."),
	limit: z.number().int().min(1).max(100).optional().describe("Rows per page, up to 100."),
};

type WindowArgs = z.output<z.ZodObject<typeof windowArgs>>;
type PagingArgs = z.output<z.ZodObject<typeof pagingArgs>>;

function windowFrom(args: WindowArgs) {
	return resolveAnalyticsWindow(args);
}

function filtersFrom(args: WindowArgs): AnalyticsFilters {
	return { model: args.model, tags: args.tags };
}

function pagingFrom(args: PagingArgs, defaultLimit = 20) {
	return resolvePaging(
		args.page === undefined ? null : String(args.page),
		args.limit === undefined ? null : String(args.limit),
		defaultLimit,
	);
}

// ============================================================================
// Identity and discovery
// ============================================================================

const whoami = defineTool({
	name: "whoami",
	title: "Identify this connection",
	description:
		"What this MCP connection is: who it acts as, which organizations and brands it reaches, and which tools it may call. Needs no permission, so it is always safe to call first when a request fails and it is not clear why.",
	readOnly: true,
	input: {},
	run: async ({ auth }) => {
		const deployment = getDeployment();
		const scopes = [...principalScopes(auth)].sort();
		const shared = {
			identity: principalLabel(auth),
			scopes,
			deployment: {
				mode: deployment.mode,
				billingEnabled: deployment.features.billing,
				readOnly: deployment.features.readOnly,
			},
			tools: toolsFor(auth).map((tool) => tool.name),
		};

		switch (auth.kind) {
			case "admin":
				return { ...shared, principal: "admin-key", organizationIds: null, brandIds: null };
			case "organization":
				return {
					...shared,
					principal: "organization-key",
					organizationIds: [auth.organizationId],
					organizationName: auth.organizationName,
					brandIds: auth.brandIds,
					expiresAt: auth.expiresAt,
				};
			case "user":
				return {
					...shared,
					principal: "oauth-session",
					userId: auth.userId,
					email: auth.email,
					organizationIds: auth.organizationIds,
					brandIds: null,
					expiresAt: auth.expiresAt,
				};
		}
	},
});

const listPlatforms = defineTool({
	name: "list_platforms",
	title: "List answer engines",
	description:
		"The answer engines this deployment knows about, and which of them it is actually tracking. Use the returned ids for the `model` filter on any analytics tool.",
	readOnly: true,
	input: {},
	run: async () => {
		// `configured` is what the operator has wired up; the rest of the catalogue
		// is still listed so a caller can tell "we don't run this" from "this isn't
		// a platform".
		let configured: Set<string>;
		try {
			configured = new Set(parseScrapeTargets(process.env.SCRAPE_TARGETS).map((target) => target.model));
		} catch {
			configured = new Set();
		}
		const premium = new Set(PREMIUM_MODELS);
		return {
			data: Object.keys(KNOWN_MODELS).map((id) => ({
				id,
				label: getModelMeta(id).label,
				premiumCapable: premium.has(id),
				configured: configured.has(id),
			})),
		};
	},
});

// ============================================================================
// Brands and competitors
// ============================================================================

const listBrands = defineTool({
	name: "list_brands",
	title: "List brands",
	description:
		"The brands this connection tracks. Start here: every other brand-scoped tool takes an id from this list.",
	scopes: ["brands:read"],
	readOnly: true,
	input: {
		q: z.string().optional().describe("Substring match on brand name or id."),
		enabled: z.boolean().optional().describe("Restrict to brands that are or aren't being tracked."),
		...pagingArgs,
	},
	run: async ({ auth }, args) => {
		const { limit, offset, page } = pagingFrom(args);
		const conditions: (SQL | undefined)[] = [await brandScopeCondition(auth, brands.id)];
		if (args.enabled !== undefined) conditions.push(eq(brands.enabled, args.enabled));
		if (args.q?.trim()) conditions.push(ilike(brands.name, `%${args.q.trim()}%`));
		const where = and(...conditions.filter(Boolean));

		const [totals] = await db.select({ count: count() }).from(brands).where(where);
		const rows = await db
			.select()
			.from(brands)
			.where(where)
			.orderBy(desc(brands.createdAt))
			.limit(limit)
			.offset(offset);

		const total = totals?.count ?? 0;
		return {
			data: rows.map(buildBrandResult),
			pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
		};
	},
});

const getBrand = defineTool({
	name: "get_brand",
	title: "Get one brand",
	description: "One brand's configuration: its domains, aliases, tracked platforms, and cadence.",
	scopes: ["brands:read"],
	readOnly: true,
	input: { brandId: brandIdArg },
	run: async ({ auth }, args) => buildBrandResult(await requireBrandInScope(auth, args.brandId)),
});

const listCompetitors = defineTool({
	name: "list_competitors",
	title: "List competitors",
	description:
		"The competitors tracked against a brand, with the domains and aliases a mention is matched on. These are what share of voice is measured against.",
	scopes: ["competitors:read"],
	readOnly: true,
	input: { brandId: brandIdArg, ...pagingArgs },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		const { limit, offset, page } = pagingFrom(args);
		const where = eq(competitors.brandId, brand.id);

		const [totals] = await db.select({ count: count() }).from(competitors).where(where);
		const data = await db
			.select({
				id: competitors.id,
				brandId: competitors.brandId,
				name: competitors.name,
				domains: competitors.domains,
				aliases: competitors.aliases,
				createdAt: competitors.createdAt,
				updatedAt: competitors.updatedAt,
			})
			.from(competitors)
			.where(where)
			.orderBy(desc(competitors.createdAt))
			.limit(limit)
			.offset(offset);

		const total = totals?.count ?? 0;
		return { brandId: brand.id, data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
	},
});

// ============================================================================
// Prompts
// ============================================================================

const listPromptsTool = defineTool({
	name: "list_prompts",
	title: "List prompts",
	description:
		"The prompts asked of the answer engines on a brand's behalf. `enabled` is what decides whether a prompt is still being sampled.",
	scopes: ["prompts:read"],
	readOnly: true,
	input: {
		brandId: brandIdArg.optional().describe("Restrict to one brand. Omit for every brand in reach."),
		enabled: z.boolean().optional().describe("Restrict to prompts that are or aren't being sampled."),
		tags: z.string().optional().describe("Comma-separated tags; a prompt carrying any of them matches."),
		q: z.string().optional().describe("Substring match on the prompt text."),
		...pagingArgs,
	},
	run: async ({ auth }, args) => {
		if (args.brandId) await requireBrandInScope(auth, args.brandId);
		const { limit, offset, page } = pagingFrom(args);
		const { data, total } = await listPrompts({
			scope: await brandScopeCondition(auth, prompts.brandId),
			brandId: args.brandId,
			enabled: args.enabled,
			tags: (args.tags ?? "").split(","),
			q: args.q,
			limit,
			offset,
		});
		return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
	},
});

const listPromptTags = defineTool({
	name: "list_prompt_tags",
	title: "List prompt tags",
	description:
		"The tags in use on a brand's prompts, with how many carry each. Tags are derived: one exists exactly as long as some prompt carries it.",
	scopes: ["prompts:read"],
	readOnly: true,
	input: { brandId: brandIdArg },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		return { brandId: brand.id, data: await listBrandTags(brand.id) };
	},
});

const createPromptsTool = defineTool({
	name: "create_prompts",
	title: "Create prompts",
	description: `Add up to ${MAX_PROMPT_BATCH} prompts to a brand in one call. All-or-nothing: a batch that would exceed the organization's plan creates none of it.`,
	scopes: ["prompts:write"],
	readOnly: false,
	input: {
		brandId: brandIdArg,
		prompts: z
			.array(
				z.object({
					value: z.string().describe("The question to ask, as a person would type it."),
					tags: z.array(z.string()).optional().describe("Free-form labels used for filtering analytics."),
					enabled: z.boolean().optional().describe("Whether to start sampling it. Defaults to true."),
				}),
			)
			.min(1)
			.max(MAX_PROMPT_BATCH)
			.describe("The prompts to add."),
	},
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId, "body");
		return { data: await createPrompts(brand, { prompts: args.prompts }) };
	},
});

const updatePromptTool = defineTool({
	name: "update_prompt",
	title: "Update a prompt",
	description:
		"Change a prompt's text, tags, or whether it is being sampled. Disabling is the reversible way to stop tracking one — history is kept.",
	scopes: ["prompts:write"],
	readOnly: false,
	input: {
		promptId: z.string().describe("Prompt id, from list_prompts."),
		value: z.string().optional().describe("Replacement text."),
		enabled: z.boolean().optional().describe("Whether to keep sampling it."),
		tags: z.array(z.string()).optional().describe("Replaces the prompt's tags outright."),
	},
	run: async ({ auth }, args) => {
		const brand = await brandForPrompt(auth, args.promptId);
		const { promptId, ...changes } = args;
		if (Object.values(changes).every((value) => value === undefined)) {
			throw new ApiError(400, "Validation Error", "Pass at least one of value, enabled, or tags");
		}
		return updatePrompt(brand, promptId, changes);
	},
});

const deletePromptTool = defineTool({
	name: "delete_prompt",
	title: "Delete a prompt",
	description:
		"Permanently remove a prompt and every answer and citation recorded for it. This cannot be undone — to stop tracking a prompt while keeping its history, call update_prompt with enabled: false instead.",
	scopes: ["prompts:delete"],
	readOnly: false,
	destructive: true,
	input: { promptId: z.string().describe("Prompt id, from list_prompts.") },
	run: async ({ auth }, args) => {
		await brandForPrompt(auth, args.promptId);
		const { prompt, deletedRunsCount } = await deletePrompt(args.promptId);
		return { ...prompt, deletedRunsCount };
	},
});

/**
 * The brand a prompt belongs to, if the caller reaches it. A prompt in another
 * tenant is reported exactly as one that doesn't exist, which is why both
 * failures raise the same error.
 */
async function brandForPrompt(auth: Principal, promptId: string) {
	const notFound = () => new ApiError(404, "Not Found", `Prompt with ID '${promptId}' not found`);
	const prompt = await requirePrompt(promptId).catch(() => {
		throw notFound();
	});
	return requireBrandInScope(auth, prompt.brandId).catch(() => {
		throw notFound();
	});
}

// ============================================================================
// Analytics
// ============================================================================

const getVisibility = defineTool({
	name: "get_visibility",
	title: "Get visibility",
	description:
		"How often the answer engines mentioned the brand over a window: the headline figures plus the daily trend behind them. The first thing to read when asked how a brand is doing.",
	scopes: ["analytics:read"],
	readOnly: true,
	input: { brandId: brandIdArg, ...windowArgs },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		const range = windowFrom(args);
		const filters = filtersFrom(args);
		const [summary, visibility] = await Promise.all([
			getBrandSummary(brand.id, range, filters),
			getBrandVisibility(brand.id, range, filters),
		]);
		return { brandId: brand.id, range, summary, series: visibility.series };
	},
});

const getShareOfVoice = defineTool({
	name: "get_share_of_voice",
	title: "Get share of voice",
	description:
		"The brand's share of mentions against its tracked competitors, as a leaderboard and over time. Shares are fractions of 1, not percentages.",
	scopes: ["analytics:read"],
	readOnly: true,
	input: { brandId: brandIdArg, ...windowArgs },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		const range = windowFrom(args);
		return { brandId: brand.id, range, ...(await getBrandShareOfVoice(brand.id, range, filtersFrom(args))) };
	},
});

const getPlatformBreakdown = defineTool({
	name: "get_platform_breakdown",
	title: "Get per-engine visibility",
	description: "Where the brand is strong and where it is invisible, one row per answer engine.",
	scopes: ["analytics:read"],
	readOnly: true,
	input: { brandId: brandIdArg, ...windowArgs },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		const range = windowFrom(args);
		return { brandId: brand.id, range, data: await getBrandPlatformBreakdown(brand.id, range, filtersFrom(args)) };
	},
});

const getPromptPerformance = defineTool({
	name: "get_prompt_performance",
	title: "Get per-prompt performance",
	description:
		"How each prompt performed over the window — which questions surface the brand and which don't. Enabled prompts only; a disabled one isn't sampled, so it has nothing to report.",
	scopes: ["analytics:read"],
	readOnly: true,
	input: { brandId: brandIdArg, ...windowArgs, ...pagingArgs },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		const range = windowFrom(args);
		const { page, limit } = pagingFrom(args);
		const rows = await getBrandPromptPerformance(brand.id, range, filtersFrom(args));
		return { brandId: brand.id, range, ...paginate(rows, page, limit) };
	},
});

const getCitations = defineTool({
	name: "get_citations",
	title: "Get cited sources",
	description:
		"The pages the answer engines cited while answering about this brand, grouped by domain and by URL, and categorized as the brand's own, a competitor's, or editorial. The core of an AEO content plan: the editorial pages here are where the engines are getting their answers.",
	scopes: ["analytics:read"],
	readOnly: true,
	input: {
		brandId: brandIdArg,
		groupBy: z.enum(["domain", "url"]).optional().describe("Which grouping to page through. Defaults to domain."),
		...windowArgs,
		...pagingArgs,
	},
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		const range = windowFrom(args);
		const { page, limit } = pagingFrom(args);
		const { domains, urls, totals } = await getBrandCitations(brand.id, range, filtersFrom(args));
		return {
			brandId: brand.id,
			range,
			groupBy: args.groupBy ?? "domain",
			totals: { citations: totals.citations, uniqueDomains: totals.uniqueDomains, uniqueUrls: totals.uniqueUrls },
			...(args.groupBy === "url" ? paginate(urls, page, limit) : paginate(domains, page, limit)),
		};
	},
});

const getQueryFanout = defineTool({
	name: "get_query_fanout",
	title: "Get search queries the engines ran",
	description:
		"The web searches the answer engines actually ran while answering, and how often. These are the phrasings to optimize for — they are frequently not the prompt's own wording.",
	scopes: ["analytics:read"],
	readOnly: true,
	input: { brandId: brandIdArg, ...windowArgs, ...pagingArgs },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		const range = windowFrom(args);
		const { page, limit } = pagingFrom(args);
		const analysis = await getBrandQueryFanout(brand.id, range, filtersFrom(args), { uncapped: true });
		// topByRuns carries both figures per query, which is what a caller paging
		// this list wants; topQueries carries only an instance count.
		const queries = analysis.topByRuns.map((entry) => ({
			query: entry.query,
			runs: entry.runs,
			promptCount: entry.prompts,
		}));
		return {
			brandId: brand.id,
			range,
			totalQueries: analysis.totalQueries,
			uniqueQueries: analysis.uniqueQueries,
			fanoutRuns: analysis.fanoutRuns,
			totalRuns: analysis.totalRuns,
			avgQueriesPerRun: analysis.avgPerExecution,
			coverageRate: analysis.coverageRate,
			...paginate(queries, page, limit),
		};
	},
});

const getOpportunities = defineTool({
	name: "get_opportunities",
	title: "Get the latest opportunities report",
	description:
		"The most recent stored opportunities report for a brand: what to write, what to fix, and the risks Elmo found. Never regenerates — `status` says whether one exists and whether there was enough data to write it.",
	scopes: ["analytics:read"],
	readOnly: true,
	input: { brandId: brandIdArg },
	run: async ({ auth }, args) => {
		const brand = await requireBrandInScope(auth, args.brandId);
		const [row] = await db
			.select()
			.from(brandOpportunities)
			.where(eq(brandOpportunities.brandId, brand.id))
			.orderBy(desc(brandOpportunities.createdAt))
			.limit(1);

		if (!row) {
			return {
				brandId: brand.id,
				status: "not-generated",
				generatedAt: null,
				model: null,
				summary: [],
				opportunities: [],
				risks: [],
			};
		}

		const report = row.report as {
			summary?: unknown[];
			opportunities?: unknown[];
			risks?: unknown[];
		};
		const opportunities = report.opportunities ?? [];
		return {
			brandId: brand.id,
			// A stored report with nothing in it is what "not enough tracked answers
			// yet" looks like on disk.
			status: opportunities.length > 0 ? "ready" : "insufficient-data",
			generatedAt: row.createdAt,
			model: row.model,
			summary: report.summary ?? [],
			opportunities,
			risks: report.risks ?? [],
		};
	},
});

// ============================================================================
// Runs
// ============================================================================

const listRuns = defineTool({
	name: "list_runs",
	title: "List answers recorded for a prompt",
	description:
		"Metadata for the answers recorded for one prompt, newest first. The answer text lives on get_run, which keeps this list small enough to page through.",
	scopes: ["runs:read"],
	readOnly: true,
	input: {
		promptId: z.string().describe("Prompt id, from list_prompts."),
		model: modelArg,
		...dateWindowArgs,
		...pagingArgs,
	},
	run: async ({ auth }, args) => {
		const [prompt] = await db
			.select({ id: prompts.id, brandId: prompts.brandId })
			.from(prompts)
			.where(eq(prompts.id, args.promptId))
			.limit(1);
		if (!prompt || !(await isBrandInScope(auth, prompt.brandId))) {
			throw new ApiError(404, "Not Found", `Prompt with ID '${args.promptId}' not found`);
		}

		const { startDate, endDate, timezone } = windowFrom(args);
		const { page, limit, offset } = pagingFrom(args);

		// Both go through the read layer's timezone-aware, half-open window, so a
		// run just after local midnight lands on the day the caller asked about
		// rather than the day UTC happens to be on.
		const [rows, total] = await Promise.all([
			getPromptRuns(args.promptId, startDate, endDate, timezone, limit, offset, args.model),
			countPromptRuns(args.promptId, startDate, endDate, timezone, args.model),
		]);

		return {
			data: rows.map((row) => ({
				id: row.id,
				promptId: row.prompt_id,
				brandId: row.brand_id,
				model: row.model,
				provider: row.provider,
				webSearchEnabled: row.web_search_enabled,
				brandMentioned: row.brand_mentioned,
				competitorsMentioned: row.competitors_mentioned,
				webQueries: row.web_queries,
				citationCount: row.citation_count,
				createdAt: row.created_at,
			})),
			pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
		};
	},
});

const getRun = defineTool({
	name: "get_run",
	title: "Get one answer in full",
	description:
		"One recorded answer: the engine's reply as text, and every page it cited. Read this when you need to know *how* an engine described the brand, not just whether it did.",
	scopes: ["runs:read"],
	readOnly: true,
	input: { runId: z.string().describe("Run id, from list_runs.") },
	run: async ({ auth }, args) => {
		const [run] = await db.select().from(promptRuns).where(eq(promptRuns.id, args.runId)).limit(1);
		if (!run || !(await isBrandInScope(auth, run.brandId))) {
			throw new ApiError(404, "Not Found", `Run with ID '${args.runId}' not found`);
		}

		const cited = await db
			.select({
				url: citations.url,
				domain: citations.domain,
				title: citations.title,
				citationIndex: citations.citationIndex,
			})
			.from(citations)
			.where(eq(citations.promptRunId, run.id))
			.orderBy(asc(citations.citationIndex));

		// Older rows predate the provider column; the model name is the extractor's
		// other accepted key, so it is the right fallback.
		const text = extractTextContent(run.rawOutput, run.provider ?? run.model);

		return {
			id: run.id,
			promptId: run.promptId,
			brandId: run.brandId,
			model: run.model,
			provider: run.provider,
			webSearchEnabled: run.webSearchEnabled,
			brandMentioned: run.brandMentioned,
			competitorsMentioned: run.competitorsMentioned,
			webQueries: run.webQueries,
			citationCount: cited.length,
			createdAt: run.createdAt,
			// The normalized extraction, never the provider's own payload: that
			// shape belongs to the provider, and exposing it would quietly make it
			// part of this surface's contract.
			answer: { text: text || null },
			citations: cited,
		};
	},
});

// ============================================================================
// The registry
// ============================================================================

export const MCP_TOOLS: readonly McpTool[] = [
	whoami,
	listPlatforms,
	listBrands,
	getBrand,
	listCompetitors,
	listPromptsTool,
	listPromptTags,
	createPromptsTool,
	updatePromptTool,
	deletePromptTool,
	getVisibility,
	getShareOfVoice,
	getPlatformBreakdown,
	getPromptPerformance,
	getCitations,
	getQueryFanout,
	getOpportunities,
	listRuns,
	getRun,
];

/**
 * The tools a given connection is offered.
 *
 * Filtering here rather than refusing at call time is the point: `tools/list`
 * becomes an honest statement of what this connection can do, so a model never
 * plans around a tool it will be told off for using. A read-only deployment
 * drops every writer for the same reason.
 */
export function toolsFor(auth: Principal): McpTool[] {
	const held = principalScopes(auth);
	const readOnlyDeployment = getDeployment().features.readOnly;
	return MCP_TOOLS.filter((tool) => {
		if (readOnlyDeployment && !tool.readOnly) return false;
		return tool.scopes.every((scope) => held.has(scope));
	});
}

/** Every scope some tool asks for — the set a key needs to reach all of them. */
export const TOOL_SCOPES: readonly ApiScope[] = API_SCOPES.filter((scope) =>
	MCP_TOOLS.some((tool) => tool.scopes.includes(scope)),
);
