/**
 * Per-prompt and per-platform figures for the exportable report. Rates here are
 * plain 30-day averages over runs (mentions / runs), unlike the smoothed trend
 * lines on the dashboard, so every row can be recomputed from its own counts.
 */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands } from "@workspace/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import { extractDomain } from "@/lib/domain-categories";
import { categorizeDomain } from "@/lib/domain-categories.server";
import {
	getPerPromptModelCitationDomains,
	getPerPromptModelCompetitorMentions,
	getPerPromptModelRunStats,
} from "@/lib/postgres-read";
import { isBrandedPrompt } from "@/lib/prompt-tags";
import { getTimezoneLookbackRange, resolveTimezone } from "@/lib/timezone-utils";
import { resolveFilteredPrompts } from "@/server/prompt-resolution";

/** Figures for one slice of runs (a platform, a prompt, or a prompt on one platform). */
export interface ReportSlice {
	runs: number;
	brandMentions: number;
	/** Share of runs naming the brand, 0..100; null without runs. */
	visibility: number | null;
	/** Brand mentions / (brand + competitor mentions), 0..100; null when nobody was named. */
	shareOfVoice: number | null;
	topCompetitor: string | null;
	/** Share of runs naming the top competitor, 0..100. */
	topCompetitorRate: number | null;
	citations: number;
	/** Citations pointing at the brand's own domains. */
	ownSiteCitations: number;
	/** Most-cited domains, most first. */
	topDomains: string[];
	lastRunAt: string | null;
}

export interface ReportPrompt extends ReportSlice {
	value: string;
	tags: string[];
	branded: boolean;
	byModel: Record<string, ReportSlice>;
	competitors: { name: string; mentions: number; rate: number }[];
}

export interface ReportDataResponse {
	models: string[];
	byModel: Record<string, ReportSlice>;
	prompts: ReportPrompt[];
}

interface Tally {
	runs: number;
	brandMentions: number;
	competitors: Map<string, number>;
	domains: Map<string, number>;
	ownSiteCitations: number;
	lastRunAt: string | null;
}

const TOP_DOMAINS = 3;

function emptyTally(): Tally {
	return { runs: 0, brandMentions: 0, competitors: new Map(), domains: new Map(), ownSiteCitations: 0, lastRunAt: null };
}

function tallyFor<K>(map: Map<K, Tally>, key: K): Tally {
	let tally = map.get(key);
	if (!tally) {
		tally = emptyTally();
		map.set(key, tally);
	}
	return tally;
}

const add = (map: Map<string, number>, key: string, n: number) => map.set(key, (map.get(key) ?? 0) + n);
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

function toSlice(t: Tally): ReportSlice {
	const [top] = [...t.competitors].sort((a, b) => b[1] - a[1]);
	const competitorMentions = [...t.competitors.values()].reduce((s, n) => s + n, 0);
	return {
		runs: t.runs,
		brandMentions: t.brandMentions,
		visibility: percent(t.brandMentions, t.runs),
		shareOfVoice: percent(t.brandMentions, t.brandMentions + competitorMentions),
		topCompetitor: top?.[0] ?? null,
		topCompetitorRate: top ? percent(top[1], t.runs) : null,
		citations: [...t.domains.values()].reduce((s, n) => s + n, 0),
		ownSiteCitations: t.ownSiteCitations,
		topDomains: [...t.domains]
			.sort((a, b) => b[1] - a[1])
			.slice(0, TOP_DOMAINS)
			.map(([domain]) => domain),
		lastRunAt: t.lastRunAt,
	};
}

export const getReportDataFn = createServerFn({ method: "GET" })
	.validator(z.object({ brandId: z.string(), timezone: z.string().default("UTC") }))
	.handler(async ({ data }): Promise<ReportDataResponse> => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		const timezone = resolveTimezone(data.timezone);
		const { fromDateStr, toDateStr } = getTimezoneLookbackRange("1m", timezone) as {
			fromDateStr: string;
			toDateStr: string;
		};
		const prompts = await resolveFilteredPrompts(data.brandId, {});
		const promptIds = prompts.map((p) => p.id);

		const [[brand], runRows, competitorRows, domainRows] = await Promise.all([
			db
				.select({ website: brands.website, additionalDomains: brands.additionalDomains })
				.from(brands)
				.where(eq(brands.id, data.brandId))
				.limit(1),
			getPerPromptModelRunStats(data.brandId, fromDateStr, toDateStr, timezone, promptIds),
			getPerPromptModelCompetitorMentions(data.brandId, fromDateStr, toDateStr, timezone, promptIds),
			getPerPromptModelCitationDomains(data.brandId, fromDateStr, toDateStr, timezone, promptIds),
		]);

		const brandDomains = new Set(
			[extractDomain(brand?.website || ""), ...(brand?.additionalDomains || []).map(extractDomain)].filter(Boolean),
		);
		const isOwnSite = (domain: string) => categorizeDomain(domain, brandDomains, new Set()) === "brand";

		// Every row lands in three tallies: its platform, its prompt, and the pair.
		const byModel = new Map<string, Tally>();
		const byPrompt = new Map<string, Tally>();
		const byPair = new Map<string, Tally>();
		const tallies = (promptId: string, model: string) => [
			tallyFor(byModel, model),
			tallyFor(byPrompt, promptId),
			tallyFor(byPair, `${promptId}|${model}`),
		];

		for (const row of runRows) {
			for (const t of tallies(row.prompt_id, row.model)) {
				t.runs += row.runs;
				t.brandMentions += row.brand_mentions;
				if (!t.lastRunAt || row.last_run_at > t.lastRunAt) t.lastRunAt = row.last_run_at;
			}
		}
		for (const row of competitorRows) {
			for (const t of tallies(row.prompt_id, row.model)) add(t.competitors, row.competitor, row.mentions);
		}
		for (const row of domainRows) {
			const own = isOwnSite(row.domain);
			for (const t of tallies(row.prompt_id, row.model)) {
				add(t.domains, row.domain, row.count);
				if (own) t.ownSiteCitations += row.count;
			}
		}

		const models = [...byModel].sort((a, b) => b[1].runs - a[1].runs).map(([model]) => model);

		return {
			models,
			byModel: Object.fromEntries(models.map((model) => [model, toSlice(tallyFor(byModel, model))])),
			prompts: prompts.map((p) => {
				const tally = tallyFor(byPrompt, p.id);
				return {
					...toSlice(tally),
					value: p.value,
					tags: p.tags ?? [],
					branded: isBrandedPrompt(p),
					byModel: Object.fromEntries(
						models
							.filter((model) => byPair.has(`${p.id}|${model}`))
							.map((model) => [model, toSlice(tallyFor(byPair, `${p.id}|${model}`))]),
					),
					competitors: [...tally.competitors]
						.sort((a, b) => b[1] - a[1])
						.map(([name, mentions]) => ({ name, mentions, rate: percent(mentions, tally.runs) ?? 0 })),
				};
			}),
		};
	});
