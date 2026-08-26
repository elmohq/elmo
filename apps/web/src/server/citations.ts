/** Server functions for citation data. */
import { createServerFn } from "@tanstack/react-start";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts, SYSTEM_TAGS } from "@workspace/lib/db/schema";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthSession, requireBrandAccess } from "@/lib/auth/helpers";
import { applyPerPromptKeyedLVCF, citationDateWindow } from "@/lib/chart-utils";
import {
	type CitationDomain,
	type CitationUrl,
	rollUpCitationDomains,
	rollUpCitationUrls,
	tallyCitations,
} from "@/lib/citation-rollup";
import {
	CITATION_CATEGORIES,
	CITATION_PAGE_TYPES,
	type CitationCategory,
	type CitationPageType,
	emptyCategoryCounts,
	emptyPageTypeCounts,
	extractDomain,
	isGoogleSurfaceUrl,
	normalizeUrl,
	resolvePageType,
	toRoundedPercentages,
} from "@/lib/domain-categories";
import {
	categorizeDomain as categorizeDomainShared,
	classifyUrl as classifyUrlShared,
} from "@/lib/domain-categories.server";
import { buildGoogleModule, emptyGoogleModule, type GoogleModule } from "@/lib/google-module";
import {
	type CitationUrlStats,
	getCitationUrlStats,
	getPerPromptCitationPages,
	getPerPromptDailyCitationPages,
	type PerPromptCitationPageRow,
	type PerPromptDailyCitationPageRow,
} from "@/lib/postgres-read";

/** Places a citation against this brand's own domains and its competitors'. */
type Classify = (domain: string, url: string, title?: string | null) => CitationCategory;

/** What the brand-wide view hangs off each URL on top of the shared rollup. */
type BrandCitationUrl = CitationUrl & { promptCount: number; isNew: boolean };

/** What the brand-wide view hangs off each domain: its period-over-period trend. */
type BrandCitationDomain = CitationDomain & { previousCount: number; changePercent: number | null };

/** The previous window, keyed for the period-over-period comparisons. */
interface PreviousPeriod {
	countByDomain: Map<string, number>;
	byUrl: Map<string, { count: number; title?: string; domain: string }>;
}

interface WhatsChanged {
	newUrls: { url: string; domain: string; count: number; promptCount: number; category: CitationCategory }[];
	droppedUrls: {
		url: string;
		domain: string;
		previousCount: number;
		currentCount: number;
		category: CitationCategory;
	}[];
	titleChanges: {
		url: string;
		domain: string;
		currentTitle: string;
		previousTitle: string;
		category: CitationCategory;
	}[];
	newDomains: { domain: string; count: number; category: CitationCategory }[];
	droppedDomains: { domain: string; previousCount: number; category: CitationCategory }[];
}

interface CitationsResult {
	totalCitations: number;
	uniqueDomains: number;
	categoryCounts: Record<CitationCategory, number>;
	domainDistribution: BrandCitationDomain[];
	specificUrls: BrandCitationUrl[];
	pageTypeDistribution: { pageType: CitationPageType; count: number }[];
	googleModule: GoogleModule;
	availableTags: string[];
	citationTimeSeries: ({ date: string } & Record<CitationCategory, number>)[];
	pageTypeTimeSeries: ({ date: string } & Record<CitationPageType, number>)[];
	competitors: { id: string; name: string; domains: string[] }[];
	competitorOnlyPrompts: { id: string; value: string; competitorCitationCount: number; uniqueCompetitors: number }[];
	whatsChanged: WhatsChanged;
}

/** A URL or domain needs this many citations before it counts as a real change. */
const MIN_COUNT_FOR_WHATS_CHANGED = 2;

/** A URL has dropped once it has lost at least this share of its citations. */
const DROP_PERCENT_THRESHOLD = 50;

const WHATS_CHANGED_LIMIT = 10;

/**
 * Prompt ids matching the tag filter. Branded/unbranded are derived rather than
 * stored, so they resolve through getEffectiveBrandedStatus; every other tag
 * matches against the prompt's own tags or its system tags.
 */
