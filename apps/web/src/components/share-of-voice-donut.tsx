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

interface Slice {
	name: string;
	value: number;
	color: string;
	isBrand: boolean;
	/** Absent on the "Others" bucket, which stands for no single brand. */
	domain?: string;
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
	const slices: Slice[] = [];
	let shownCompetitors = 0;
	let othersValue = 0;
	for (const e of entries) {
		if (e.mentions <= 0) continue;
		if (e.isBrand || shownCompetitors < topN) {
			slices.push({
				name: e.name,
				value: e.mentions,
				color: colors.get(e.name) ?? OTHERS_COLOR,
				isBrand: e.isBrand,
				domain: domainFor?.(e.name),
			});
			if (!e.isBrand) shownCompetitors++;
		} else {
			othersValue += e.mentions;
		}
	}
	if (othersValue > 0) slices.push({ name: "Others", value: othersValue, color: OTHERS_COLOR, isBrand: false });

	const total = slices.reduce((s, x) => s + x.value, 0);
	if (total === 0) return null;
	const brand = slices.find((s) => s.isBrand);

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
								const s = payload[0].payload as Slice;
								return (
									<div className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs shadow-md">
										{s.name !== "Others" && <SiteIcon domain={s.domain} size="xs" />}
										<span>
											{s.name}: {percent(s.value, total)}
										</span>
									</div>
								);
							}}
						/>
					</PieChart>
				</ChartContainer>
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<span className="text-3xl font-bold tracking-tight tabular-nums">
						{brand ? percent(brand.value, total) : "—"}
					</span>
				</div>
			</div>
			<div className="min-w-0 flex-1 divide-y text-sm">
				{slices.map((s) => (
					<div key={s.name} className="flex items-center gap-2 py-1.5">
						<span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
						<span className={cn("truncate", s.isBrand && "font-semibold")}>{s.name}</span>
						<span className="ml-auto tabular-nums text-muted-foreground">{percent(s.value, total)}</span>
					</div>
				))}
			</div>
		</div>
	);
}
