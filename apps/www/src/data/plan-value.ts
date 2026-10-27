import { costPer1kAnswersUsd, PLAN_KEYS, PLANS } from "@workspace/config/plans";

export interface PlanValueRow {
	vendor: string;
	plan: string;
	monthlyPriceUsd: number;
	costPer1kUsd: number;
	/** The vendor's entry in the tool directory, when it has one. */
	competitorSlug?: string;
}

export const PLAN_VALUE_AS_OF = "2026-10-21";

const COMPETITOR_ROWS: PlanValueRow[] = [
	{ vendor: "Otterly", plan: "Premium", monthlyPriceUsd: 489, costPer1kUsd: 10.2, competitorSlug: "otterly-ai" },
	{ vendor: "Promptmonitor", plan: "Pro", monthlyPriceUsd: 149, costPer1kUsd: 10.6, competitorSlug: "promptmonitor" },
	{
		vendor: "Ahrefs",
		plan: "Lite + Scale",
		monthlyPriceUsd: 379,
		costPer1kUsd: 15.1,
		competitorSlug: "ahrefs-brand-radar",
	},
	{ vendor: "Peec", plan: "Advanced", monthlyPriceUsd: 495, costPer1kUsd: 15.7, competitorSlug: "peec-ai" },
	{ vendor: "Otterly", plan: "Standard", monthlyPriceUsd: 189, costPer1kUsd: 15.8, competitorSlug: "otterly-ai" },
	{ vendor: "Otterly", plan: "Lite", monthlyPriceUsd: 29, costPer1kUsd: 16.1, competitorSlug: "otterly-ai" },
	{ vendor: "Rankscale", plan: "Enterprise", monthlyPriceUsd: 780, costPer1kUsd: 16.3, competitorSlug: "rankscale" },
	{
		vendor: "Promptmonitor",
		plan: "Starter",
		monthlyPriceUsd: 39,
		costPer1kUsd: 17.3,
		competitorSlug: "promptmonitor",
	},
	{ vendor: "Rankscale", plan: "Growth", monthlyPriceUsd: 385, costPer1kUsd: 17.5, competitorSlug: "rankscale" },
	{ vendor: "Promptmonitor", plan: "Growth", monthlyPriceUsd: 79, costPer1kUsd: 17.6, competitorSlug: "promptmonitor" },
	{ vendor: "Peec", plan: "Pro", monthlyPriceUsd: 245, costPer1kUsd: 18.1, competitorSlug: "peec-ai" },
	{ vendor: "Rankscale", plan: "Pro+", monthlyPriceUsd: 229, costPer1kUsd: 19.1, competitorSlug: "rankscale" },
	{ vendor: "Goodie", plan: "Pro", monthlyPriceUsd: 1198.8, costPer1kUsd: 20.0, competitorSlug: "goodie" },
	{ vendor: "Rankscale", plan: "Pro", monthlyPriceUsd: 99, costPer1kUsd: 20.6, competitorSlug: "rankscale" },
	{ vendor: "Peec", plan: "Starter", monthlyPriceUsd: 95, costPer1kUsd: 21.1, competitorSlug: "peec-ai" },
	{ vendor: "Goodie", plan: "Core", monthlyPriceUsd: 354, costPer1kUsd: 21.5, competitorSlug: "goodie" },
	{ vendor: "Writesonic", plan: "Basic", monthlyPriceUsd: 249, costPer1kUsd: 27.7, competitorSlug: "writesonic" },
	{ vendor: "Writesonic", plan: "Growth", monthlyPriceUsd: 499, costPer1kUsd: 27.7, competitorSlug: "writesonic" },
	{
		vendor: "Ahrefs",
		plan: "Lite + Growth",
		monthlyPriceUsd: 229,
		costPer1kUsd: 32.0,
		competitorSlug: "ahrefs-brand-radar",
	},
	{
		vendor: "Semrush",
		plan: "One Pro+",
		monthlyPriceUsd: 299,
		costPer1kUsd: 33.2,
		competitorSlug: "semrush-ai-toolkit",
	},
	{
		vendor: "Semrush",
		plan: "AI Toolkit",
		monthlyPriceUsd: 99,
		costPer1kUsd: 44.0,
		competitorSlug: "semrush-ai-toolkit",
	},
	{
		vendor: "Semrush",
		plan: "One Starter",
		monthlyPriceUsd: 199,
		costPer1kUsd: 44.2,
		competitorSlug: "semrush-ai-toolkit",
	},
	{ vendor: "Scrunch", plan: "Core", monthlyPriceUsd: 250, costPer1kUsd: 50.0, competitorSlug: "scrunch" },
	{ vendor: "Writesonic", plan: "Starter", monthlyPriceUsd: 99, costPer1kUsd: 66.0, competitorSlug: "writesonic" },
	{
		vendor: "Ahrefs",
		plan: "Lite + Basic",
		monthlyPriceUsd: 179,
		costPer1kUsd: 67.5,
		competitorSlug: "ahrefs-brand-radar",
	},
	{ vendor: "AthenaHQ", plan: "Starter", monthlyPriceUsd: 295, costPer1kUsd: 81.9, competitorSlug: "athenahq" },
];

export const ELMO_VENDOR = "Elmo";

export const ELMO_VALUE_ROWS: PlanValueRow[] = PLAN_KEYS.map((key) => ({
	vendor: ELMO_VENDOR,
	plan: PLANS[key].name,
	monthlyPriceUsd: PLANS[key].monthlyPriceUsd,
	costPer1kUsd: costPer1kAnswersUsd(PLANS[key]),
}));

/** Every row, cheapest per answer first. */
export const PLAN_VALUE_ROWS: PlanValueRow[] = [...ELMO_VALUE_ROWS, ...COMPETITOR_ROWS].sort(
	(a, b) => a.costPer1kUsd - b.costPer1kUsd,
);

export function isElmoRow(row: PlanValueRow): boolean {
	return row.vendor === ELMO_VENDOR;
}

/** A competitor's rows, cheapest first; empty when the comparison does not cover it. */
export function valueRowsForCompetitor(slug: string): PlanValueRow[] {
	return PLAN_VALUE_ROWS.filter((row) => row.competitorSlug === slug);
}
