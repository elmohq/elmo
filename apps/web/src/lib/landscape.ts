/**
 * The brand and each tracked competitor on the same four measures, as of each day, overall and per
 * model. Every figure follows the rule the visibility and share-of-voice pages use: each prompt's
 * latest result, carried forward over the days it didn't run, summed across prompts. So the last
 * day is the current figure, and it's the one every headline shows. Shares are fractions of 1;
 * position is an average place, 1 being named first.
 */
import { carryForward } from "@/lib/chart-utils";
import type { PromptModelDailyCompetitor, PromptModelDailyRuns } from "@/lib/rollup-read";
import {
	NO_VERDICTS,
	type SentimentCounts,
	sentimentCounts,
	sentimentSummary,
	type VerdictSums,
} from "@/lib/sentiment";

export const LANDSCAPE_METRICS = ["visibility", "share", "sentiment", "position"] as const;
export type LandscapeMetric = (typeof LANDSCAPE_METRICS)[number];

export type MetricValues = Record<LandscapeMetric, number | null>;

export interface LandscapeCompany {
	name: string;
	isBrand: boolean;
	domain: string | null;
	/** As of the last day: the current figures. */
	totals: MetricValues;
	/** The current answers mentioning it, by tone. */
	tones: SentimentCounts;
	/** Current figures per model, keyed by model id. */
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

/** Position is the one measure where a lower value is better. */
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

/** The brand and its strongest few competitors on `metric`, for a chart that can't show them all. */
export function chartedCompanies(landscape: Landscape, metric: LandscapeMetric, competitors = 4): LandscapeCompany[] {
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

/** One company's part of a prompt's answers. */
interface CompanyCounts extends VerdictSums {
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

function addCounts(into: Map<string, CompanyCounts>, name: string, mentions: number, verdicts: VerdictSums): void {
	const counts = into.get(name) ?? { ...NO_VERDICTS, mentions: 0 };
	counts.mentions += mentions;
	for (const key of Object.keys(NO_VERDICTS) as (keyof VerdictSums)[]) counts[key] += verdicts[key];
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

/** Each day's carried sums across prompts, over the rows of the models `keep` admits. */
function carriedDays(input: LandscapeInput, keep: (model: string) => boolean): Map<string, Observation> {
	const byPrompt = new Map<string, Map<string, Observation>>();
	const at = (promptId: string, date: string) => {
		const days = byPrompt.get(promptId) ?? new Map<string, Observation>();
		byPrompt.set(promptId, days);
		const observation = days.get(date) ?? emptyObservation();
		days.set(date, observation);
		return observation;
	};
	for (const row of input.runs) {
		if (!keep(row.model)) continue;
		const observation = at(row.prompt_id, row.date);
		observation.runs += row.runs;
		observation.allMentions += row.brand_mentioned_runs + row.competitor_mentions;
		addCounts(observation.companies, input.brand.name, row.brand_mentioned_runs, row);
	}
	for (const row of input.competitorRuns) {
		if (keep(row.model)) addCounts(at(row.prompt_id, row.date).companies, row.competitor, row.runs, row);
	}
	const days = new Map<string, Observation>();
	carryForward(byPrompt, input.dates, (_promptId, date, carried) => {
		const day = days.get(date) ?? emptyObservation();
		addObservation(day, carried);
		days.set(date, day);
	});
	return days;
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

function measure(name: string, day: Observation | undefined): MetricValues {
	const counts = day?.companies.get(name) ?? { ...NO_VERDICTS, mentions: 0 };
	return {
		visibility: ratio(counts.mentions, day?.runs ?? 0),
		share: ratio(counts.mentions, day?.allMentions ?? 0),
		sentiment: sentimentSummary(counts).positiveShare,
		position: ratio(counts.position_sum, counts.positioned_runs),
	};
}

export function buildLandscape(input: LandscapeInput): Landscape {
	const runsByModel = new Map<string, number>();
	for (const row of input.runs) runsByModel.set(row.model, (runsByModel.get(row.model) ?? 0) + row.runs);
	const models = [...runsByModel.entries()].sort((a, b) => b[1] - a[1]).map(([model]) => model);

	const lastDate = input.dates.at(-1) ?? "";
	const days = carriedDays(input, () => true);
	const lastByModel = new Map(models.map((model) => [model, carriedDays(input, (m) => m === model).get(lastDate)]));

	const company = (name: string, domain: string | null, isBrand: boolean): LandscapeCompany => {
		const daily = input.dates.map((date) => measure(name, days.get(date)));
		const last = days.get(lastDate)?.companies.get(name);
		return {
			name,
			isBrand,
			domain,
			totals: measure(name, days.get(lastDate)),
			tones: sentimentCounts(last ?? NO_VERDICTS),
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
