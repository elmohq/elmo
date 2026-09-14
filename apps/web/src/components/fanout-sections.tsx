/**
 * Shared fan-out UI sections, used by the Query Fan-Out page and the prompt
 * details "Web Queries" tab: variation lines with prompt-keyword bolding and
 * run counts, a per-model variations breakdown, and the Query Words section
 * (term cloud + Added/Preserved/Dropped word changes).
 */

import { useI18n } from "@/lib/i18n";
import { IconInfoCircle } from "@tabler/icons-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Separator } from "@workspace/ui/components/separator";
import { Switch } from "@workspace/ui/components/switch";
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { useState } from "react";
import { ProgressBarChart } from "@/components/progress-bar-chart";
import { WordCloud } from "@/components/word-cloud";
import {
	type FanoutQueryStat,
	type ModelFanoutStat,
	normTok,
	type TermStat,
	type WordChangeStat,
	type WordChanges,
} from "@/lib/fanout-analysis";
import { getModelDisplayName } from "@/lib/utils";

export const FANOUT_PURPLE = "#8b5cf6";

export function InfoTip({ children }: { children: React.ReactNode }) {
	return (
		<Tooltip>
			<TooltipTrigger render={<span className="cursor-help" />}>
				<IconInfoCircle className="text-muted-foreground/60 size-3.5" />
			</TooltipTrigger>
			<TooltipContent className="max-w-xs text-sm font-normal">{children}</TooltipContent>
		</Tooltip>
	);
}

/**
 * Engines that ran with web search but contributed no usable queries — they
 * searched with the prompt itself or don't reveal their searches. Purely
 * data-derived (search runs without exposed queries), so it stays correct for
 * any provider/model combination. Renders nothing when every engine exposed
 * queries.
 */
