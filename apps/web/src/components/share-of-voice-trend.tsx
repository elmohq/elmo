/**
 * Brand share of voice over time. Matches the overview's visibility trend in
 * axis formatting and tooltip so the two stacked charts read consistently.
 */
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@workspace/ui/components/chart";

const config = {
	share: { label: "Share of voice", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Build a local Date from a "YYYY-MM-DD" string (avoids the UTC off-by-one of `new Date(iso)`). */
function localDate(value: string): Date {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, month - 1, day);
}

export function ShareOfVoiceTrend({
	data,
	className = "aspect-auto h-[180px] w-full",
}: {
	data: Array<{ date: string; share: number | null }>;
	className?: string;
}) {
	return (
		<ChartContainer config={config} className={className}>
			<AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
				<CartesianGrid vertical={false} strokeDasharray="3 3" />
				<XAxis
					dataKey="date"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={50}
					tick={{ fontSize: 11 }}
					tickFormatter={(value: string) => localDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
				/>
				<YAxis
					domain={[0, 100]}
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					tickCount={4}
					tick={{ fontSize: 11 }}
					tickFormatter={(value: number) => `${value}%`}
				/>
				<ChartTooltip
					isAnimationActive={false}
					cursor={false}
					content={({ active, payload, label }) => {
						if (!active || !payload?.length) return null;
						const share = payload[0]?.value as number | null;
						if (share == null) return null;
						const formattedDate = localDate(label as string).toLocaleDateString("en-US", {
							month: "long",
							day: "numeric",
							year: "numeric",
						});
						return (
							<div className="border-border/50 bg-background grid min-w-[12rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
								<div className="font-medium">{formattedDate}</div>
								<div className="flex items-center gap-2">
									<div className="shrink-0 rounded-[2px] h-2.5 w-2.5" style={{ background: "var(--color-share)" }} />
									<span className="text-muted-foreground">Share of voice</span>
									<span className="ml-auto font-mono tabular-nums">{share}%</span>
								</div>
							</div>
						);
					}}
				/>
				<Area
					dataKey="share"
					type="monotone"
					stroke="var(--color-share)"
					strokeWidth={2}
					fill="var(--color-share)"
					fillOpacity={0.8}
					connectNulls
				/>
			</AreaChart>
		</ChartContainer>
	);
}
