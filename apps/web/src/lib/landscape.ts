/**
 * Every figure follows the visibility and share-of-voice pages' rule: each prompt's latest result,
 * carried forward over the days it didn't run, summed across prompts. So the last day is the current
 * figure every headline shows. Shares are fractions of 1; position is an average place, 1 being named first.
 */
import { carryForward } from "@/lib/chart-utils";
import type { PromptModelDailyCompetitor, PromptModelDailyRuns } from "@/lib/rollup-read";
import {
	type AssessmentSums,
	NO_ASSESSMENTS,
	type SentimentCounts,
	sentimentCounts,
	sentimentSummary,
} from "@/lib/sentiment";

export const LANDSCAPE_METRICS = ["visibility", "share", "sentiment", "position"] as const;
export type LandscapeMetric = (typeof LANDSCAPE_METRICS)[number];

export type MetricValues = Record<LandscapeMetric, number | null>;

export interface LandscapeCompany {
	name: string;
	isBrand: boolean;
	domain: string | null;
	/** As of the last day. */
	totals: MetricValues;
	/** The current answers mentioning it, by sentiment. */
	sentiments: SentimentCounts;
	/** Current figures, keyed by model id. */
	byModel: Record<string, MetricValues>;
	/** One value per entry of `Landscape.dates`. */
	series: Record<LandscapeMetric, (number | null)[]>;
}

export interface Landscape {
	dates: string[];
	/** Most-run first. */
	models: string[];
	/** The brand first, then each tracked competitor. */
	companies: LandscapeCompany[];
}

export const lowerIsBetter = (metric: LandscapeMetric) => metric === "position";

export const brandOf = (landscape: Landscape): LandscapeCompany => landscape.companies[0];

/** Best first on `metric`; companies without a value go last. */
export function sortByMetric(companies: LandscapeCompany[], metric: LandscapeMetric): LandscapeCompany[] {
	const sign = lowerIsBetter(metric) ? 1 : -1;
	return [...companies].sort((a, b) => {
		const x = a.totals[metric];
		const y = b.totals[metric];
		if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1;
		return sign * (x - y);
	});
}

/** How many competitors a landscape chart follows alongside the brand. */
export const CHARTED_COMPETITORS = 4;

export function chartedCompanies(
	landscape: Landscape,
	metric: LandscapeMetric,
	competitors = CHARTED_COMPETITORS,
): LandscapeCompany[] {
	return [brandOf(landscape), ...sortByMetric(landscape.companies.slice(1), metric).slice(0, competitors)];
}

/** The brand's place among every company on `metric`, 1 being best; last when it has no value. */
export function brandRank(landscape: Landscape, metric: LandscapeMetric): number {
	const own = brandOf(landscape).totals[metric];
	if (own === null) return landscape.companies.length;
	const sign = lowerIsBetter(metric) ? 1 : -1;
	return (
		landscape.companies.filter((c) => c.totals[metric] !== null && sign * ((c.totals[metric] ?? 0) - own) < 0).length +
		1
	);
}

interface CompanyCounts extends AssessmentSums {
	mentions: number;
}

/** A prompt's answers on one day, or the sum of every prompt's as carried to it. */
interface Observation {
	runs: number;
	/** Mentions of the brand and every competitor, the base of each share. */
	allMentions: number;
	companies: Map<string, CompanyCounts>;
}

const emptyObservation = (): Observation => ({ runs: 0, allMentions: 0, companies: new Map() });

const ASSESSMENT_KEYS = Object.keys(NO_ASSESSMENTS) as (keyof AssessmentSums)[];

function addCounts(into: Map<string, CompanyCounts>, name: string, mentions: number, sums: AssessmentSums): void {
	const counts = into.get(name) ?? { ...NO_ASSESSMENTS, mentions: 0 };
	counts.mentions += mentions;
	for (const key of ASSESSMENT_KEYS) counts[key] += sums[key];
	into.set(name, counts);
}

function addObservation(into: Observation, from: Observation): void {
	into.runs += from.runs;
	into.allMentions += from.allMentions;
	for (const [name, counts] of from.companies) addCounts(into.companies, name, counts.mentions, counts);
}

export interface LandscapeInput {
	brand: { name: string; domain: string | null };
	competitors: { name: string; domain: string | null }[];
	dates: string[];
	runs: PromptModelDailyRuns[];
	competitorRuns: PromptModelDailyCompetitor[];
}