function promptIdsMatchingTags(
	allPrompts: { id: string; tags: string[] | null; systemTags: string[] | null }[],
	tagFilter: string[],
): string[] {
	const wantsBranded = tagFilter.includes(SYSTEM_TAGS.BRANDED);
	const wantsUnbranded = tagFilter.includes(SYSTEM_TAGS.UNBRANDED);
	const userTagFilter = tagFilter.filter((tag) => tag !== SYSTEM_TAGS.BRANDED && tag !== SYSTEM_TAGS.UNBRANDED);

	return allPrompts
		.filter((prompt) => {
			const systemTags = prompt.systemTags || [];
			const userTags = prompt.tags || [];
			if (wantsBranded || wantsUnbranded) {
				const { isBranded } = getEffectiveBrandedStatus(systemTags, userTags);
				if (isBranded ? wantsBranded : wantsUnbranded) return true;
			}
			const allTags = [...systemTags, ...userTags].map((tag) => tag.toLowerCase());
			return userTagFilter.some((tag) => allTags.includes(tag));
		})
		.map((prompt) => prompt.id);
}

/**
 * Google search/shopping surfaces (Google AI Mode) are pulled OUT of the source
 * mix everywhere — they get their own module and would otherwise be
 * double-counted — so the previous window drops them before it is keyed.
 */
function rollUpPreviousPeriod(prevUrlStats: CitationUrlStats[]): PreviousPeriod {
	const countByDomain = new Map<string, number>();
	const byUrl = new Map<string, { count: number; title?: string; domain: string }>();

	for (const { url, domain, title, count } of prevUrlStats) {
		if (isGoogleSurfaceUrl(url)) continue;
		countByDomain.set(domain, (countByDomain.get(domain) ?? 0) + Number(count));

		const normalizedUrl = normalizeUrl(url);
		const existing = byUrl.get(normalizedUrl);
		if (!existing) {
			byUrl.set(normalizedUrl, { count: Number(count), title: title || undefined, domain });
			continue;
		}
		existing.count += Number(count);
		existing.title ||= title || undefined;
	}

	return { countByDomain, byUrl };
}

/**
 * How many prompts cited each URL. Kept beside the shared rollup rather than
 * inside it: it is the only thing the brand-wide view needs that the per-prompt
 * view has no meaning for.
 */
function promptCountsByUrl(urlStats: CitationUrlStats[]): Map<string, number> {
	const byUrl = new Map<string, number>();
	for (const { url, prompt_count } of urlStats) {
		if (isGoogleSurfaceUrl(url)) continue;
		const normalizedUrl = normalizeUrl(url);
		byUrl.set(normalizedUrl, Math.max(byUrl.get(normalizedUrl) ?? 0, Number(prompt_count)));
	}
	return byUrl;
}

/**
 * Per-day percentage trends over the window, smoothed per prompt so a staggered
 * cadence doesn't read as a gap.
 *
 * Each row's key is looked up from the canonical URL-level classification rather
 * than reclassified: the per-(prompt, day) rows carry their own title, so
 * reclassifying could land an "other"-domain URL in a different category than
 * the totals — rendering a chart band with no tab and letting the stack sum to
 * under 100%.
 */
function buildKeyedTimeSeries<K extends string>(args: {
	rows: PerPromptDailyCitationPageRow[];
	keyForUrl: Map<string, K>;
	fallbackKey: (row: PerPromptDailyCitationPageRow) => K;
	dateRange: string[];
	cadenceHours: number | null | undefined;
	allKeys: readonly K[];
	emptyCounts: () => Record<K, number>;
}): ({ date: string } & Record<K, number>)[] {
	const keyedRows = args.rows
		.filter((row) => row.url && !isGoogleSurfaceUrl(row.url))
		.map((row) => ({
			prompt_id: row.prompt_id,
			date: String(row.date),
			key: args.keyForUrl.get(normalizeUrl(row.url as string)) ?? args.fallbackKey(row),
			count: Number(row.count),
		}));

	const smoothed = applyPerPromptKeyedLVCF(keyedRows, args.dateRange, args.cadenceHours, args.allKeys);
	return args.dateRange.map((date) => {
		const counts = smoothed.get(date);
		return { date, ...(counts ? (toRoundedPercentages(counts) as Record<K, number>) : args.emptyCounts()) };
	});
}

