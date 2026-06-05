/**
 * Opportunities — "Command center, leader-benchmarked" (refined triage page).
 *
 * The reframe: aggregate "any competitor" mention rate isn't actionable. Per
 * prompt we benchmark against the single best-performing competitor — the
 * proven, achievable bar — and replace the abstract difficulty score with the
 * concrete thing it stands for: the sources the answer is built from (the path
 * to getting mentioned). Each row tells the whole story: you vs the leader, the
 * gap to close, and where to earn coverage.
 */
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { PromptOpportunity } from "@/server/analysis";

export type LeaderPrompt = PromptOpportunity & {
	/** Best-performing competitor for this prompt, and how often it's mentioned. */
	leader: { name: string; rate: number };
	/** Domains the answers to this prompt cite, highest-reach first. */
	sources: string[];
};

const pct = (v: number) => Math.round(v * 100);

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

/** Your mention rate (filled) with a marker at the leader's rate — the gap is what's left to close. */
function BenchmarkBar({ you, leader }: { you: number; leader: number }) {
	return (
		<div className="relative h-2.5 w-full rounded-full bg-muted">
			<div className="absolute inset-y-0 left-0 rounded-full bg-blue-500" style={{ width: `${pct(you)}%` }} />
			<div
				className="absolute inset-y-[-3px] w-0.5 rounded bg-foreground"
				style={{ left: `calc(${pct(leader)}% - 1px)` }}
				title="leader"
			/>
		</div>
	);
}

function PromptRow({ p }: { p: LeaderPrompt }) {
	const gap = pct(p.leader.rate - p.brandMentionRate);
	return (
		<div className="py-3.5">
			<div className="flex items-baseline justify-between gap-4">
				<div className="truncate text-sm font-medium" title={p.prompt}>
					{p.prompt}
				</div>
				<div className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
					{gap > 0 ? `${gap}pp behind ${p.leader.name}` : "you lead"}
				</div>
			</div>
			<div className="mt-2">
				<BenchmarkBar you={p.brandMentionRate} leader={p.leader.rate} />
			</div>
			<div className="mt-1.5 flex items-center justify-between gap-4 text-xs text-muted-foreground">
				<div className="tabular-nums">
					You <span className="font-medium text-foreground">{pct(p.brandMentionRate)}%</span> · {p.leader.name}{" "}
					<span className="font-medium text-foreground">{pct(p.leader.rate)}%</span>
				</div>
				<div className="min-w-0 truncate">
					Cited: <span className="text-foreground">{p.sources.join(" · ")}</span>
				</div>
			</div>
		</div>
	);
}

export function OpportunitiesCommandCenterV2({ prompts }: { prompts: LeaderPrompt[] }) {
	const openings = prompts.filter((p) => p.leader.rate > p.brandMentionRate);
	const lead = prompts.filter((p) => p.brandMentionRate >= p.leader.rate).length;
	const avgGap = openings.length
		? Math.round((openings.reduce((s, p) => s + (p.leader.rate - p.brandMentionRate), 0) / openings.length) * 100)
		: 0;
	const ranked = [...openings].sort(
		(a, b) => b.leader.rate - b.brandMentionRate - (a.leader.rate - a.brandMentionRate),
	);

	// Which rival is the leader on the most of your open prompts.
	const rivalCount = new Map<string, number>();
	for (const p of openings) rivalCount.set(p.leader.name, (rivalCount.get(p.leader.name) ?? 0) + 1);
	const topRival = [...rivalCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

	return (
		<PageHeader title="Opportunities" subtitle="What it takes to get mentioned — benchmarked against the best competitor on each prompt.">
			<div className="space-y-6 pt-2">
				<div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
					<Stat value={`${openings.length}`} label="Behind on" hint="a competitor out-mentions you" />
					<Stat value={`+${avgGap}pp`} label="Avg gap to leader" hint="how far behind the best" />
					<Stat value={topRival} label="Top rival" hint="leads the most of your prompts" />
					<Stat value={`${lead}`} label="You lead" hint="you're the most-mentioned" />
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Close these gaps</CardTitle>
						<CardDescription>
							Ranked by how far you trail the best competitor on each prompt. Bar = your mention rate; marker = the
							leader's. "Cited" = the sources those answers are built from — where to earn a mention.
						</CardDescription>
					</CardHeader>
					<CardContent className="divide-y divide-border/60 pt-0">
						{ranked.map((p) => (
							<PromptRow key={p.promptId} p={p} />
						))}
					</CardContent>
				</Card>
			</div>
		</PageHeader>
	);
}
