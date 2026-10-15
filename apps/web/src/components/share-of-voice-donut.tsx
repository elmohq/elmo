/**
 * Donut of share of voice: the brand plus its top competitors, with the long tail bucketed into
 * "Others", the brand's share in the middle and each slice listed beside it.
 */
import { ChartContainer } from "@workspace/ui/components/chart";
import { cn } from "@workspace/ui/lib/utils";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { SiteIcon } from "@/components/site-icon";
import { OTHERS_COLOR } from "@/lib/company-colors";
import type { ShareOfVoiceEntry } from "@/server/analysis";

export interface RingSlice {
	name: string;
	value: number;
	color: string;
	/** Drawn bold in the legend. */
	emphasis: boolean;
	/** Shows the company's icon in the tooltip; absent for slices that aren't one company. */
	company?: { domain?: string };
}

const percent = (value: number, total: number) => `${Math.round((value / total) * 100)}%`;

export function ShareOfVoiceDonut({
	entries,
	colors,
	topN = 4,
	domainFor,
}: {
	entries: ShareOfVoiceEntry[];
	/** Shared with the trend and the leaderboard, so a company is one colour on the page. */
	colors: Map<string, string>;
	topN?: number;
	domainFor?: (name: string) => string | undefined;
}) {
	const slices: RingSlice[] = [];
	let shownCompetitors = 0;
	let othersValue = 0;
	for (const e of entries) {
		if (e.mentions <= 0) continue;
		if (e.isBrand || shownCompetitors < topN) {
			slices.push({
				name: e.name,
				value: e.mentions,
				color: colors.get(e.name) ?? OTHERS_COLOR,
				emphasis: e.isBrand,
				company: { domain: domainFor?.(e.name) },
			});
			if (!e.isBrand) shownCompetitors++;
		} else {
			othersValue += e.mentions;
		}
	}
	if (othersValue > 0) slices.push({ name: "Others", value: othersValue, color: OTHERS_COLOR, emphasis: false });

	const total = slices.reduce((s, x) => s + x.value, 0);
	const brand = slices.find((s) => s.emphasis);
	return <RingChart slices={slices} center={brand ? percent(brand.value, total) : "—"} />;
}

/** A ring of slices with a figure in the hole and each slice listed beside it. */
export function RingChart({ slices, center }: { slices: RingSlice[]; center: string }) {
	const total = slices.reduce((s, x) => s + x.value, 0);
	if (total === 0) return null;
	return (
		<div className="flex items-center gap-6">
			<div className="relative size-44 shrink-0">
				<ChartContainer config={{}} className="aspect-square size-full">
					<PieChart>
						<Pie
							data={slices}
							dataKey="value"
							nameKey="name"
							innerRadius="68%"
							outerRadius="100%"
							paddingAngle={1.5}
							stroke="none"
							startAngle={90}
							endAngle={-270}
							isAnimationActive={false}
						>
							{slices.map((s) => (
								<Cell key={s.name} fill={s.color} />
							))}
						</Pie>
						<Tooltip
							content={({ active, payload }) => {
								if (!active || !payload?.length) return null;
								const s = payload[0].payload as RingSlice;
								return (
									<div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs shadow-md">
										{s.company && <SiteIcon domain={s.company.domain} size="xs" />}
										<span>
											{s.name}: {percent(s.value, total)}
										</span>
									</div>
								);
							}}
						/>
					</PieChart>
				</ChartContainer>
				{/* The headline figure sits in the hole, so the number and the ring read as one. */}
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<span className="text-3xl font-bold tracking-tight tabular-nums">{center}</span>
				</div>
			</div>
			<div className="min-w-0 flex-1 divide-y text-sm">
				{slices.map((s) => (
					<div key={s.name} className="flex items-center gap-2 py-1.5">
						<span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
						<span className={cn("truncate", s.emphasis && "font-semibold")}>{s.name}</span>
						<span className="ml-auto tabular-nums text-muted-foreground">{percent(s.value, total)}</span>
					</div>
				))}
			</div>
		</div>
	);
}