/** New, dropped and retitled URLs and domains across the two windows. */
function buildWhatsChanged(args: {
	specificUrls: BrandCitationUrl[];
	domainDistribution: BrandCitationDomain[];
	previous: PreviousPeriod;
	classify: Classify;
	categorizeDomain: (domain: string) => CitationCategory;
}): WhatsChanged {
	const { specificUrls, domainDistribution, previous, classify, categorizeDomain } = args;
	const currentUrls = new Map(specificUrls.map((url) => [url.url, url]));
	const currentDomains = new Set(domainDistribution.map((domain) => domain.domain));

	const newUrls = specificUrls
		.filter((url) => url.isNew && url.count >= MIN_COUNT_FOR_WHATS_CHANGED)
		.slice(0, WHATS_CHANGED_LIMIT)
		.map(({ url, domain, count, promptCount, category }) => ({ url, domain, count, promptCount, category }));

	const droppedUrls = [...previous.byUrl.entries()]
		.map(([url, prev]) => ({ url, prev, currentCount: currentUrls.get(url)?.count || 0 }))
		.filter(
			({ prev, currentCount }) =>
				prev.count >= MIN_COUNT_FOR_WHATS_CHANGED &&
				((prev.count - currentCount) / prev.count) * 100 >= DROP_PERCENT_THRESHOLD,
		)
		.sort((a, b) => b.prev.count - a.prev.count)
		.slice(0, WHATS_CHANGED_LIMIT)
		.map(({ url, prev, currentCount }) => ({
			url,
			domain: prev.domain,
			previousCount: prev.count,
			currentCount,
			category: classify(prev.domain, url, prev.title),
		}));

	const titleChanges = [...currentUrls.entries()]
		.map(([url, current]) => ({ url, current, previousTitle: previous.byUrl.get(url)?.title }))
		.filter((entry) => entry.current.title && entry.previousTitle && entry.current.title !== entry.previousTitle)
		.map(({ url, current, previousTitle }) => ({
			url,
			domain: current.domain,
			currentTitle: current.title as string,
			previousTitle: previousTitle as string,
			category: classify(current.domain, url, current.title),
		}))
		.slice(0, WHATS_CHANGED_LIMIT);

	const newDomains = domainDistribution
		.filter((domain) => domain.previousCount === 0 && domain.count >= MIN_COUNT_FOR_WHATS_CHANGED)
		.sort((a, b) => b.count - a.count)
		.slice(0, WHATS_CHANGED_LIMIT)
		.map(({ domain, count, category }) => ({ domain, count, category }));

	const droppedDomains = [...previous.countByDomain.entries()]
		.filter(([domain, count]) => count >= MIN_COUNT_FOR_WHATS_CHANGED && !currentDomains.has(domain))
		.map(([domain, previousCount]) => ({ domain, previousCount, category: categorizeDomain(domain) }))
		.sort((a, b) => b.previousCount - a.previousCount)
		.slice(0, WHATS_CHANGED_LIMIT);

	return { newUrls, droppedUrls, titleChanges, newDomains, droppedDomains };
}

/**
 * Prompts whose answers cite competitors but never the brand — the clearest
 * "you are missing from this conversation" signal the citation data carries.
 */
