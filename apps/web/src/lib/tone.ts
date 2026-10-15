import type { Sentiment } from "@workspace/lib/mentions";
import { z } from "zod";

export type Tone = Sentiment;
export const TONES = ["positive", "neutral", "mixed", "negative"] as const satisfies readonly Tone[];

export const toneFilterSchema = z.enum([...TONES, "unmentioned"]);
export type ToneFilter = z.infer<typeof toneFilterSchema>;

export const responseSortSchema = z.enum(["newest", "negative", "positive"]);
export type ResponseSort = z.infer<typeof responseSortSchema>;

/** `all` includes mentions whose tone the judge couldn't call, which no tone counts. */
export type ToneCounts = Record<ToneFilter, number> & { all: number };

/**
 * Okabe–Ito hues, so positive and negative stay apart under the common colour-vision deficiencies.
 * `text` is a darker shade of `color` that keeps contrast on white.
 */
export const TONE_STYLES: Record<Tone, { label: string; color: string; text: string; soft: string }> = {
	positive: {
		label: "Positive",
		color: "#009E73",
		text: "text-[#00795a] dark:text-[#3fc79f]",
		soft: "bg-[#009E73]/15 dark:bg-[#009E73]/30",
	},
	neutral: {
		label: "Neutral",
		color: "#cbd5e1",
		text: "text-slate-500 dark:text-slate-400",
		soft: "bg-slate-200/70 dark:bg-slate-700/60",
	},
	mixed: {
		label: "Mixed",
		color: "#E69F00",
		text: "text-[#a66f00] dark:text-[#f0b840]",
		soft: "bg-[#E69F00]/20 dark:bg-[#E69F00]/30",
	},
	negative: {
		label: "Negative",
		color: "#D55E00",
		text: "text-[#b34d00] dark:text-[#ff8a3d]",
		soft: "bg-[#D55E00]/15 dark:bg-[#D55E00]/30",
	},
};

/** Answers whose tone the judge could call: the base every tone share is of. */
export const toneTotal = (counts: Record<Tone, number>) => TONES.reduce((sum, tone) => sum + counts[tone], 0);

export const isTone = (value: unknown): value is Tone => TONES.includes(value as Tone);
