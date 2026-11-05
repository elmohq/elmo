/** Server functions for citation data. */
import { createServerFn } from "@tanstack/react-start";
import {
	CITATION_CATEGORIES,
	CITATION_PAGE_TYPES,
	type CitationCategory,
	type CitationPageType,
	cleanAndValidateDomain,
	emptyCategoryCounts,
	emptyPageTypeCounts,
	extractDomain,
	toRoundedPercentages,
} from "@workspace/lib/citations/domain-categories";
import { categorizeDomain as categorizeDomainShared } from "@workspace/lib/citations/domain-lists";
import {
	type ResolvedPageClass,
	resolveOwnedPageClass,
	resolvePageClass,
} from "@workspace/lib/citations/page-classification";
import type { CitationUrl } from "@workspace/lib/citations/rollup";
import { db } from "@workspace/lib/db/db";
import { brands, competitors, prompts, SYSTEM_TAGS } from "@workspace/lib/db/schema";
import { getEffectiveBrandedStatus } from "@workspace/lib/tag-utils";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireBrandSession } from "@/lib/auth/helpers";
import { applyPerPromptKeyedLVCF, citationDateWindow } from "@/lib/chart-utils";
import type { CitationFlowRow } from "@/lib/citation-flow";
import {
	type CitationClassTotalRow,
	type CitationDomainStatsRow,
	type CitationSummary,
	type CitationUrlListRow,
	getCitationDomainPage,
	getCitationFlowRows,
	getCitationSummary,
	getCitationUrlPage,
	type OwnedDomains,
} from "@/lib/citation-read";
import {
	buildGoogleModule,
	emptyGoogleModule,
	type GoogleModule,
	googleModuleTotals,
	pageGoogleList,
} from "@/lib/google-module";
import { customRangeEnd, lookbackSchema } from "@/lib/lookback";
import {
	getPerPromptCitationDomains,
	getPerPromptDailyCitationClasses,
	getPerPromptGooglePages,
	type PerPromptCitationDomainRow,
	type PerPromptDailyCitationClassRow,
} from "@/lib/rollup-read";
import { isRedditDomain, type Subreddit, summarizeSubreddits } from "@/lib/subreddits";
import { resolveBrandLookbackDays } from "@/server/brand-window";
import { parseTagFilter } from "@/server/prompt-resolution";

type WhatsChangedUrl = { url: string; domain: string; count: number; promptCount: number; category: CitationCategory };

interface WhatsChanged {
	newUrls: WhatsChangedUrl[];
	droppedUrls: {
		url: string;
		domain: string;
		previousCount: number;
		currentCount: number;
		category: CitationCategory;
	}[];
	newDomains: { domain: string; count: number; category: CitationCategory }[];
	droppedDomains: { domain: string; previousCount: number; category: CitationCategory }[];
}

interface CitationsResult {
	totalCitations: number;
	uniqueDomains: number;
	categoryCounts: Record<CitationCategory, number>;
	pageTypeDistribution: { pageType: CitationPageType; count: number }[];
	googleModule: GoogleModule;
	subreddits: Subreddit[];
	availableTags: string[];
	citationTimeSeries: ({ date: string } & Record<CitationCategory, number>)[];
	pageTypeTimeSeries: ({ date: string } & Record<CitationPageType, number>)[];
	competitors: { id: string; name: string; domains: string[] }[];
	competitorOnlyPrompts: { id: string; value: string; competitorCitationCount: number; uniqueCompetitors: number }[];
	whatsChanged: WhatsChanged;
	/** How many days the window spans, which "all" only settles on the server. */
	days: number;
}

/** A URL or domain needs this many citations before it counts as a real change. */
const MIN_COUNT_FOR_WHATS_CHANGED = 2;

const WHATS_CHANGED_LIMIT = 10;

const MAX_LIST_PAGE_SIZE = 50;

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
 * Per-day percentage trends over the window, smoothed per prompt so a
 * staggered cadence doesn't read as a gap.
 */
