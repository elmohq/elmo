/**
 * Server function for the "Citation landscape" insights on the Citations page.
 * Reads only (Postgres + the DR cache — no DB writes). Returns the data for the
 * cited-domains / cited-URLs tables, the per-prompt citation map, and (derived
 * client-side from promptDistributions) the competitor page-opportunities graph.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import { computeDrVolatility, computePromptDomainDistribution, type DomainKind } from "@workspace/lib/citation-landscape";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { hasTagFilter, resolveEnabledPromptIds } from "@/lib/citation-filters";
import {
	getCitationPromptDomainPageStats,
	getCitationRunDomainStats,
	getCitationUrlStats,
	getPromptWebSearchRunCounts,
} from "@/lib/postgres-read";
import { loadDomainRatings, warmDomainRatings } from "@/lib/domain-rating-cache";
import { categorizeDomain as categorizeDomainShared, type CitationCategory, extractDomain } from "@/lib/domain-categories";

export const getCitationInsightsFn = createServerFn({ method: "GET" })
	.inputValidator(
		z.object({
			brandId: z.string(),
			days: z.number().optional().default(7),
			tags: z.string().optional(),
			model: z.string().optional(),
		}),
	)
	.handler(async ({ data }) => {
		const session = await requireAuthSession();
		await requireOrgAccess(session.user.id, data.brandId);

		const toDate = new Date();
		const fromDate = new Date();
		fromDate.setDate(fromDate.getDate() - data.days);
		const fromDateStr = fromDate.toISOString().split("T")[0];
		const toDateStr = toDate.toISOString().split("T")[0];
		const timezone = "UTC";

		const [brandResult, competitorsList, allPrompts] = await Promise.all([
			db.select().from(brands).where(eq(brands.id, data.brandId)).limit(1),
			db.select().from(competitors).where(eq(competitors.brandId, data.brandId)),
			db
				.select({ id: prompts.id, value: prompts.value, tags: prompts.tags, systemTags: prompts.systemTags })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
		]);

		const brandDomainSet = new Set(
			[extractDomain(brandResult[0]?.website || ""), ...(brandResult[0]?.additionalDomains || []).map(extractDomain)].filter(Boolean),
		);
		const competitorDomainSet = new Set(competitorsList.flatMap((c) => c.domains.map(extractDomain)).filter(Boolean));
		const kindOf = (domain: string): DomainKind => {
			const matches = (set: Set<string>) => [...set].some((d) => domain === d || domain.endsWith(`.${d}`));
			if (matches(brandDomainSet)) return "own";
			if (matches(competitorDomainSet)) return "competitor";
			return "third_party";
		};
		const categorize = (d: string): CitationCategory => categorizeDomainShared(d, brandDomainSet, competitorDomainSet);

		const enabledPromptIds = resolveEnabledPromptIds(allPrompts, data.tags);
		const empty = {
			pending: 0,
			domainTable: [] as {
				domain: string;
				category: CitationCategory;
				citations: number;
				rating: number | null;
				volatility: number | null;
			}[],
			urlTable: [] as {
				url: string;
				title: string | null;
				domain: string;
				category: CitationCategory;
				citations: number;
				avgPosition: number | null;
				prompts: number;
			}[],
			promptDistributions: [] as ReturnType<typeof computePromptDomainDistribution>,
		};
		if (hasTagFilter(data.tags) && enabledPromptIds.length === 0) return empty;

		const [urlStats, runDomain, webSearchRuns, pageStats] = await Promise.all([
			getCitationUrlStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
			getCitationRunDomainStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
			getPromptWebSearchRunCounts(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
			getCitationPromptDomainPageStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
		]);
		if (runDomain.length === 0) return empty;

		// Run-level stats by normalized domain — powers volatility + the domain universe/totals.
		const runsByPrompt: Record<string, number> = {};
		for (const r of webSearchRuns) runsByPrompt[r.prompt_id] = r.runs;
		const runStatsMap = new Map<string, { promptId: string; domain: string; total: number; sumsq: number; runsPresent: number }>();
		const domainTotals = new Map<string, number>();
		const kindByDomain: Record<string, DomainKind> = {};
		for (const r of runDomain) {
			const domain = extractDomain(r.domain);
			if (!kindByDomain[domain]) kindByDomain[domain] = kindOf(domain);
			domainTotals.set(domain, (domainTotals.get(domain) ?? 0) + r.total);
			const key = `${r.prompt_id} ${domain}`;
			const existing = runStatsMap.get(key);
			if (existing) {
				existing.total += r.total;
				existing.sumsq += r.sumsq;
				existing.runsPresent += r.runs_present;
			} else {
				runStatsMap.set(key, { promptId: r.prompt_id, domain, total: r.total, sumsq: r.sumsq, runsPresent: r.runs_present });
			}
		}
		const runStats = [...runStatsMap.values()];

		// Per-(prompt, domain) citation + distinct-page counts (normalized domain).
		const pageAgg = new Map<string, { promptId: string; domain: string; citations: number; pages: number }>();
		for (const r of pageStats) {
			const domain = extractDomain(r.domain);
			const key = `${r.prompt_id} ${domain}`;
			const existing = pageAgg.get(key);
			if (existing) {
				existing.citations += r.citations;
				existing.pages += r.pages;
			} else {
				pageAgg.set(key, { promptId: r.prompt_id, domain, citations: r.citations, pages: r.pages });
			}
		}

		const allDomains = [...domainTotals.keys()];
		let { ratings, missing } = await loadDomainRatings(allDomains);
		if (missing.length > 0) {
			await warmDomainRatings(missing);
			({ ratings, missing } = await loadDomainRatings(allDomains));
		}
		const ratingsRecord: Record<string, number | null> = {};
		for (const d of allDomains) ratingsRecord[d] = ratings.get(d) ?? null;

		const drVolatility = computeDrVolatility({ runStats, runsByPrompt, ratings: ratingsRecord, kindOf: kindByDomain });
		const volByDomain = new Map(drVolatility.points.map((p) => [p.domain, p.volatility]));

		const domainTable = [...domainTotals.entries()]
			.map(([domain, citations]) => ({
				domain,
				category: categorize(domain),
				citations,
				rating: ratingsRecord[domain] ?? null,
				volatility: volByDomain.get(domain) ?? null,
			}))
			.sort((a, b) => b.citations - a.citations)
			.slice(0, 2000);

		const urlTable = urlStats
			.map((u) => {
				const domain = extractDomain(u.domain);
				return {
					url: u.url,
					title: u.title,
					domain,
					category: categorize(domain),
					citations: u.count,
					avgPosition: u.avg_position,
					prompts: u.prompt_count,
				};
			})
			.sort((a, b) => b.citations - a.citations)
			.slice(0, 2000);

		const promptDistributions = computePromptDomainDistribution({
			rows: [...pageAgg.values()],
			promptValues: Object.fromEntries(allPrompts.map((p) => [p.id, p.value])),
			ratings: ratingsRecord,
			kindOf: kindByDomain,
		});

		return {
			pending: missing.length,
			domainTable,
			urlTable,
			promptDistributions,
		};
	});

export type CitationInsightsResult = Awaited<ReturnType<typeof getCitationInsightsFn>>;
