import { ChartContainer } from "@workspace/ui/components/chart";
import { cn } from "@workspace/ui/lib/utils";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";

const percent = (value: number, total: number) => `${Math.round((value / total) * 100)}%`;

export interface RingSlice {
	name: string;
	value: number;
	color: string;
	/** Drawn bold in the legend. */
	emphasis: boolean;
	/** Shown beside the slice's name in the tooltip. */
	icon?: ReactNode;
}

export function RingChart({ slices, center }: { slices: RingSlice[]; center: string }) {
	const total = slices.reduce((s, x) => s + x.value, 0);
	if (total === 0) return null;
	return (
		<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
			<div className="relative size-40 shrink-0 self-center sm:size-44">
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
										{s.icon}
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
					<span className="text-3xl font-bold tracking-tight tabular-nums">{center}</span>
				</div>
			</div>
			<div className="min-w-0 divide-y text-sm sm:flex-1">
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
