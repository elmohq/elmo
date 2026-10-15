/**
 * The brand and each tracked competitor on the same four measures, overall, per model and per day,
 * built from rollup sums. Shares are fractions of 1; position is an average place, 1 being named first.
 */
import type {
	CompetitorModelSums,
	DailyCompetitorSums,
	DailyRunSums,
	ModelRunSums,
	VerdictSums,
} from "@/lib/rollup-read";
import { SENTIMENT_WINDOW_DAYS } from "@/lib/sentiment";
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
	companies: LandscapeCompany[];
}

/** What one company contributes over some span, alongside the span's totals it is measured against. */
interface Sums extends VerdictSums {
	mentions: number;
	runs: number;
	allMentions: number;
}

const ZERO: Sums = {
	mentions: 0,
	runs: 0,
	allMentions: 0,
	positive_runs: 0,
	neutral_runs: 0,
	negative_runs: 0,
	mixed_runs: 0,
	position_sum: 0,
	positioned_runs: 0,
};

const add = (a: Sums, b: Sums): Sums =>
	Object.fromEntries(Object.keys(ZERO).map((k) => [k, a[k as keyof Sums] + b[k as keyof Sums]])) as unknown as Sums;

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export function measure(s: Sums): MetricValues {
	const clear = s.positive_runs + s.neutral_runs + s.negative_runs + s.mixed_runs;
	return {
		visibility: ratio(s.mentions, s.runs),
		share: ratio(s.mentions, s.allMentions),
		sentiment: ratio(s.positive_runs, clear),
		position: s.positioned_runs > 0 ? s.position_sum / s.positioned_runs : null,
	};
}

const verdicts = (v: VerdictSums): VerdictSums => ({
	positive_runs: v.positive_runs,
	neutral_runs: v.neutral_runs,
	negative_runs: v.negative_runs,
	mixed_runs: v.mixed_runs,
	position_sum: v.position_sum,
	positioned_runs: v.positioned_runs,
});

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
		put(input.brand.name, d.date, { ...context(d.date), ...verdicts(d), mentions: d.brand_mentioned_runs });
	for (const d of input.competitorDaily)
		put(d.competitor, d.date, { ...context(d.date), ...verdicts(d), mentions: d.runs });

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
				measure({ ...(modelContext.get(m.model) ?? ZERO), ...verdicts(m), mentions: m.brand_mentioned_runs }),
			]),
		),
	);
	for (const m of input.competitorsByModel) {
		const models = byModel.get(m.competitor) ?? {};
		models[m.model] = measure({ ...(modelContext.get(m.model) ?? ZERO), ...verdicts(m), mentions: m.runs });
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
