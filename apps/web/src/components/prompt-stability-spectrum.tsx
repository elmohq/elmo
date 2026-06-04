/**
 * Prompt stability spectrum: each prompt placed from volatile (0) to stable
 * (100) by its citation-stability score, coloured by opportunity tier. Built on
 * recharts so it spans the same width as the opportunity map and shows the
 * prompt on hover. Dots are spread across a few rows to reduce overlap.
 */
import { CartesianGrid, Cell, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ChartContainer } from "@workspace/ui/components/chart";
import { TIER_COLOR } from "@/components/opportunity-map";
import type { PromptOpportunity } from "@/server/analysis";

interface Point {
	x: number;
	y: number;
	id: string;
	prompt: string;
	tier: PromptOpportunity["tier"];
	stabilityScore: number;
}

export function PromptStabilitySpectrum({ prompts }: { prompts: PromptOpportunity[] }) {
	const scored = prompts.filter((p): p is PromptOpportunity & { stabilityScore: number } => p.stabilityScore !== null);

	if (scored.length === 0) {
		return (
			<div className="text-sm text-muted-foreground py-6 text-center">
				Not enough citation history yet to chart stability.
			</div>
		);
	}

	const points: Point[] = [...scored]
		.sort((a, b) => a.stabilityScore - b.stabilityScore)
		.map((p, i) => ({
			x: p.stabilityScore,
			y: i % 5,
			id: p.promptId,
			prompt: p.prompt,
			tier: p.tier,
			stabilityScore: p.stabilityScore,
		}));

	return (
		<ChartContainer config={{}} className="aspect-auto h-[160px] w-full">
			<ScatterChart margin={{ top: 16, right: 16, bottom: 24, left: 16 }}>
				<CartesianGrid horizontal={false} strokeDasharray="3 3" />
				<XAxis
					type="number"
					dataKey="x"
					domain={[0, 100]}
					ticks={[0, 25, 50, 75, 100]}
					tickLine={false}
					tick={{ fontSize: 11 }}
					tickFormatter={(v: number) => (v === 0 ? "Volatile" : v === 100 ? "Stable" : `${v}`)}
				/>
				<YAxis type="number" dataKey="y" domain={[-1, 5]} hide />
				<ZAxis range={[70, 70]} />
				<Tooltip
					cursor={{ strokeDasharray: "3 3" }}
					content={({ active, payload }) => {
						if (!active || !payload?.length) return null;
						const p = payload[0].payload as Point;
						return (
							<div className="border-border/50 bg-background grid min-w-[12rem] max-w-[260px] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
								<div className="font-medium line-clamp-3">{p.prompt}</div>
								<div className="flex items-center gap-2">
									<div className="shrink-0 rounded-[2px] h-2.5 w-2.5" style={{ background: TIER_COLOR[p.tier] }} />
									<span className="text-muted-foreground">Stability</span>
									<span className="ml-auto font-mono tabular-nums">{p.stabilityScore}/100</span>
								</div>
							</div>
						);
					}}
				/>
				<Scatter data={points} fillOpacity={0.8}>
					{points.map((p) => (
						<Cell key={p.id} fill={TIER_COLOR[p.tier]} />
					))}
				</Scatter>
			</ScatterChart>
		</ChartContainer>
	);
}
