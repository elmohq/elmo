import type { LandscapeMetric } from "@/lib/landscape";

export type Tone = "good" | "fair" | "poor";

export interface MetricMeta {
	label: string;
	/** Shorter, for the metric switch. */
	short: string;
	info: string;
	format: (value: number) => string;
	formatChange: (change: number) => string;
	/** Position: lower is better, so axes flip and a fall is good news. */
	lowerIsBetter: boolean;
	/** `rank` is the brand's place among the tracked companies on this measure. */
	tone: (value: number, rank: number) => Tone;
	page:
		| "/app/org/$org/brand/$brand/visibility"
		| "/app/org/$org/brand/$brand/share-of-voice"
		| "/app/org/$org/brand/$brand/responses";
}

const percent = (value: number) => `${Math.round(value * 100)}%`;
const points = (change: number) => `${Math.abs(Math.round(change * 100))}pt`;

export const METRIC_META: Record<LandscapeMetric, MetricMeta> = {
	visibility: {
		label: "AI Visibility",
		short: "Visibility",
		info: "The share of AI answers to your prompts that mention your brand.",
		format: percent,
		formatChange: points,
		lowerIsBetter: false,
		tone: (value) => (value > 0.75 ? "good" : value > 0.45 ? "fair" : "poor"),
		page: "/app/org/$org/brand/$brand/visibility",
	},
	share: {
		label: "Share of Voice",
		short: "Share of Voice",
		info: "Your brand's share of every mention of you and your tracked competitors.",
		format: percent,
		formatChange: points,
		lowerIsBetter: false,
		// A raw share depends on how many competitors are tracked, so it's judged by standing instead.
		tone: (_value, rank) => (rank === 1 ? "good" : rank <= 3 ? "fair" : "poor"),
		page: "/app/org/$org/brand/$brand/share-of-voice",
	},
	sentiment: {
		label: "Sentiment",
		short: "Sentiment",
		info: "Of the answers that mention your brand with a clear tone, the share that speak of it positively, over the trailing week.",
		format: percent,
		formatChange: points,
		lowerIsBetter: false,
		tone: (value) => (value > 0.7 ? "good" : value > 0.5 ? "fair" : "poor"),
		page: "/app/org/$org/brand/$brand/responses",
	},
	position: {
		label: "Position",
		short: "Position",
		info: "Where your brand comes among the tracked companies an answer names, averaged over the trailing week. 1 means named first.",
		format: (value) => value.toFixed(1),
		formatChange: (change) => Math.abs(change).toFixed(1),
		lowerIsBetter: true,
		tone: (value) => (value <= 1.5 ? "good" : value <= 2.5 ? "fair" : "poor"),
		page: "/app/org/$org/brand/$brand/visibility",
	},
};

export const TONE_STYLES: Record<Tone, { card: string; text: string; stroke: string; fill: string }> = {
	good: {
		card: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800",
		text: "text-emerald-700 dark:text-emerald-400",
		stroke: "#059669",
		fill: "#a7f3d0",
	},
	fair: {
		card: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800",
		text: "text-amber-700 dark:text-amber-400",
		stroke: "#d97706",
		fill: "#fde68a",
	},
	poor: {
		card: "bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-800",
		text: "text-rose-700 dark:text-rose-400",
		stroke: "#e11d48",
		fill: "#fecdd3",
	},
};

/** 1 for the best value among `values`, honouring which direction is better; null values rank last. */
export function rankAmong(value: number | null, values: (number | null)[], lowerIsBetter: boolean): number {
	if (value === null) return values.length;
	return values.filter((v) => v !== null && (lowerIsBetter ? v < value : v > value)).length + 1;
}
