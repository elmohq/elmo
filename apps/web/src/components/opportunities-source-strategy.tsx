/**
 * Opportunities — "Source & coverage strategy" full page (AEO-content mindset).
 *
 * Treats AEO as a sourcing problem: to be mentioned you need to be in the
 * sources the model cites. Composes a coverage scorecard, the ranked source
 * targets, and a split of the two distinct fixes — "not cited" prompts (earn
 * coverage) vs "cited but losing" prompts (you're in the source but not the
 * answer → fix positioning).
 */
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { PromptOpportunity } from "@/server/analysis";
import type { SourceTarget } from "@/components/opportunities-sources";

export type OpportunityWithCoverage = PromptOpportunity & { youCited: boolean };

const pct = (v: number) => Math.round(v * 100);
const isOpening = (p: OpportunityWithCoverage) => p.tier === "high" || p.tier === "medium" || p.tier === "low";

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

function PromptList({ items }: { items: OpportunityWithCoverage[] }) {
	if (items.length === 0) return <div className="py-3 text-sm text-muted-foreground">None right now.</div>;
	return (
		<div className="divide-y divide-border/60">
			{items.map((p) => (
				<div key={p.promptId} className="flex items-center justify-between gap-4 py-2.5">
					<span className="min-w-0 truncate text-sm font-medium" title={p.prompt}>
						{p.prompt}
					</span>
					<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
						You {pct(p.brandMentionRate)}% · Competitors {pct(p.competitorMentionRate)}%
					</span>
				</div>
			))}
		</div>
	);
}

export function OpportunitiesSourceStrategy({
	sources,
	prompts,
}: {
	sources: SourceTarget[];
	prompts: OpportunityWithCoverage[];
}) {
	const openings = prompts.filter(isOpening);
	const notCited = openings.filter((p) => !p.youCited).sort((a, b) => b.opportunity - a.opportunity);
	const citedButLosing = openings.filter((p) => p.youCited).sort((a, b) => b.opportunity - a.opportunity);
	const citedShare = openings.length ? Math.round((citedButLosing.length / openings.length) * 100) : 0;
	const targets = sources.filter((s) => !s.covered).length;
	const ranked = [...sources].sort((a, b) => b.prompts - a.prompts);
	const max = Math.max(1, ...ranked.map((s) => s.prompts));

	return (
		<PageHeader title="Opportunities" subtitle="Source & coverage strategy — show up where AI builds its answers.">
			<div className="space-y-6 pt-2">
				<div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<Stat value={`${citedShare}%`} label="Source coverage" hint="of openings cite a page you're on" />
					<Stat value={`${targets}`} label="Sources to target" hint="high-reach, not yet on" />
					<Stat value={`${notCited.length}`} label="Not cited" hint="earn coverage" />
					<Stat value={`${citedButLosing.length}`} label="Cited but losing" hint="fix positioning" />
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Source targets</CardTitle>
						<CardDescription>
							Domains AI cites across the prompts you're missing, ranked by reach. "Target" = you're not on it yet.
						</CardDescription>
					</CardHeader>
					<CardContent className="divide-y divide-border/60 pt-0">
						{ranked.map((s) => (
							<div key={s.domain} className="flex items-center gap-4 py-2.5">
								<div className="w-40 shrink-0 truncate text-sm font-medium" title={s.domain}>
									{s.domain}
								</div>
								<div className="h-2.5 flex-1 rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-violet-400 dark:bg-violet-500"
										style={{ width: `${(s.prompts / max) * 100}%` }}
									/>
								</div>
								<div className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{s.prompts} prompts</div>
								<span
									className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${
										s.covered
											? "bg-muted text-muted-foreground"
											: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
									}`}
								>
									{s.covered ? "Cited" : "Target"}
								</span>
							</div>
						))}
					</CardContent>
				</Card>

				<div className="grid gap-4 lg:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Not cited — earn coverage</CardTitle>
							<CardDescription>AI doesn't pull you in for these. Get onto the sources answering them.</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<PromptList items={notCited} />
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Cited but losing — fix positioning</CardTitle>
							<CardDescription>You're in the sources but not the answer — strengthen how you're presented there.</CardDescription>
						</CardHeader>
						<CardContent className="pt-0">
							<PromptList items={citedButLosing} />
						</CardContent>
					</Card>
				</div>
			</div>
		</PageHeader>
	);
}