export function UnknownQueriesNote({ byModel }: { byModel: ModelFanoutStat[] }) {
	const { t } = useI18n();
	const hidden = byModel.filter((m) => m.runs > 0 && m.totalQueries === 0);
	if (hidden.length === 0) return null;
	return (
		<div className="text-muted-foreground text-xs">
			{t(
				"{engines} ran with web search enabled but the queries are unknown — the engine may not have searched, searched with just the prompt itself, or searched without revealing its queries.",
				{ engines: hidden.map((m) => getModelDisplayName(m.model)).join(", ") },
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Variations — fan-out queries with the prompt's keywords bolded + run counts
// ---------------------------------------------------------------------------

/** Per-model share of one variation's runs, shown inline as "2× ChatGPT". */
export interface VariationModelCount {
	model: string;
	count: number;
}

export function VariationLine({
	variation,
	keywords,
	modelCounts,
}: {
	variation: FanoutQueryStat;
	keywords: Set<string>;
	/** When provided, replaces the plain total with per-model counts. */
	modelCounts?: VariationModelCount[];
}) {
	const { t, n } = useI18n();
	const seen = new Map<string, number>();
	const segs = variation.query
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => {
			const idx = seen.get(w) ?? 0;
			seen.set(w, idx + 1);
			return { text: w, bold: keywords.has(normTok(w)), key: `${w}:${idx}` };
		});
	return (
		<div className="flex items-baseline justify-between gap-4">
			<div className="min-w-0 text-sm leading-6 break-words">
				{segs.map((s) => (
					<span key={s.key} className={s.bold ? "text-foreground font-semibold" : "text-muted-foreground"}>
						{s.text}{" "}
					</span>
				))}
			</div>
			{modelCounts?.length ? (
				<span
					className="text-muted-foreground shrink-0 text-right text-xs tabular-nums leading-6"
					title={t("Times each engine ran this search")}
				>
					{modelCounts.map((mc) => `${n(mc.count)}× ${getModelDisplayName(mc.model)}`).join(" · ")}
				</span>
			) : (
				<span className="text-muted-foreground shrink-0 text-sm tabular-nums" title={t("Times engines ran this search")}>
					{n(variation.count)}×
				</span>
			)}
		</div>
	);
}

export function VariationsList({
	variations,
	keywords,
	totalUnique,
	modelCounts,
}: {
	variations: FanoutQueryStat[];
	keywords: Set<string>;
	/** Full distinct count, when `variations` is a capped slice of it. */
	totalUnique?: number;
	/** query → per-model counts, for the inline "2× ChatGPT" breakdown. */
	modelCounts?: Map<string, VariationModelCount[]>;
}) {
	const { t } = useI18n();
	if (variations.length === 0) {
		return <div className="text-muted-foreground py-4 text-sm">{t("No web queries for this selection.")}</div>;
	}
	return (
		<div className="space-y-2">
			{variations.map((v) => (
				<VariationLine key={v.query} variation={v} keywords={keywords} modelCounts={modelCounts?.get(v.query)} />
			))}
			{totalUnique !== undefined && totalUnique > variations.length && (
				<div className="text-muted-foreground text-xs">
					{t("Top {shown} of {total} variations shown", { shown: variations.length, total: totalUnique })}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Query Words — the term cloud + Added / Preserved / Dropped word changes
// ---------------------------------------------------------------------------

type WordTab = "added" | "preserved" | "dropped";

const WORD_TAB_HELP: Record<WordTab, string> = {
	added: /* i18n */ "Words engines add that weren't in your prompt — the intent they layer on (e.g. “best”, “2026”, “vs”).",
	preserved: /* i18n */ "Words from your prompt engines keep in their searches.",
	dropped: /* i18n */ "Words from your prompt engines leave out of their searches.",
};

const EMPTY_WORDS: Record<WordTab, string> = {
	added: /* i18n */ "No added words.",
	preserved: /* i18n */ "No preserved words.",
	dropped: /* i18n */ "No dropped words.",
};

export function QueryWordsSection({ terms, wordChanges }: { terms: TermStat[]; wordChanges: WordChanges }) {
	const { t, p } = useI18n();
	const [tab, setTab] = useState<WordTab>("added");
	const [hideStop, setHideStop] = useState(true);

	const words: WordChangeStat[] = wordChanges[tab];
	const shown = hideStop ? words.filter((w) => !w.isStop) : words;
	const items = shown.slice(0, 18).map((w) => ({
		label: w.word,
		count: w.count,
		suffix: <span className="text-muted-foreground tabular-nums text-xs">{p(w.share)}</span>,
	}));

	return (
		<div className="space-y-6">
			<Card className="py-4">
				<CardContent>
					<WordCloud terms={terms} />
				</CardContent>
			</Card>

			<Card className="gap-4">
				<CardHeader>
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							<CardTitle className="flex items-center gap-1.5 text-base">
								{t("Word Changes")}
								<InfoTip>{t(WORD_TAB_HELP[tab])}</InfoTip>
							</CardTitle>
							<CardDescription>{t("How engines rewrite your prompt wording.")}</CardDescription>
						</div>
						<div className="flex items-center gap-4">
							<div className="flex items-center gap-2">
								<Switch id="qf-hide-stop" checked={hideStop} onCheckedChange={setHideStop} />
								<label htmlFor="qf-hide-stop" className="text-muted-foreground cursor-pointer text-sm">
									{t("Hide stop words")}
								</label>
							</div>
							<Tabs value={tab} onValueChange={(v) => setTab(v as WordTab)}>
								<TabsList>
									<TabsTrigger value="added">{t("Added")}</TabsTrigger>
									<TabsTrigger value="preserved">{t("Preserved")}</TabsTrigger>
									<TabsTrigger value="dropped">{t("Dropped")}</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>
					</div>
				</CardHeader>
				<Separator />
				<CardContent>
					{items.length > 0 ? (
						<ProgressBarChart items={items} defaultColor={FANOUT_PURPLE} />
					) : (
						<div className="text-muted-foreground py-6 text-center text-sm">
							{t(EMPTY_WORDS[tab])}
							{hideStop ? ` ${t("(try showing stop words)")}` : ""}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
