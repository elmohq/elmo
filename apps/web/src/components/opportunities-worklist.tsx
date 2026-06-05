/**
 * Opportunities — "Priority worklist" variant.
 *
 * An opinionated, sorted to-do list rather than a scatter plot: Quick wins
 * first (big opening + low difficulty), then Big bets (big opening but
 * entrenched sources), Long shots, and the prompts you already Hold. Each row
 * renders the you-vs-competitors gap as a bar so "how far behind am I" is
 * legible at a glance.
 */
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { PromptOpportunity } from "@/server/analysis";

const pct = (v: number) => Math.round(v * 100);

/** Difficulty (citation entrenchment) → chip. */
function diffChip(stability: number | null): { label: string; cls: string } {
	if (stability === null) return { label: "New", cls: "bg-muted text-muted-foreground" };
	if (stability < 40) return { label: "Easy", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
	if (stability < 70) return { label: "Moderate", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
	return { label: "Hard", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" };
}

/** A bar of your presence (filled) with a marker at the competitors' level — the gap is the space between. */
function GapBar({ you, competitors, color }: { you: number; competitors: number; color: string }) {
	return (
		<div className="relative h-2.5 w-full rounded-full bg-muted">
			<div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(you)}%`, background: color }} />
			<div
				className="absolute inset-y-[-2px] w-0.5 rounded bg-foreground/70"
				style={{ left: `calc(${pct(competitors)}% - 1px)` }}
				title={`Competitors ${pct(competitors)}%`}
			/>
		</div>
	);
}

function Row({ rank, prompt, color }: { rank: number; prompt: PromptOpportunity; color: string }) {
	const d = diffChip(prompt.stabilityScore);
	return (
		<div className="flex items-center gap-4 py-3">
			<div className="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{rank}</div>
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium" title={prompt.prompt}>
					{prompt.prompt}
				</div>
				<div className="mt-2">
					<GapBar you={prompt.brandMentionRate} competitors={prompt.competitorMentionRate} color={color} />
				</div>
				<div className="mt-1 text-xs tabular-nums text-muted-foreground">
					You {pct(prompt.brandMentionRate)}% · Competitors {pct(prompt.competitorMentionRate)}%
				</div>
			</div>
			<span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${d.cls}`}>{d.label}</span>
		</div>
	);
}

function Bucket({
	title,
	description,
	accent,
	items,
}: {
	title: string;
	description: string;
	accent: string;
	items: PromptOpportunity[];
}) {
	if (items.length === 0) return null;
	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<span className="size-2.5 rounded-full" style={{ background: accent }} />
					{title}
					<span className="font-normal text-muted-foreground">({items.length})</span>
				</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="divide-y divide-border/60 pt-0">
				{items.map((p, i) => (
					<Row key={p.promptId} rank={i + 1} prompt={p} color={accent} />
				))}
			</CardContent>
		</Card>
	);
}

export function OpportunitiesWorklist({ prompts }: { prompts: PromptOpportunity[] }) {
	const openings = prompts.filter((p) => p.tier === "high" || p.tier === "medium" || p.tier === "low");
	const byGap = (a: PromptOpportunity, b: PromptOpportunity) => b.opportunity - a.opportunity;
	const isOpening = (p: PromptOpportunity) => p.tier === "high" || p.tier === "medium"; // sizeable gap
	const easy = (p: PromptOpportunity) => (p.stabilityScore ?? 100) < 50;

	const quickWins = openings.filter((p) => isOpening(p) && easy(p)).sort(byGap);
	const bigBets = openings.filter((p) => isOpening(p) && !easy(p)).sort(byGap);
	const longShots = openings.filter((p) => p.tier === "low").sort(byGap);
	const holding = prompts
		.filter((p) => p.tier === "won")
		.sort((a, b) => b.brandMentionRate - a.brandMentionRate);

	return (
		<PageHeader title="Opportunities" subtitle="Your prioritized worklist for winning more AI mentions.">
			<div className="space-y-4 pt-2">
				<Bucket
					title="Quick wins"
					accent="#10b981"
					description="Big openings whose cited sources churn day to day — easiest to break into. Start here."
					items={quickWins}
				/>
				<Bucket
					title="Big bets"
					accent="#f59e0b"
					description="Big openings, but the sources answering them are entrenched — higher effort, still worth it."
					items={bigBets}
				/>
				<Bucket
					title="Long shots"
					accent="#94a3b8"
					description="Smaller openings — chip away once the wins above are done."
					items={longShots}
				/>
				<Bucket
					title="Holding"
					accent="#3b82f6"
					description="Prompts where you're already mentioned as often as or more than competitors — defend these."
					items={holding}
				/>
			</div>
		</PageHeader>
	);
}
