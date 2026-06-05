/**
 * Opportunities — "Competitive battleground" full page (rivalry mindset).
 *
 * Treats AEO as a competitive game: standings (you vs each rival by share of
 * voice and how many prompts they lead), the mention-landscape map, and the
 * specific prompts to contest under the top rival. Reads as "where do I stand,
 * and where do I attack".
 */
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { OpportunityMap } from "@/components/opportunity-map";
import type { OpportunityWithLead } from "@/components/opportunities-battlefield";

export interface Standing {
	name: string;
	share: number; // 0..1 share of voice
	isBrand: boolean;
}

const pct = (v: number) => Math.round(v * 100);
const isOpening = (p: OpportunityWithLead) => p.tier === "high" || p.tier === "medium" || p.tier === "low";

export function OpportunitiesCompetitive({
	prompts,
	standings,
}: {
	prompts: OpportunityWithLead[];
	standings: Standing[];
}) {
	const openings = prompts.filter(isOpening);
	const won = prompts.filter((p) => p.tier === "won").length;

	// Prompts each rival leads (mock per-prompt lead competitor).
	const leadCount = new Map<string, number>();
	for (const p of openings) leadCount.set(p.leadCompetitor, (leadCount.get(p.leadCompetitor) ?? 0) + 1);

	const ranked = [...standings].sort((a, b) => b.share - a.share);
	const maxShare = Math.max(0.01, ...ranked.map((s) => s.share));
	const topRival = [...leadCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
	const contestThese = openings
		.filter((p) => p.leadCompetitor === topRival)
		.sort((a, b) => b.opportunity - a.opportunity);

	return (
		<PageHeader title="Opportunities" subtitle="The competitive battleground — where you stand, and where to attack.">
			<div className="space-y-6 pt-2">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">Standings</CardTitle>
						<CardDescription>Share of voice across your prompts, and how many open prompts each rival leads.</CardDescription>
					</CardHeader>
					<CardContent className="divide-y divide-border/60 pt-0">
						{ranked.map((s) => (
							<div key={s.name} className="flex items-center gap-3 py-2.5">
								<div className="flex w-32 shrink-0 items-center gap-2">
									<span className="truncate text-sm font-medium" title={s.name}>
										{s.name}
									</span>
									{s.isBrand && (
										<span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[0.625rem] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
											You
										</span>
									)}
								</div>
								<div className="h-2.5 flex-1 rounded-full bg-muted">
									<div
										className={`h-full rounded-full ${s.isBrand ? "bg-blue-500" : "bg-zinc-400 dark:bg-zinc-500"}`}
										style={{ width: `${(s.share / maxShare) * 100}%` }}
									/>
								</div>
								<div className="w-12 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{pct(s.share)}%</div>
								<div className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
									{s.isBrand ? `leads ${won}` : `leads ${leadCount.get(s.name) ?? 0}`}
								</div>
							</div>
						))}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Mention landscape</CardTitle>
						<CardDescription>
							Each prompt by competitor presence (x) vs your presence (y). Dots below the parity line are openings.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<OpportunityMap prompts={openings} />
						<div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
							<LegendDot color="#3b82f6" label="Won" />
							<LegendDot color="#10b981" label="High" />
							<LegendDot color="#f59e0b" label="Medium" />
							<LegendDot color="#94a3b8" label="Low" />
						</div>
					</CardContent>
				</Card>

				{topRival && (
					<Card>
						<CardHeader>
							<CardTitle className="text-base">
								Contest {topRival}{" "}
								<span className="font-normal text-muted-foreground">— your biggest threat, {contestThese.length} prompts</span>
							</CardTitle>
							<CardDescription>Prompts where {topRival} is mentioned and you're not — go win these back.</CardDescription>
						</CardHeader>
						<CardContent className="divide-y divide-border/60 pt-0">
							{contestThese.map((p) => (
								<div key={p.promptId} className="flex items-center justify-between gap-4 py-2.5">
									<span className="min-w-0 truncate text-sm font-medium" title={p.prompt}>
										{p.prompt}
									</span>
									<span className="shrink-0 text-xs tabular-nums text-muted-foreground">
										You <span className="font-medium text-foreground">{pct(p.brandMentionRate)}%</span> · {topRival}{" "}
										<span className="font-medium text-foreground">{pct(p.competitorMentionRate)}%</span>
									</span>
								</div>
							))}
						</CardContent>
					</Card>
				)}
			</div>
		</PageHeader>
	);
}

function LegendDot({ color, label }: { color: string; label: string }) {
	return (
		<span className="inline-flex items-center gap-1.5">
			<span className="size-2.5 rounded-full" style={{ background: color }} /> {label}
		</span>
	);
}
