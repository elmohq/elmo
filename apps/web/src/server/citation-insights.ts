/**
 * Server function for the experimental "Citation landscape" insights on the
 * Citations page. Reads only (Postgres + the local DR cache — no DB writes) and
 * computes five AEO-actionable cuts via the pure utils in @workspace/lib:
 *   DR quadrants, source-type mix, kingmaker placement targets, prompt
 *   winnability, and the share-of-citations scoreboard.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts } from "@workspace/lib/db/schema";
import {
	computeDrQuadrants,
	computeDrVolatility,
	computeKingmakers,
	computePromptDomainDistribution,
	computeScoreboard,
	computeWinnability,
	type DomainKind,
	type LandscapeDomain,
	pickCandidateCompetitors,
	summarizeDrBySourceType,
} from "@workspace/lib/citation-landscape";
import { classifySourceType, summarizeSourceTypes } from "@workspace/lib/source-type";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { requireAuthSession, requireOrgAccess } from "@/lib/auth/helpers";
import { hasTagFilter, resolveEnabledPromptIds } from "@/lib/citation-filters";
import {
	getCitationPromptDomainPageStats,
	getCitationPromptDomainStats,
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

		const brandDomains = [extractDomain(brandResult[0]?.website || ""), ...(brandResult[0]?.additionalDomains || []).map(extractDomain)].filter(Boolean);
		const competitorList = competitorsList.map((c) => ({ name: c.name, domains: c.domains.map(extractDomain).filter(Boolean) }));
		const brandDomainSet = new Set(brandDomains);
		const competitorDomainSet = new Set(competitorList.flatMap((c) => c.domains));

		const enabledPromptIds = resolveEnabledPromptIds(allPrompts, data.tags);
		const empty = {
			pending: 0,
			totalDomains: 0,
			drQuadrants: computeDrQuadrants([]),
			sourceTypes: [] as ReturnType<typeof summarizeSourceTypes>,
			kingmakers: [] as (ReturnType<typeof computeKingmakers>[number] & { examples: string[] })[],
			winnability: [] as ReturnType<typeof computeWinnability>,
			scoreboard: computeScoreboard({ edges: [], brandDomains, competitors: competitorList }),
			drVolatility: computeDrVolatility({ runStats: [], runsByPrompt: {}, ratings: {}, kindOf: {} }),
			drBySourceType: [] as ReturnType<typeof summarizeDrBySourceType>,
			promptDistributions: [] as ReturnType<typeof computePromptDomainDistribution>,
			brandRating: null as number | null,
			brandedShare: {
				branded: { brand: 0, total: 0, share: 0 },
				unbranded: { brand: 0, total: 0, share: 0 },
			},
			untrackedCompetitors: [] as ReturnType<typeof pickCandidateCompetitors>,
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
		};
		if (hasTagFilter(data.tags) && enabledPromptIds.length === 0) return empty;

		const [promptDomain, urlStats, runDomain, webSearchRuns, pageStats] = await Promise.all([
			getCitationPromptDomainStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
			getCitationUrlStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
			getCitationRunDomainStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
			getPromptWebSearchRunCounts(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
			getCitationPromptDomainPageStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
		]);
		if (promptDomain.length === 0) return empty;

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

		// Run-level stats (normalized domain) for volatility + winnability.
		const runsByPrompt: Record<string, number> = {};
		for (const r of webSearchRuns) runsByPrompt[r.prompt_id] = r.runs;
		const runStatsMap = new Map<string, { promptId: string; domain: string; total: number; sumsq: number; runsPresent: number }>();
		for (const r of runDomain) {
			const domain = extractDomain(r.domain);
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

		const kindOf = (domain: string): DomainKind => {
			const matches = (set: Set<string>) => [...set].some((d) => domain === d || domain.endsWith(`.${d}`));
			if (matches(brandDomainSet)) return "own";
			if (matches(competitorDomainSet)) return "competitor";
			return "third_party";
		};

		// Aggregate the (prompt, model, domain) fact table by normalized domain.
		const kindByDomain: Record<string, DomainKind> = {};
		const modelsByDomain: Record<string, Set<string>> = {};
		const domainTotals = new Map<string, number>();
		const brandCitedPromptIds = new Set<string>();
		const edges = promptDomain.map((row) => {
			const domain = extractDomain(row.domain);
			if (!kindByDomain[domain]) kindByDomain[domain] = kindOf(domain);
			if (!modelsByDomain[domain]) modelsByDomain[domain] = new Set();
			modelsByDomain[domain].add(row.model);
			domainTotals.set(domain, (domainTotals.get(domain) ?? 0) + row.count);
			if (kindByDomain[domain] === "own") brandCitedPromptIds.add(row.prompt_id);
			return { promptId: row.prompt_id, model: row.model, domain, count: row.count };
		});

		const allDomains = [...domainTotals.keys()];
		let { ratings, missing } = loadDomainRatings(allDomains);
		if (missing.length > 0) {
			await warmDomainRatings(missing);
			({ ratings, missing } = loadDomainRatings(allDomains));
		}
		const ratingsRecord: Record<string, number | null> = {};
		for (const d of allDomains) ratingsRecord[d] = ratings.get(d) ?? null;

		const landscapeDomains: LandscapeDomain[] = allDomains.map((domain) => ({
			domain,
			count: domainTotals.get(domain) ?? 0,
			rating: ratingsRecord[domain],
			kind: kindByDomain[domain],
		}));

		const kingmakers = computeKingmakers({
			edges: edges.map((e) => ({ promptId: e.promptId, domain: e.domain, count: e.count })),
			kindOf: kindByDomain,
			brandCitedPromptIds: [...brandCitedPromptIds],
			ratings: ratingsRecord,
			modelsByDomain: Object.fromEntries(Object.entries(modelsByDomain).map(([d, s]) => [d, [...s]])),
		});
		const promptValueById = new Map(allPrompts.map((p) => [p.id, p.value]));
		const kingmakersWithExamples = kingmakers.map((k) => ({
			...k,
			examples: k.examplePromptIds.map((id) => promptValueById.get(id)).filter((v): v is string => !!v),
		}));

		const winnability = computeWinnability({
			runStats: runStats.map((r) => ({ promptId: r.promptId, domain: r.domain, total: r.total, runsPresent: r.runsPresent })),
			runsByPrompt,
			brandCitedPromptIds: [...brandCitedPromptIds],
			prompts: allPrompts.filter((p) => enabledPromptIds.includes(p.id)).map((p) => ({ id: p.id, value: p.value })),
		});

		const sourceTypes = summarizeSourceTypes(
			urlStats.map((u) => {
				const domain = extractDomain(u.domain);
				return { domain, url: u.url, title: u.title, count: u.count, isOwn: kindOf(domain) === "own", isCompetitor: kindOf(domain) === "competitor" };
			}),
		);

		const scoreboard = computeScoreboard({
			edges: edges.map((e) => ({ model: e.model, domain: e.domain, count: e.count })),
			brandDomains,
			competitors: competitorList,
		});

		const drVolatility = computeDrVolatility({
			runStats,
			runsByPrompt,
			ratings: ratingsRecord,
			kindOf: kindByDomain,
		});

		const drBySourceType = summarizeDrBySourceType(
			urlStats.map((u) => {
				const domain = extractDomain(u.domain);
				return {
					domain,
					url: u.url,
					title: u.title,
					count: u.count,
					isOwn: kindOf(domain) === "own",
					isCompetitor: kindOf(domain) === "competitor",
					rating: ratingsRecord[domain] ?? null,
				};
			}),
		);

		const promptDistributions = computePromptDomainDistribution({
			rows: [...pageAgg.values()],
			promptValues: Object.fromEntries(allPrompts.map((p) => [p.id, p.value])),
			ratings: ratingsRecord,
			kindOf: kindByDomain,
		});

		const brandRating = brandDomains.length ? (ratingsRecord[brandDomains[0]] ?? null) : null;

		// Enriched rows for the sortable/searchable data tables (6-way category + DR + volatility).
		const categorize = (d: string): CitationCategory => categorizeDomainShared(d, brandDomainSet, competitorDomainSet);
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

		// Brand citation share split by branded vs unbranded prompts.
		const promptBranded = new Map<string, boolean>();
		for (const p of allPrompts) promptBranded.set(p.id, getEffectiveBrandedStatus(p.systemTags ?? [], p.tags ?? []).isBranded);
		const shareAcc = { branded: { brand: 0, total: 0 }, unbranded: { brand: 0, total: 0 } };
		for (const e of edges) {
			const bucket = promptBranded.get(e.promptId) ? shareAcc.branded : shareAcc.unbranded;
			bucket.total += e.count;
			if (kindByDomain[e.domain] === "own") bucket.brand += e.count;
		}
		const toShare = (b: { brand: number; total: number }) => ({ ...b, share: b.total > 0 ? b.brand / b.total : 0 });
		const brandedShare = { branded: toShare(shareAcc.branded), unbranded: toShare(shareAcc.unbranded) };

		// Candidate untracked competitors: top brand-like ("other" source-type) third-party domains.
		const domainSourceCounts = new Map<string, Map<string, number>>();
		for (const u of urlStats) {
			const domain = extractDomain(u.domain);
			const st = classifySourceType({
				domain,
				url: u.url,
				title: u.title,
				isOwn: kindOf(domain) === "own",
				isCompetitor: kindOf(domain) === "competitor",
			});
			let m = domainSourceCounts.get(domain);
			if (!m) {
				m = new Map();
				domainSourceCounts.set(domain, m);
			}
			m.set(st, (m.get(st) ?? 0) + u.count);
		}
		const dominantSource = (domain: string): string => {
			const m = domainSourceCounts.get(domain);
			if (!m) return "other";
			let best = "other";
			let bestCount = -1;
			for (const [st, c] of m) {
				if (c > bestCount) {
					best = st;
					bestCount = c;
				}
			}
			return best;
		};
		const untrackedCompetitors = pickCandidateCompetitors(
			allDomains.map((domain) => ({
				domain,
				citations: domainTotals.get(domain) ?? 0,
				kind: kindByDomain[domain],
				sourceType: dominantSource(domain),
			})),
		);

		return {
			pending: missing.length,
			totalDomains: allDomains.length,
			drQuadrants: computeDrQuadrants(landscapeDomains),
			sourceTypes,
			kingmakers: kingmakersWithExamples,
			winnability,
			scoreboard,
			drVolatility,
			drBySourceType,
			promptDistributions,
			brandRating,
			brandedShare,
			untrackedCompetitors,
			domainTable,
			urlTable,
		};
	});

export type CitationInsightsResult = Awaited<ReturnType<typeof getCitationInsightsFn>>;
