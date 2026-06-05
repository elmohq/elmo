/**
 * Opportunities — "Competitor battlefield" variant.
 *
 * Framed around rivals: who is winning the AI mentions you're missing, and on
 * which prompts. Leads with a threat ranking (competitors by how many of your
 * open prompts they currently lead), then the specific prompts to contest under
 * each. Answers "who's beating me, and where" rather than a per-prompt scatter.
 *
 * Requires a per-prompt lead competitor; the real version would derive this from
 * per-prompt competitor mentions (the data the donut/leaderboard already use).
 */
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { PromptOpportunity } from "@/server/analysis";

export type OpportunityWithLead = PromptOpportunity & { leadCompetitor: string };

const pct = (v: number) => Math.round(v * 100);

export function OpportunitiesBattlefield({ prompts }: { prompts: OpportunityWithLead[] }) {
	const openings = prompts.filter((p) => p.tier === "high" || p.tier === "medium" || p.tier === "low");

	const byCompetitor = new Map<string, OpportunityWithLead[]>();
	for (const p of openings) {
		const arr = byCompetitor.get(p.leadCompetitor) ?? [];
		arr.push(p);
		byCompetitor.set(p.leadCompetitor, arr);
	}
	const ranked = [...byCompetitor.entries()]
		.map(([name, ps]) => ({
			name,
			count: ps.length,
			prompts: [...ps].sort((a, b) => b.opportunity - a.opportunity),
		}))
		.sort((a, b) => b.count - a.count);
	const maxCount = Math.max(1, ...ranked.map((r) => r.count));

	return (
		<PageHeader
			title="Opportunities"
			subtitle="Where rivals are winning AI mentions you're not — and the prompts to contest."
		>
			<div className="space-y-6 pt-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Who's winning your prompts</CardTitle>
						<CardDescription>Competitors ranked by how many of your open prompts they currently lead.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-3">
						{ranked.map((r) => (
							<div key={r.name} className="flex items-center gap-3">
								<div className="w-28 shrink-0 truncate text-sm font-medium" title={r.name}>
									{r.name}
								</div>
								<div className="h-2.5 flex-1 rounded-full bg-muted">
									<div
										className="h-full rounded-full bg-rose-400 dark:bg-rose-500"
										style={{ width: `${(r.count / maxCount) * 100}%` }}
									/>
								</div>
								<div className="w-20 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
									{r.count} prompt{r.count === 1 ? "" : "s"}
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				{ranked.map((r) => (
					<Card key={r.name}>
						<CardHeader>
							<CardTitle className="text-base">
								{r.name}{" "}
								<span className="font-normal text-muted-foreground">
									— {r.count} prompt{r.count === 1 ? "" : "s"} to contest
								</span>
							</CardTitle>
						</CardHeader>
						<CardContent className="divide-y divide-border/60 pt-0">
							{r.prompts.map((p) => (
								<div key={p.promptId} className="flex items-center justify-between gap-4 py-3">
									<div className="min-w-0 truncate text-sm font-medium" title={p.prompt}>
										{p.prompt}
									</div>
									<div className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
										You <span className="font-medium text-foreground">{pct(p.brandMentionRate)}%</span> · {r.name}{" "}
										<span className="font-medium text-foreground">{pct(p.competitorMentionRate)}%</span>
									</div>
								</div>
							))}
						</CardContent>
					</Card>
				))}
			</div>
		</PageHeader>
	);
}