function buildClassTimeSeries<K extends string>(args: {
	rows: PerPromptDailyCitationClassRow[];
	keyFor: (resolved: ResolvedPageClass) => K;
	dateRange: string[];
	cadenceHours: number | null | undefined;
	allKeys: readonly K[];
	emptyCounts: () => Record<K, number>;
}): ({ date: string } & Record<K, number>)[] {
	const keyedRows = args.rows.flatMap((row) => {
		const resolved = resolveOwnedPageClass(row);
		if (!resolved) return [];
		return [{ prompt_id: row.prompt_id, date: String(row.date), key: args.keyFor(resolved), count: Number(row.count) }];
	});

	const smoothed = applyPerPromptKeyedLVCF(keyedRows, args.dateRange, args.cadenceHours, args.allKeys);
	return args.dateRange.map((date) => {
		const counts = smoothed.get(date);
		return { date, ...(counts ? (toRoundedPercentages(counts) as Record<K, number>) : args.emptyCounts()) };
	});
}

function buildWhatsChanged(
	summary: CitationSummary,
	brandDomains: Set<string>,
	competitorDomains: Set<string>,
	categorizeDomain: (domain: string) => CitationCategory,
): WhatsChanged {
	return {
		newUrls: summary.newUrls.map((url) => ({
			url: url.url,
			domain: url.domain,
			count: url.count,
			promptCount: url.prompt_count,
			category: url.category as CitationCategory,
		})),
		droppedUrls: summary.droppedUrls.flatMap((page) => {
			const resolved = resolvePageClass(page, brandDomains, competitorDomains);
			if (!resolved) return [];
			return [
				{
					url: page.url,
					domain: page.domain,
					previousCount: page.previous_count,
					currentCount: page.current_count,
					category: resolved.category,
				},
			];
		}),
		newDomains: summary.newDomains.map((domain) => ({
			domain: domain.domain,
			count: domain.count,
			category: (domain.category ?? categorizeDomain(domain.domain)) as CitationCategory,
		})),
		droppedDomains: summary.droppedDomains.map((domain) => ({
			domain: domain.domain,
			previousCount: domain.previous_count,
			category: categorizeDomain(domain.domain),
		})),
	};
}

function tallyClasses(rows: CitationClassTotalRow[]) {
	const categoryCounts = emptyCategoryCounts();
	const pageTypeCounts = emptyPageTypeCounts();
	let totalCitations = 0;
	for (const row of rows) {
		categoryCounts[row.category as CitationCategory] += row.count;
		pageTypeCounts[row.page_type as CitationPageType] += row.count;
		totalCitations += row.count;
	}
	return {
		categoryCounts,
		totalCitations,
		pageTypeDistribution: CITATION_PAGE_TYPES.map((pageType) => ({ pageType, count: pageTypeCounts[pageType] })).filter(
			(entry) => entry.count > 0,
		),
	};
}

/**
 * Prompts whose answers cite competitors but never the brand — the clearest
 * "you are missing from this conversation" signal the citation data carries.
 */
