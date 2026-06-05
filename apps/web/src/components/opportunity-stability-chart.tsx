/**
 * Opportunity × difficulty scatter. Each open prompt (where competitors
 * out-mention you) is placed by how big the opening is (y: the competitor-vs-you
 * gap) and how hard it is to break into (x). Difficulty is the citation-stability
 * score read like SEO keyword difficulty: stable sources are cited day after day,
 * so they're entrenched and hard to displace ("Hard"); churning sources leave the
 * citations up for grabs ("Easy"). The best targets are top-left — a big opening
 * that's also low-difficulty. "Won" prompts have no gap, so they're omitted.
 */
import { CartesianGrid, Cell, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ChartContainer } from "@workspace/ui/components/chart";
import { TIER_COLOR } from "@/lib/opportunity-tiers";
import type { PromptOpportunity } from "@/server/analysis";

interface Point {
	x: number;
	y: number;
	id: string;
	prompt: string;
	tier: PromptOpportunity["tier"];
	stabilityScore: number;
	brandMentionRate: number;
	competitorMentionRate: number;
}

const pct = (v: number) => Math.round(v * 100);

export function OpportunityStabilityChart({ prompts }: { prompts: PromptOpportunity[] }) {
	const points: Point[] = prompts
		.filter((p) => p.stabilityScore !== null && p.tier !== "won")
		.map((p) => ({
			x: p.stabilityScore as number,
			y: pct(p.opportunity),
			id: p.promptId,
			prompt: p.prompt,
			tier: p.tier,
			stabilityScore: p.stabilityScore as number,
			brandMentionRate: p.brandMentionRate,
			competitorMentionRate: p.competitorMentionRate,
		}));

	if (points.length === 0) {
		return (
			<div className="text-sm text-muted-foreground py-6 text-center">
				No open prompts with enough citation history to chart yet.
			</div>
		);
	}

	return (
		<ChartContainer config={{}} className="aspect-auto h-[260px] w-full">
			<ScatterChart margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
				<CartesianGrid strokeDasharray="3 3" />
				<XAxis
					type="number"
					dataKey="x"
					domain={[0, 100]}
					ticks={[0, 25, 50, 75, 100]}
					tickLine={false}
					tick={{ fontSize: 11 }}
					tickFormatter={(v: number) => (v === 0 ? "Easy" : v === 100 ? "Hard" : `${v}`)}
				/>
				<YAxis
					type="number"
					dataKey="y"
					domain={[0, 100]}
					width={40}
					tickLine={false}
					tick={{ fontSize: 11 }}
					tickFormatter={(v: number) => `${v}%`}
				/>
				<ZAxis range={[80, 80]} />
				<Tooltip
					cursor={{ strokeDasharray: "3 3" }}
					content={({ active, payload }) => {
						if (!active || !payload?.length) return null;
						const p = payload[0].payload as Point;
						return (
							<div className="border-border/50 bg-background grid min-w-[13rem] max-w-[260px] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
								<div className="font-medium line-clamp-3">{p.prompt}</div>
								<div className="flex items-center gap-2">
									<div className="shrink-0 rounded-[2px] h-2.5 w-2.5" style={{ background: TIER_COLOR[p.tier] }} />
									<span className="text-muted-foreground capitalize">{p.tier} opportunity</span>
									<span className="ml-auto font-mono tabular-nums">{p.y}%</span>
								</div>
								<div className="flex justify-between gap-3 text-muted-foreground">
									<span>Difficulty</span>
									<span className="font-mono tabular-nums text-foreground">{p.stabilityScore}/100</span>
								</div>
								<div className="flex justify-between gap-3 text-muted-foreground">
									<span>You / competitors</span>
									<span className="font-mono tabular-nums text-foreground">
										{pct(p.brandMentionRate)}% / {pct(p.competitorMentionRate)}%
									</span>
								</div>
							</div>
						);
					}}
				/>
				<Scatter data={points} fillOpacity={0.75}>
					{points.map((p) => (
						<Cell key={p.id} fill={TIER_COLOR[p.tier]} />
					))}
				</Scatter>
			</ScatterChart>
		</ChartContainer>
	);
}
