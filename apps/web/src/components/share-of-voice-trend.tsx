/**
 * Brand share of voice over time. Mirrors the visibility trend: a simple area
 * of the brand's share (0–100%) across the lookback window. Reused on the
 * Share of Voice page and the Overview.
 */
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@workspace/ui/components/chart";

const config = {
	share: { label: "Share of voice", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ShareOfVoiceTrend({
	data,
	className = "aspect-auto h-[180px] w-full",
}: {
	data: Array<{ date: string; share: number | null }>;
	className?: string;
}) {
	return (
		<ChartContainer config={config} className={className}>
			<AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
				<CartesianGrid vertical={false} />
				<XAxis
					dataKey="date"
					tickLine={false}
					axisLine={false}
					tickMargin={8}
					minTickGap={32}
					tickFormatter={(d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
				/>
				<YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => `${v}%`} />
				<ChartTooltip content={<ChartTooltipContent />} />
				<Area
					dataKey="share"
					type="monotone"
					stroke="var(--color-share)"
					fill="var(--color-share)"
					fillOpacity={0.2}
					strokeWidth={2}
					connectNulls
				/>
			</AreaChart>
		</ChartContainer>
	);
}
