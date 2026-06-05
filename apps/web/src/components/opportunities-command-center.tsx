/**
 * Opportunities — "Command center" full page (triage mindset).
 *
 * Composes several signals into one plan: a scorecard (how big is the problem),
 * a prioritized "do this first" worklist (gap + difficulty), and a "where to
 * act" source panel. The point is to read the whole situation and know the next
 * moves without cross-referencing separate views.
 */
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { PromptOpportunity } from "@/server/analysis";
import type { SourceTarget } from "@/components/opportunities-sources";

const pct = (v: number) => Math.round(v * 100);
const isOpening = (p: PromptOpportunity) => p.tier === "high" || p.tier === "medium" || p.tier === "low";

function Stat({ value, label, hint }: { value: string; label: string; hint: string }) {
	return (
		<Card className="shadow-none">
			<CardContent className="py-4">
				<div className="truncate text-2xl font-semibold tabular-nums">{value}</div>
				<div className="truncate text-sm font-medium">{label}</div>
				<div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>
			</CardContent>
		</Card>
	);
}

function diff(stability: number | null): { label: string; cls: string } {
	if (stability === null) return { label: "New", cls: "bg-muted text-muted-foreground" };
	if (stability < 40) return { label: "Easy", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" };
	if (stability < 70) return { label: "Moderate", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
	return { label: "Hard", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" };
}

function GapRow({ p }: { p: PromptOpportunity }) {
	const d = diff(p.stabilityScore);
	return (
		<div className="flex items-center gap-4 py-2.5">
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium" title={p.prompt}>
					{p.prompt}
				</div>
				<div className="relative mt-1.5 h-2 w-full rounded-full bg-muted">
					<div className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${pct(p.brandMentionRate)}%` }} />
					<div
						className="absolute inset-y-[-2px] w-0.5 rounded bg-foreground/70"
						style={{ left: `calc(${pct(p.competitorMentionRate)}% - 1px)` }}
					/>
				</div>
			</div>
			<div className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
				{pct(p.brandMentionRate)}% / {pct(p.competitorMentionRate)}%
			</div>
			<span className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${d.cls}`}>{d.label}</span>
		</div>
	);
}

export function OpportunitiesCommandCenter({ prompts, sources }: { prompts: PromptOpportunity[]; sources: SourceTarget[] }) {
	const openings = prompts.filter(isOpening);
	const won = prompts.filter((p) => p.tier === "won");
	const quickWins = openings.filter((p) => (p.tier === "high" || p.tier === "medium") && (p.stabilityScore ?? 100) < 50);
	const scored = openings.filter((p) => p.stabilityScore !== null);
	const avgDifficulty = scored.length
		? Math.round(scored.reduce((s, p) => s + (p.stabilityScore ?? 0), 0) / scored.length)
		: 0;
	const topOpenings = [...openings].sort((a, b) => b.opportunity - a.opportunity).slice(0, 6);
	const topSources = [...sources].sort((a, b) => b.prompts - a.prompts).slice(0, 5);

	return (
		<PageHeader title="Opportunities" subtitle="Your AEO command center — the gap, the plan, and where to act.">
			<div className="space-y-6 pt-2">
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<Stat value={`${openings.length}`} label="Winnable prompts" hint="competitors lead, you trail" />
					<Stat value={`${quickWins.length}`} label="Quick wins" hint="big gap, low difficulty" />
					<Stat value={`${avgDifficulty}`} label="Avg difficulty" hint="0–100, how entrenched" />
					<Stat value={`${won.length}`} label="Already winning" hint="defend these" />
				</div>

				<div className="grid gap-4 lg:grid-cols-3">
					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle className="text-base">Do this first</CardTitle>
							<CardDescription>
								Open prompts by the size of the gap. Bar = your mention rate; marker = competitors.
							</CardDescription>
						</CardHeader>
						<CardContent className="divide-y divide-border/60 pt-0">
							{topOpenings.map((p) => (
								<GapRow key={p.promptId} p={p} />
							))}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Where to act</CardTitle>
							<CardDescription>Top sources to earn coverage on.</CardDescription>
						</CardHeader>
						<CardContent className="divide-y divide-border/60 pt-0">
							{topSources.map((s) => (
								<div key={s.domain} className="flex items-center justify-between gap-2 py-2.5">
									<span className="truncate text-sm font-medium">{s.domain}</span>
									<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
										{s.prompts} prompt{s.prompts === 1 ? "" : "s"}
									</span>
								</div>
							))}
						</CardContent>
					</Card>
				</div>
			</div>
		</PageHeader>
	);
}