function buildCompetitorOnlyPrompts(args: {
	pages: PerPromptCitationPageRow[];
	competitorsList: { id: string; domains: string[] }[];
	promptValue: (promptId: string) => string | undefined;
	categorizeDomain: (domain: string) => CitationCategory;
}): CitationsResult["competitorOnlyPrompts"] {
	const competitorByDomain = args.competitorsList
		.flatMap((competitor) => competitor.domains.map((domain) => ({ domain: extractDomain(domain), id: competitor.id })))
		.filter((entry) => entry.domain);

	const competitorFor = (citationDomain: string): string | undefined => {
		const normalized = extractDomain(citationDomain);
		return competitorByDomain.find((entry) => normalized === entry.domain || normalized.endsWith(`.${entry.domain}`))
			?.id;
	};

	const byPrompt = new Map<string, { hasBrand: boolean; hasCompetitor: boolean; count: number; ids: Set<string> }>();
	for (const row of args.pages) {
		const category = args.categorizeDomain(row.domain);
		let entry = byPrompt.get(row.prompt_id);
		if (!entry) {
			entry = { hasBrand: false, hasCompetitor: false, count: 0, ids: new Set() };
			byPrompt.set(row.prompt_id, entry);
		}
		if (category === "brand") entry.hasBrand = true;
		if (category !== "competitor") continue;
		entry.hasCompetitor = true;
		entry.count += Number(row.count);
		const competitorId = competitorFor(row.domain);
		if (competitorId) entry.ids.add(competitorId);
	}

	return [...byPrompt.entries()]
		.filter(([, entry]) => entry.hasCompetitor && !entry.hasBrand)
		.map(([promptId, entry]) => ({
			id: promptId,
			value: args.promptValue(promptId),
			competitorCitationCount: entry.count,
			uniqueCompetitors: entry.ids.size,
		}))
		.filter((prompt): prompt is CitationsResult["competitorOnlyPrompts"][number] => prompt.value !== undefined)
		.sort((a, b) => b.competitorCitationCount - a.competitorCitationCount);
}

/**
 * The response shape when no prompt matches the tag filter. Built here rather
 * than inline so it cannot drift from the populated response beside it.
 */
function emptyCitationsResult(
	availableTags: string[],
	competitorSummary: CitationsResult["competitors"],
): CitationsResult {
	return {
		totalCitations: 0,
		uniqueDomains: 0,
		categoryCounts: emptyCategoryCounts(),
		domainDistribution: [],
		specificUrls: [],
		pageTypeDistribution: [],
		googleModule: emptyGoogleModule(),
		availableTags,
		citationTimeSeries: [],
		pageTypeTimeSeries: [],
		competitors: competitorSummary,
		competitorOnlyPrompts: [],
		whatsChanged: { newUrls: [], droppedUrls: [], titleChanges: [], newDomains: [], droppedDomains: [] },
	};
}