/** Each prompt's answers per model and day, keyed by prompt, then model, then day. */
function observations(input: LandscapeInput): Map<string, Map<string, Map<string, Observation>>> {
	const byPrompt = new Map<string, Map<string, Map<string, Observation>>>();
	const at = (promptId: string, model: string, date: string) => {
		const models = byPrompt.get(promptId) ?? new Map<string, Map<string, Observation>>();
		byPrompt.set(promptId, models);
		const days = models.get(model) ?? new Map<string, Observation>();
		models.set(model, days);
		const observation = days.get(date) ?? emptyObservation();
		days.set(date, observation);
		return observation;
	};
	for (const row of input.runs) {
		const observation = at(row.prompt_id, row.model, row.date);
		observation.runs += row.runs;
		observation.allMentions += row.brand_mentioned_runs + row.competitor_mentions;
		addCounts(observation.companies, input.brand.name, row.brand_mentioned_runs, row);
	}
	for (const row of input.competitorRuns) {
		addCounts(at(row.prompt_id, row.model, row.date).companies, row.competitor, row.runs, row);
	}
	return byPrompt;
}

/** Each day's sums across prompts, every prompt carried at its latest result as of that day. */
function carriedDays(byPrompt: Map<string, Map<string, Map<string, Observation>>>, dates: string[]) {
	const byPromptDay = new Map<string, Map<string, Observation>>();
	for (const [promptId, models] of byPrompt) {
		const days = new Map<string, Observation>();
		for (const modelDays of models.values()) {
			for (const [date, observation] of modelDays) {
				const day = days.get(date) ?? emptyObservation();
				addObservation(day, observation);
				days.set(date, day);
			}
		}
		byPromptDay.set(promptId, days);
	}
	const totals = new Map<string, Observation>();
	carryForward(byPromptDay, dates, (_promptId, date, carried) => {
		const day = totals.get(date) ?? emptyObservation();
		addObservation(day, carried);
		totals.set(date, day);
	});
	return totals;
}

/**
 * Per model, the sum of each prompt's latest result: what carrying that model's results to the
 * window's last day gives, since every row is inside the window.
 */
function latestByModel(byPrompt: Map<string, Map<string, Map<string, Observation>>>) {
	const totals = new Map<string, Observation>();
	for (const models of byPrompt.values()) {
		for (const [model, days] of models) {
			const latest = [...days.keys()].sort().at(-1);
			if (latest === undefined) continue;
			const total = totals.get(model) ?? emptyObservation();
			addObservation(total, days.get(latest) ?? emptyObservation());
			totals.set(model, total);
		}
	}
	return totals;
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

function measure(name: string, day: Observation | undefined): MetricValues {
	const counts = day?.companies.get(name) ?? { ...NO_ASSESSMENTS, mentions: 0 };
	return {
		visibility: ratio(counts.mentions, day?.runs ?? 0),
		share: ratio(counts.mentions, day?.allMentions ?? 0),
		sentiment: sentimentSummary(counts).score,
		position: ratio(counts.position_sum, counts.positioned_runs),
	};
}

export function buildLandscape(input: LandscapeInput): Landscape {
	const runsByModel = new Map<string, number>();
	for (const row of input.runs) runsByModel.set(row.model, (runsByModel.get(row.model) ?? 0) + row.runs);
	const models = [...runsByModel.entries()].sort((a, b) => b[1] - a[1]).map(([model]) => model);

	const lastDate = input.dates.at(-1) ?? "";
	const byPrompt = observations(input);
	const days = carriedDays(byPrompt, input.dates);
	const lastByModel = latestByModel(byPrompt);

	const company = (name: string, domain: string | null, isBrand: boolean): LandscapeCompany => {
		const daily = input.dates.map((date) => measure(name, days.get(date)));
		const last = days.get(lastDate)?.companies.get(name);
		return {
			name,
			isBrand,
			domain,
			totals: measure(name, days.get(lastDate)),
			sentiments: sentimentCounts(last ?? NO_ASSESSMENTS),
			byModel: Object.fromEntries(models.map((model) => [model, measure(name, lastByModel.get(model))])),
			series: Object.fromEntries(
				LANDSCAPE_METRICS.map((metric) => [metric, daily.map((values) => values[metric])]),
			) as LandscapeCompany["series"],
		};
	};

	return {
		dates: input.dates,
		models,
		companies: [
			company(input.brand.name, input.brand.domain, true),
			...input.competitors.map((c) => company(c.name, c.domain, false)),
		],
	};
}