function buildCompetitorOnlyPrompts(args: {
	pages: PerPromptCitationDomainRow[];
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

const citationFiltersSchema = z.object({
	brandId: z.string(),
	lookback: lookbackSchema.default("1w"),
	tags: z.string().optional(),
	model: z.string().optional(),
});

type CitationFilters = z.infer<typeof citationFiltersSchema>;

/** All UTC, so the server's zone doesn't matter. */
async function resolveCitationScope(data: CitationFilters) {
	const days = await resolveBrandLookbackDays(data.brandId, data.lookback);
	const endDate = customRangeEnd(data.lookback);
	const window = citationDateWindow(endDate ? new Date(`${endDate}T00:00:00Z`) : new Date(), days);

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
	const owned: OwnedDomains = { brandDomains: [...brandDomains], competitorDomains: [...competitorDomains] };

	const tagFilter = parseTagFilter(data.tags);
	const promptIds = tagFilter.length > 0 ? promptIdsMatchingTags(allPrompts, tagFilter) : allPrompts.map((p) => p.id);
	const scope = {
		brandId: data.brandId,
		from: window.fromDateStr,
		to: window.toDateStr,
		timezone: "UTC",
		promptIds,
		model: data.model,
	};
	return {
		days,
		dateRange: window.dateRange,
		brand,
		competitorsList,
		allPrompts,
		brandDomains,
		competitorDomains,
		owned,
		scope,
		previousScope: { ...scope, from: window.prevFromDateStr, to: window.prevToDateStr },
	};
}

/**
 * The response shape when no prompt matches the tag filter. Built here rather
 * than inline so it cannot drift from the populated response beside it.
 */
function emptyCitationsResult(
	availableTags: string[],
	competitorSummary: CitationsResult["competitors"],
	days: number,
): CitationsResult {
	return {
		days,
		totalCitations: 0,
		uniqueDomains: 0,
		categoryCounts: emptyCategoryCounts(),
		pageTypeDistribution: [],
		googleModule: emptyGoogleModule(),
		subreddits: [],
		availableTags,
		citationTimeSeries: [],
		pageTypeTimeSeries: [],
		competitors: competitorSummary,
		competitorOnlyPrompts: [],
		whatsChanged: { newUrls: [], droppedUrls: [], newDomains: [], droppedDomains: [] },
	};
}

export const getCitationsFn = createServerFn({ method: "GET" })
	.validator(citationFiltersSchema)
	.handler(async ({ data }): Promise<CitationsResult> => {
		await requireBrandSession(data.brandId);
		const resolved = await resolveCitationScope(data);
		const { brand, competitorsList, allPrompts, brandDomains, competitorDomains, owned, scope, previousScope } =
			resolved;

		const userTags = new Set(allPrompts.flatMap((prompt) => prompt.tags || []));
		const availableTags = [
			SYSTEM_TAGS.BRANDED,
			SYSTEM_TAGS.UNBRANDED,
			...[...userTags]
				.filter((tag) => tag.toLowerCase() !== SYSTEM_TAGS.BRANDED && tag.toLowerCase() !== SYSTEM_TAGS.UNBRANDED)
				.sort(),
		];
		const competitorSummary = competitorsList.map((c) => ({ id: c.id, name: c.name, domains: c.domains }));
		if (scope.promptIds.length === 0) return emptyCitationsResult(availableTags, competitorSummary, resolved.days);

		const [summary, perPromptDailyClasses, googlePages, promptDomains] = await Promise.all([
			getCitationSummary(scope, previousScope, owned, {
				minCount: MIN_COUNT_FOR_WHATS_CHANGED,
				limit: WHATS_CHANGED_LIMIT,
			}),
			getPerPromptDailyCitationClasses(scope, owned),
			getPerPromptGooglePages(scope),
			getPerPromptCitationDomains(scope),
		]);

		const categorizeDomain = (domain: string): CitationCategory =>
			categorizeDomainShared(domain, brandDomains, competitorDomains);
		const { categoryCounts, totalCitations, pageTypeDistribution } = tallyClasses(summary.classes);
		const whatsChanged = buildWhatsChanged(summary, brandDomains, competitorDomains, categorizeDomain);

		// Google AI Mode module: Shopping products (brand vs competitor) + search
		// queries, each tied to the prompts that triggered them.
		const promptsById = new Map(allPrompts.map((prompt) => [prompt.id, prompt]));
		const promptValue = (id: string) => promptsById.get(id)?.value;
		const googleModule = googleModuleTotals(
			buildGoogleModule(
				googlePages,
				brand?.name ?? "",
				competitorsList.map((c) => ({ id: c.id, name: c.name })),
				promptValue,
			),
		);

		const timeSeriesArgs = {
			rows: perPromptDailyClasses,
			dateRange: resolved.dateRange,
			cadenceHours: brand?.delayOverrideHours,
		};
		const citationTimeSeries = buildClassTimeSeries({
			...timeSeriesArgs,
			keyFor: (resolvedClass) => resolvedClass.category,
			allKeys: CITATION_CATEGORIES,
			emptyCounts: emptyCategoryCounts,
		});
		const pageTypeTimeSeries = buildClassTimeSeries({
			...timeSeriesArgs,
			keyFor: (resolvedClass) => resolvedClass.pageType,
			allKeys: CITATION_PAGE_TYPES,
			emptyCounts: emptyPageTypeCounts,
		});

		return {
			days: resolved.days,
			totalCitations,
			uniqueDomains: summary.uniqueDomains,
			categoryCounts,
			pageTypeDistribution,
			googleModule,
			subreddits: summarizeSubreddits(
				summary.redditPages.map((page) => ({
					url: page.url,
					title: page.title ?? undefined,
					count: page.count,
					isNew: page.is_new,
				})),
				whatsChanged.droppedUrls.filter((url) => isRedditDomain(url.domain)).map((url) => url.url),
			),
			availableTags,
			citationTimeSeries,
			pageTypeTimeSeries,
			competitors: competitorSummary,
			competitorOnlyPrompts: buildCompetitorOnlyPrompts({
				pages: promptDomains,
				competitorsList,
				promptValue,
				categorizeDomain,
			}),
			whatsChanged,
		};
	});

const listPageSchema = {
	search: z.string().max(200).optional(),
	category: z.string().optional(),
	page: z.number().int().min(0).default(0),
	pageSize: z.number().int().min(1).max(MAX_LIST_PAGE_SIZE).default(20),
};

export type CitationUrlListItem = CitationUrl & { promptCount: number; isNew: boolean };

export const getCitationUrlsFn = createServerFn({ method: "GET" })
	.validator(citationFiltersSchema.extend({ ...listPageSchema, pageType: z.string().optional() }))
	.handler(async ({ data }): Promise<{ items: CitationUrlListItem[]; total: number }> => {
		await requireBrandSession(data.brandId);
		const { scope, previousScope, owned } = await resolveCitationScope(data);
		if (scope.promptIds.length === 0) return { items: [], total: 0 };

		const { rows, total } = await getCitationUrlPage(
			scope,
			previousScope,
			owned,
			{ search: data.search, category: data.category, pageType: data.pageType },
			data.pageSize,
			data.page * data.pageSize,
		);
		return { items: rows.map(toUrlListItem), total };
	});

function toUrlListItem(row: CitationUrlListRow): CitationUrlListItem {
	return {
		url: row.url,
		title: row.title ?? undefined,
		domain: row.domain,
		count: row.count,
		category: row.category as CitationCategory,
		pageType: row.page_type as CitationPageType,
		avgPosition: row.avg_position,
		promptCount: row.prompt_count,
		isNew: row.is_new,
	};
}

export interface CitationDomainListItem {
	domain: string;
	count: number;
	category: CitationCategory;
	exampleTitle?: string;
	previousCount: number;
	changePercent: number | null;
}

export const getCitationDomainsFn = createServerFn({ method: "GET" })
	.validator(citationFiltersSchema.extend(listPageSchema))
	.handler(async ({ data }): Promise<{ items: CitationDomainListItem[]; total: number }> => {
		await requireBrandSession(data.brandId);
		const { scope, previousScope, owned } = await resolveCitationScope(data);
		if (scope.promptIds.length === 0) return { items: [], total: 0 };

		const { rows, total } = await getCitationDomainPage(
			scope,
			previousScope,
			owned,
			{ search: data.search, category: data.category },
			data.pageSize,
			data.page * data.pageSize,
		);
		return { items: rows.map(toDomainListItem), total };
	});

function toDomainListItem(row: CitationDomainStatsRow): CitationDomainListItem {
	return {
		domain: row.domain,
		count: row.count,
		category: (row.category ?? "other") as CitationCategory,
		exampleTitle: row.example_title ?? undefined,
		previousCount: row.previous_count,
		changePercent:
			row.previous_count > 0 ? Math.round(((row.count - row.previous_count) / row.previous_count) * 100) : null,
	};
}

export const getGoogleShoppingFn = createServerFn({ method: "GET" })
	.validator(
		citationFiltersSchema.extend({
			list: z.enum(["products", "queries"]),
			attribution: z.enum(["all", "brand", "competitor", "other"]).default("all"),
			page: listPageSchema.page,
			pageSize: listPageSchema.pageSize,
		}),
	)
	.handler(async ({ data }) => {
		await requireBrandSession(data.brandId);
		const { scope, brand, competitorsList, allPrompts } = await resolveCitationScope(data);
		const promptsById = new Map(allPrompts.map((prompt) => [prompt.id, prompt.value]));
		const googleModule = buildGoogleModule(
			scope.promptIds.length > 0 ? await getPerPromptGooglePages(scope) : [],
			brand?.name ?? "",
			competitorsList.map((c) => ({ id: c.id, name: c.name })),
			(id) => promptsById.get(id),
		);
		const list =
			data.list === "products" ? { kind: "products" as const, filter: data.attribution } : { kind: "queries" as const };
		return pageGoogleList(googleModule, list, data.page * data.pageSize, data.pageSize);
	});

export const getCitationFlowFn = createServerFn({ method: "GET" })
	.validator(citationFiltersSchema.extend({ domain: z.string().min(1).max(253) }))
	.handler(async ({ data }): Promise<CitationFlowRow[]> => {
		await requireBrandSession(data.brandId);
		const domain = cleanAndValidateDomain(data.domain);
		const { scope } = await resolveCitationScope(data);
		if (scope.promptIds.length === 0 || !domain) return [];
		return getCitationFlowRows(scope, domain);
	});
