import { z } from "zod";
import { db } from "@workspace/lib/db/db";
import { brands, brandOpportunities } from "@workspace/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { KNOWN_MODELS, getModelMeta } from "@workspace/lib/providers";
import { getTimezoneLookbackRange } from "@/lib/timezone-utils";
import {
	getDashboardSummary,
	getBrandMentionRateByModel,
	getPerPromptRunStats,
	getPromptMentionSummary,
	getPromptTopCompetitorMentions,
	getPerPromptCitationPages,
} from "@/lib/postgres-read";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";
import { getPromptById, BrandNotFoundError } from "@/server/prompts-core";
import type { ElmoTool } from "./types";

const TIMEZONE = "UTC";

const list_models: ElmoTool = {
	name: "list_models",
	description:
		"List the LLM models elmo can track (id, label, icon). Pass a brandId to see which models are enabled for that brand.",
	readOnlySafe: true,
	inputSchema: {
		brandId: z.string().optional(),
	},
	handler: async (args) => {
		const brandId = args.brandId as string | undefined;
		const allModels = Object.keys(KNOWN_MODELS).map((id) => ({
			id,
			label: getModelMeta(id).label,
			iconId: getModelMeta(id).iconId,
		}));

		if (!brandId) {
			return { models: allModels };
		}

		const rows = await db
			.select({ enabledModels: brands.enabledModels, name: brands.name })
			.from(brands)
			.where(eq(brands.id, brandId))
			.limit(1);

		if (rows.length === 0) throw new BrandNotFoundError(brandId);
		const brand = rows[0];

		const models = allModels.map((m) => ({
			...m,
			enabled:
				brand.enabledModels === null || brand.enabledModels === undefined
					? true
					: brand.enabledModels.includes(m.id),
		}));

		return { models, brandEnabledModels: brand.enabledModels ?? null };
	},
};

const get_performance: ElmoTool = {
	name: "get_performance",
	description:
		"Get AI-visibility performance for a brand over a lookback window (1w/1m/3m/6m/1y/all; 'all' = trailing 12 months). Returns the dashboard summary plus a per-model mention-rate breakdown.",
	readOnlySafe: true,
	inputSchema: {
		brandId: z.string(),
		lookback: z.enum(["1w", "1m", "3m", "6m", "1y", "all"]).optional(),
	},
	handler: async (args) => {
		const brandId = args.brandId as string;
		const lookback =
			(args.lookback as "1w" | "1m" | "3m" | "6m" | "1y" | "all" | undefined) ?? "1m";
		const { fromDateStr: from, toDateStr: to } = getTimezoneLookbackRange(lookback, TIMEZONE, {
			allStrategy: "1y",
		});

		const enabledPromptIds = (await resolveFilteredPrompts(brandId, {})).map((p) => p.id);

		if (enabledPromptIds.length === 0) {
			return {
				brandId,
				lookback,
				range: { from, to },
				summary: null,
				modelBreakdown: [],
				note: "This brand has no enabled prompts, so there is no performance data.",
			};
		}

		const [summary] = await getDashboardSummary(brandId, from, to, TIMEZONE, enabledPromptIds);
		const byModel = await getBrandMentionRateByModel(
			brandId,
			from as string,
			to as string,
			TIMEZONE,
			enabledPromptIds,
		);

		const modelBreakdown = byModel.map((r) => ({
			model: r.model,
			label: getModelMeta(r.model).label,
			runs: r.runs,
			brandMentionedCount: r.brand_mentioned_count,
			mentionRate: r.runs > 0 ? r.brand_mentioned_count / r.runs : 0,
		}));

		return {
			brandId,
			lookback,
			range: { from, to },
			summary: summary ?? null,
			modelBreakdown,
		};
	},
};

const get_prompt_stats: ElmoTool = {
	name: "get_prompt_stats",
	description:
		"Get detailed stats for a single prompt over a lookback window ('all' = trailing 12 months): mention summary, top competitor mentions, run stats, and cited pages.",
	readOnlySafe: true,
	inputSchema: {
		promptId: z.string(),
		lookback: z.enum(["1w", "1m", "3m", "6m", "1y", "all"]).optional(),
	},
	handler: async (args) => {
		const promptId = args.promptId as string;
		const lookback =
			(args.lookback as "1w" | "1m" | "3m" | "6m" | "1y" | "all" | undefined) ?? "all";
		const prompt = await getPromptById(promptId);
		const { fromDateStr: from, toDateStr: to } = getTimezoneLookbackRange(lookback, TIMEZONE, {
			allStrategy: "1y",
		});

		const [mentionSummary, topCompetitors, runStatsRows, citationPages] = await Promise.all([
			getPromptMentionSummary(promptId, from as string, to as string, TIMEZONE),
			getPromptTopCompetitorMentions(promptId, from as string, to as string, TIMEZONE, 10),
			getPerPromptRunStats(prompt.brandId, from as string, to as string, TIMEZONE, [promptId]),
			getPerPromptCitationPages(prompt.brandId, from as string, to as string, TIMEZONE, [promptId]),
		]);

		const runStats = runStatsRows.find((r) => r.prompt_id === promptId) ?? null;

		return {
			promptId,
			brandId: prompt.brandId,
			lookback,
			range: { from, to },
			mentionSummary,
			topCompetitors,
			runStats,
			citationPages,
		};
	},
};

const get_opportunities: ElmoTool = {
	name: "get_opportunities",
	description:
		"Fetch the most recent stored AI-visibility opportunities report for a brand (with its age). Does not generate a new report.",
	readOnlySafe: true,
	inputSchema: {
		brandId: z.string(),
	},
	handler: async (args) => {
		const brandId = args.brandId as string;
		const [row] = await db
			.select()
			.from(brandOpportunities)
			.where(eq(brandOpportunities.brandId, brandId))
			.orderBy(desc(brandOpportunities.createdAt))
			.limit(1);

		if (!row) {
			return {
				brandId,
				report: null,
				note: "No opportunities report has been generated for this brand yet.",
			};
		}

		const ageMs = Date.now() - new Date(row.createdAt).getTime();
		const ageDays = Math.floor(ageMs / 86_400_000);

		return {
			brandId,
			generatedAt: row.createdAt,
			model: row.model,
			ageDays,
			note: `Latest stored opportunities report, generated ${ageDays} day(s) ago. Regenerate via the elmo UI if stale.`,
			report: row.report,
		};
	},
};

export const analyticsTools: ElmoTool[] = [
	list_models,
	get_performance,
	get_prompt_stats,
	get_opportunities,
];
