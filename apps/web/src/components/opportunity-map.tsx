/**
 * Opportunity map: a scatter of every prompt by competitor presence (x) vs
 * brand presence (y). Points below the parity line — competitors are mentioned
 * but you aren't — are the openings. Dot colour encodes the opportunity tier.
 */
import { CartesianGrid, Cell, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { ChartContainer } from "@workspace/ui/components/chart";
import type { PromptOpportunity } from "@/server/analysis";

const TIER_COLOR: Record<PromptOpportunity["tier"], string> = {
	won: "#3b82f6",
	high: "#10b981",
	medium: "#f59e0b",
	low: "#94a3b8",
};

interface Point {
	id: string;
	x: number;
	y: number;
	z: number;
	prompt: string;
	tier: PromptOpportunity["tier"];
	opportunity: number;
}

export function OpportunityMap({ prompts }: { prompts: PromptOpportunity[] }) {
	const points: Point[] = prompts.map((p) => ({
		id: p.promptId,
		x: p.competitorMentionRate,
		y: p.brandMentionRate,
		z: p.runs,
		prompt: p.prompt,
		tier: p.tier,
		opportunity: p.opportunity,
	}));

	return (
		<ChartContainer config={{}} className="aspect-auto h-[340px] w-full">
			<ScatterChart margin={{ top: 16, right: 16, bottom: 28, left: 8 }}>
				<CartesianGrid strokeDasharray="3 3" />
				<XAxis
					type="number"
					dataKey="x"
					name="Competitor presence"
					domain={[0, 1]}
					tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
					label={{ value: "Competitor presence", position: "bottom", offset: 12 }}
				/>
				<YAxis
					type="number"
					dataKey="y"
					name="Your presence"
					domain={[0, 1]}
					tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
					label={{ value: "Your presence", angle: -90, position: "insideLeft" }}
				/>
				<ZAxis type="number" dataKey="z" range={[40, 320]} name="Runs" />
				{/* Parity line: above it you lead, below it competitors lead (your openings). */}
				<ReferenceLine
					segment={[
						{ x: 0, y: 0 },
						{ x: 1, y: 1 },
					]}
					stroke="var(--muted-foreground)"
					strokeDasharray="4 4"
				/>
				<Tooltip
					cursor={{ strokeDasharray: "3 3" }}
					content={({ active, payload }) => {
						if (!active || !payload?.length) return null;
						const p = payload[0].payload as Point;
						return (
							<div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md max-w-[260px]">
								<div className="font-medium mb-1 line-clamp-3">{p.prompt}</div>
								<div className="text-muted-foreground">
									You {Math.round(p.y * 100)}% · Competitors {Math.round(p.x * 100)}%
								</div>
								<div className="text-muted-foreground">
									{p.tier === "won" ? "Already winning" : `${p.tier} opportunity (${p.opportunity.toFixed(2)})`}
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
