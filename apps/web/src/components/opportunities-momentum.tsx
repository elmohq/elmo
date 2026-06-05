/**
 * Opportunities — "Momentum" variant.
 *
 * Frames opportunities as change over time rather than a static gap: where your
 * mention rate is slipping (defend before a competitor locks it in) and where
 * it's rising (press the advantage). Each row shows a sparkline + the 30-day
 * delta. Efficiently computable: the per-prompt brand mention-rate slope from
 * getPerPromptDailyMentions (recent window vs earlier window).
 */
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import type { PromptOpportunity } from "@/server/analysis";

export type OpportunityWithTrend = PromptOpportunity & { delta: number; spark: number[] };

const pct = (v: number) => Math.round(v * 100);

function Sparkline({ data, color }: { data: number[]; color: string }) {
	if (data.length < 2) return null;
	const w = 84;
	const h = 24;
	const pad = 2;
	const min = Math.min(...data);
	const max = Math.max(...data);
	const range = max - min || 1;
	const pts = data
		.map((v, i) => {
			const x = pad + (i / (data.length - 1)) * (w - 2 * pad);
			const y = h - pad - ((v - min) / range) * (h - 2 * pad);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");
	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden="true">
			<polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function Row({ p, color }: { p: OpportunityWithTrend; color: string }) {
	return (
		<div className="flex items-center gap-4 py-3">
			<div className="min-w-0 flex-1">
				<div className="truncate text-sm font-medium" title={p.prompt}>
					{p.prompt}
				</div>
				<div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
					You {pct(p.brandMentionRate)}% · Competitors {pct(p.competitorMentionRate)}%
				</div>
			</div>
			<Sparkline data={p.spark} color={color} />
			<div className="w-16 shrink-0 text-right text-sm font-medium tabular-nums" style={{ color }}>
				{p.delta > 0 ? "▲" : "▼"} {Math.abs(p.delta)}pp
			</div>
		</div>
	);
}

export function OpportunitiesMomentum({ prompts }: { prompts: OpportunityWithTrend[] }) {
	const slipping = prompts.filter((p) => p.delta < 0).sort((a, b) => a.delta - b.delta);
	const rising = prompts.filter((p) => p.delta > 0).sort((a, b) => b.delta - a.delta);

	return (
		<PageHeader
			title="Opportunities"
			subtitle="Where you're gaining and losing ground in AI answers over the last 30 days."
		>
			<div className="space-y-6 pt-2">
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<span className="size-2.5 rounded-full bg-rose-500" />
							Losing ground
							<span className="font-normal text-muted-foreground">({slipping.length})</span>
						</CardTitle>
						<CardDescription>Your mention rate is falling here — defend before competitors lock these in.</CardDescription>
					</CardHeader>
					<CardContent className="divide-y divide-border/60 pt-0">
						{slipping.map((p) => (
							<Row key={p.promptId} p={p} color="#ef4444" />
						))}
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<span className="size-2.5 rounded-full bg-emerald-500" />
							Gaining ground
							<span className="font-normal text-muted-foreground">({rising.length})</span>
						</CardTitle>
						<CardDescription>You're rising here — press the advantage to overtake.</CardDescription>
					</CardHeader>
					<CardContent className="divide-y divide-border/60 pt-0">
						{rising.map((p) => (
							<Row key={p.promptId} p={p} color="#10b981" />
						))}
					</CardContent>
				</Card>
			</div>
		</PageHeader>
	);
}
