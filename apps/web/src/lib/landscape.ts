/**
 * The brand and each tracked competitor on the same four measures, overall, per model and per day,
 * built from rollup sums. Shares are fractions of 1; position is an average place, 1 being named first.
 */
import type { CompetitorModelSums, DailyCompetitorSums, DailyRunSums, ModelRunSums } from "@/lib/rollup-read";
import { NO_VERDICTS, SENTIMENT_WINDOW_DAYS, sentimentSummary, type VerdictSums } from "@/lib/sentiment";
import { shiftDateStr } from "@/lib/timezone-utils";

export const LANDSCAPE_METRICS = ["visibility", "share", "sentiment", "position"] as const;
export type LandscapeMetric = (typeof LANDSCAPE_METRICS)[number];

export type MetricValues = Record<LandscapeMetric, number | null>;

export interface LandscapeCompany {
	name: string;
	isBrand: boolean;
	domain: string | null;
	totals: MetricValues;
	/** Keyed by model id. */
	byModel: Record<string, MetricValues>;
	/** One value per entry of `Landscape.dates`, over a trailing week so a quiet day doesn't swing the line. */
	series: Record<LandscapeMetric, (number | null)[]>;
}

export interface Landscape {
	dates: string[];
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

/** What one company contributes over some span, alongside the span's totals it is measured against. */
interface Sums extends VerdictSums {
	mentions: number;
	runs: number;
	allMentions: number;
}

const ZERO: Sums = { ...NO_VERDICTS, mentions: 0, runs: 0, allMentions: 0 };
const SUM_KEYS = Object.keys(ZERO) as (keyof Sums)[];

function add(a: Sums, b: Sums): Sums {
	const total = { ...a };
	for (const key of SUM_KEYS) total[key] += b[key];
	return total;
}

/** The runs and mentions a company's count is measured against. */
const NO_CONTEXT = { runs: 0, allMentions: 0 };

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

function measure(s: Sums): MetricValues {
	return {
		visibility: ratio(s.mentions, s.runs),
		share: ratio(s.mentions, s.allMentions),
		sentiment: sentimentSummary(s).positiveShare,
		position: ratio(s.position_sum, s.positioned_runs),
	};
}

export interface LandscapeInput {
	brand: { name: string; domain: string | null };
	competitors: { name: string; domain: string | null }[];
	/** Days to plot; `brandDaily` and `competitorDaily` may start up to a week earlier to fill the first windows. */
	dates: string[];
	brandDaily: DailyRunSums[];
	competitorDaily: DailyCompetitorSums[];
	brandByModel: ModelRunSums[];
	competitorsByModel: CompetitorModelSums[];
	windowDays?: number;
}

export function buildLandscape(input: LandscapeInput): Landscape {
	const windowDays = input.windowDays ?? SENTIMENT_WINDOW_DAYS;
	const inRange = new Set(input.dates);
	const runsByDate = new Map(input.brandDaily.map((d) => [d.date, d]));
	const context = (date: string) => {
		const d = runsByDate.get(date);
		return { runs: d?.runs ?? 0, allMentions: (d?.brand_mentioned_runs ?? 0) + (d?.competitor_mentions ?? 0) };
	};

	// Each company's sums per day, with the day's runs and mentions to measure them against.
	const daily = new Map<string, Map<string, Sums>>();
	const put = (name: string, date: string, sums: Sums) => {
		const days = daily.get(name) ?? new Map<string, Sums>();
		days.set(date, sums);
		daily.set(name, days);
	};
	for (const d of input.brandDaily)
		put(input.brand.name, d.date, { ...d, ...context(d.date), mentions: d.brand_mentioned_runs });
	for (const d of input.competitorDaily) put(d.competitor, d.date, { ...d, ...context(d.date), mentions: d.runs });

	const modelContext = new Map(
		input.brandByModel.map((m) => [
			m.model,
			{ runs: m.runs, allMentions: m.brand_mentioned_runs + m.competitor_mentions },
		]),
	);
	const byModel = new Map<string, Record<string, MetricValues>>();
	byModel.set(
		input.brand.name,
		Object.fromEntries(
			input.brandByModel.map((m) => [
				m.model,
				measure({ ...m, ...(modelContext.get(m.model) ?? NO_CONTEXT), mentions: m.brand_mentioned_runs }),
			]),
		),
	);
	for (const m of input.competitorsByModel) {
		const models = byModel.get(m.competitor) ?? {};
		models[m.model] = measure({ ...m, ...(modelContext.get(m.model) ?? NO_CONTEXT), mentions: m.runs });
		byModel.set(m.competitor, models);
	}

	const company = (name: string, domain: string | null, isBrand: boolean): LandscapeCompany => {
		const days = daily.get(name) ?? new Map<string, Sums>();
		const sumOver = (dates: Iterable<string>) => {
			let s = ZERO;
			for (const date of dates) s = add(s, days.get(date) ?? { ...ZERO, ...context(date) });
			return s;
		};
		const windowed = input.dates.map((date) =>
			measure(sumOver(Array.from({ length: windowDays }, (_, back) => shiftDateStr(date, { days: -back })))),
		);
		return {
			name,
			isBrand,
			domain,
			totals: measure(sumOver([...inRange])),
			byModel: byModel.get(name) ?? {},
			series: Object.fromEntries(
				LANDSCAPE_METRICS.map((metric) => [metric, windowed.map((values) => values[metric])]),
			) as LandscapeCompany["series"],
		};
	};

	return {
		dates: input.dates,
		models: input.brandByModel.map((m) => m.model),
		companies: [
			company(input.brand.name, input.brand.domain, true),
			...input.competitors.map((c) => company(c.name, c.domain, false)),
		],
	};
}