export const getCitationsFn = createServerFn({ method: "GET" })
	.validator(
		z.object({
			brandId: z.string(),
			days: z.number().optional().default(7),
			tags: z.string().optional(),
			model: z.string().optional(),
		}),
	)
	.handler(async ({ data }): Promise<CitationsResult> => {
		const session = await requireAuthSession();
		await requireBrandAccess(session.user.id, data.brandId);

		// Window: `data.days` calendar days ending today (inclusive), plus the
		// contiguous equal-length previous window — all UTC (server-TZ independent).
		// `dateRange` is reused for the trend charts so totals + charts span identically.
		const { fromDateStr, toDateStr, prevFromDateStr, prevToDateStr, dateRange } = citationDateWindow(
			new Date(),
			data.days,
		);
		const timezone = "UTC";

		const [brandResult, competitorsList, allPrompts] = await Promise.all([
			db.select().from(brands).where(eq(brands.id, data.brandId)).limit(1),
			db.select().from(competitors).where(eq(competitors.brandId, data.brandId)),
			db
				.select({ id: prompts.id, value: prompts.value, tags: prompts.tags, systemTags: prompts.systemTags })
				.from(prompts)
				.where(and(eq(prompts.brandId, data.brandId), eq(prompts.enabled, true))),
		]);
		const brand = brandResult[0];

		const brandDomains = new Set(
			[extractDomain(brand?.website || ""), ...(brand?.additionalDomains || []).map(extractDomain)].filter(Boolean),
		);
		const competitorDomains = new Set(competitorsList.flatMap((c) => c.domains.map(extractDomain)).filter(Boolean));
		const competitorSummary = competitorsList.map((c) => ({ id: c.id, name: c.name, domains: c.domains }));

		const userTags = new Set(allPrompts.flatMap((prompt) => prompt.tags || []));
		const availableTags = [
			SYSTEM_TAGS.BRANDED,
			SYSTEM_TAGS.UNBRANDED,
			...[...userTags]
				.filter((tag) => tag.toLowerCase() !== SYSTEM_TAGS.BRANDED && tag.toLowerCase() !== SYSTEM_TAGS.UNBRANDED)
				.sort(),
		];

		const tagFilter = data.tags?.split(",").filter(Boolean) || [];
		const enabledPromptIds =
			tagFilter.length > 0 ? promptIdsMatchingTags(allPrompts, tagFilter) : allPrompts.map((p) => p.id);
		if (enabledPromptIds.length === 0) return emptyCitationsResult(availableTags, competitorSummary);

		const [urlStats, perPromptDailyPages, perPromptPages, prevUrlStats] = await Promise.all([
			getCitationUrlStats(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
			getPerPromptDailyCitationPages(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
			getPerPromptCitationPages(data.brandId, fromDateStr, toDateStr, timezone, enabledPromptIds, data.model),
			getCitationUrlStats(data.brandId, prevFromDateStr, prevToDateStr, timezone, enabledPromptIds, data.model),
		]);

		const categorizeDomain = (domain: string): CitationCategory =>
			categorizeDomainShared(domain, brandDomains, competitorDomains);
		const classify: Classify = (domain, url, title) =>
			classifyUrlShared(domain, url, title, brandDomains, competitorDomains);

		const previous = rollUpPreviousPeriod(prevUrlStats);
		const promptCounts = promptCountsByUrl(urlStats);

		const specificUrls: BrandCitationUrl[] = rollUpCitationUrls(urlStats, classify).map((url) => ({
			...url,
			promptCount: promptCounts.get(url.url) ?? 0,
			isNew: !previous.byUrl.has(url.url),
		}));

		const domainDistribution: BrandCitationDomain[] = rollUpCitationDomains(specificUrls).map((domain) => {
			const previousCount = previous.countByDomain.get(domain.domain) || 0;
			return {
				...domain,
				previousCount,
				changePercent: previousCount > 0 ? Math.round(((domain.count - previousCount) / previousCount) * 100) : null,
			};
		});

		const { categoryCounts, totalCitations, pageTypeDistribution } = tallyCitations(specificUrls);

		// Google AI Mode module: Shopping products (brand vs competitor) + search
		// queries, each tied to the prompts that triggered them.
		const promptsById = new Map(allPrompts.map((prompt) => [prompt.id, prompt]));
		const promptValue = (id: string) => promptsById.get(id)?.value;
		const googleModule = buildGoogleModule(
			perPromptPages,
			brand?.name ?? "",
			competitorsList.map((c) => ({ id: c.id, name: c.name })),
			promptValue,
		);

		const timeSeriesArgs = {
			rows: perPromptDailyPages,
			dateRange,
			cadenceHours: brand?.delayOverrideHours,
		};
		const citationTimeSeries = buildKeyedTimeSeries({
			...timeSeriesArgs,
			keyForUrl: new Map(specificUrls.map((url) => [url.url, url.category])),
			fallbackKey: (row) => classify(row.domain, row.url as string, row.title),
			allKeys: CITATION_CATEGORIES,
			emptyCounts: emptyCategoryCounts,
		});
		const pageTypeTimeSeries = buildKeyedTimeSeries({
			...timeSeriesArgs,
			keyForUrl: new Map(specificUrls.map((url) => [url.url, url.pageType])),
			fallbackKey: (row) =>
				resolvePageType(row.url as string, row.title, classify(row.domain, row.url as string, row.title)),
			allKeys: CITATION_PAGE_TYPES,
			emptyCounts: emptyPageTypeCounts,
		});

		return {
			totalCitations,
			uniqueDomains: domainDistribution.length,
			categoryCounts,
			domainDistribution,
			specificUrls,
			pageTypeDistribution,
			googleModule,
			availableTags,
			citationTimeSeries,
			pageTypeTimeSeries,
			competitors: competitorSummary,
			competitorOnlyPrompts: buildCompetitorOnlyPrompts({
				pages: perPromptPages,
				competitorsList,
				promptValue,
				categorizeDomain,
			}),
			whatsChanged: buildWhatsChanged({
				specificUrls,
				domainDistribution,
				previous,
				classify,
				categorizeDomain,
			}),
		};
	});
