/**
 * Prompt stability spectrum: a 1-D strip placing each prompt from volatile (0)
 * to stable (100) by its citation-stability score, coloured by opportunity tier.
 * Gives an at-a-glance read of which prompts' cited sources churn vs. stick —
 * complementing the per-row number in the table.
 */
import { TIER_COLOR } from "@/components/opportunity-map";
import type { PromptOpportunity } from "@/server/analysis";

const W = 1000;
const H = 104;
const PAD_X = 52;
const MID = 46;

export function PromptStabilitySpectrum({ prompts }: { prompts: PromptOpportunity[] }) {
	const scored = prompts
		.filter((p): p is PromptOpportunity & { stabilityScore: number } => p.stabilityScore !== null)
		.sort((a, b) => a.stabilityScore - b.stabilityScore);

	if (scored.length === 0) {
		return (
			<div className="text-sm text-muted-foreground py-6 text-center">
				Not enough citation history yet to chart stability.
			</div>
		);
	}

	const x = (score: number) => PAD_X + (score / 100) * (W - PAD_X * 2);

	return (
		<svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} role="img" aria-label="Prompt stability spectrum">
			<line x1={PAD_X} y1={MID} x2={W - PAD_X} y2={MID} stroke="var(--border)" strokeWidth={2} />
			{[0, 25, 50, 75, 100].map((t) => (
				<line key={t} x1={x(t)} y1={MID - 6} x2={x(t)} y2={MID + 6} stroke="var(--border)" strokeWidth={1} />
			))}
			{scored.map((p, i) => (
				<circle
					key={p.promptId}
					cx={x(p.stabilityScore)}
					cy={MID + ((i % 5) - 2) * 7}
					r={6}
					fill={TIER_COLOR[p.tier]}
					fillOpacity={0.8}
				>
					<title>{`${p.prompt}\nStability ${p.stabilityScore}/100 · ${p.tier}`}</title>
				</circle>
			))}
			<text x={PAD_X} y={H - 6} fontSize={12} fill="var(--muted-foreground)">
				Volatile
			</text>
			<text x={W - PAD_X} y={H - 6} fontSize={12} fill="var(--muted-foreground)" textAnchor="end">
				Stable
			</text>
		</svg>
	);
}
