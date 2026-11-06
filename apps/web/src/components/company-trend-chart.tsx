import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@workspace/ui/components/chart";
import { cn } from "@workspace/ui/lib/utils";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { formatShortDate } from "@/lib/chart-utils";

export interface CompanyTrend {
	name: string;
	isBrand: boolean;
	color: string;
	/** One value per entry of `dates`. */
	values: (number | null)[];
}

/** Series keys are indexes rather than names, which can hold characters a CSS variable can't. */
const keyOf = (index: number) => `c${index}`;

export function CompanyTrendChart({
	dates,
	companies,
	format,
	lowerIsBetter = false,
	height = 260,
}: {
	dates: string[];
	companies: CompanyTrend[];
	format: (value: number) => string;
	/** Flips the axis so an improving line still rises. */
	lowerIsBetter?: boolean;
	/** "fill" stretches to the parent's height, which must be bounded. */
	height?: number | "fill";
}) {
	const fill = height === "fill";
	const config: ChartConfig = Object.fromEntries(
		companies.map((c, i) => [keyOf(i), { label: c.name, color: c.color }]),
	);
	const data = dates.map((date, d) => ({
		date,
		...Object.fromEntries(companies.map((c, i) => [keyOf(i), c.values[d]])),
	}));
	return (
		<div className={cn(fill && "flex h-full flex-col")}>
			<ChartContainer
				config={config}
				className={cn("aspect-auto w-full", fill && "min-h-0 flex-1")}
				style={fill ? undefined : { height }}
			>
				<LineChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
					<CartesianGrid vertical={false} />
					<XAxis
						dataKey="date"
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						minTickGap={32}
						tickFormatter={formatShortDate}
					/>
					<YAxis
						tickLine={false}
						axisLine={false}
						tickMargin={8}
						width={44}
						reversed={lowerIsBetter}
						domain={lowerIsBetter ? [1, "auto"] : [0, "auto"]}
						allowDecimals={!lowerIsBetter}
						tickCount={6}
						tickFormatter={format}
					/>
					<ChartTooltip
						cursor={false}
						content={
							<ChartTooltipContent
								indicator="dot"
								labelFormatter={(value) => formatShortDate(String(value))}
								// A custom formatter replaces the stock row, swatch included, so it draws its own.
								formatter={(value, name) => (
									<>
										<span
											className="size-2.5 shrink-0 rounded-[2px]"
											style={{ backgroundColor: config[name as string]?.color }}
										/>
										<span className="flex flex-1 justify-between gap-4">
											<span className="text-muted-foreground">{config[name as string]?.label}</span>
											<span className="font-mono tabular-nums">{format(Number(value))}</span>
										</span>
									</>
								)}
							/>
						}
					/>
					{companies.map((c, i) => (
						<Line
							key={c.name}
							dataKey={keyOf(i)}
							type="bump"
							stroke={`var(--color-${keyOf(i)})`}
							strokeWidth={c.isBrand ? 3 : 2}
							dot={
								c.isBrand
									? { r: 3, fill: `var(--color-${keyOf(i)})`, strokeWidth: 0 }
									: { r: 2.25, fill: "var(--card)", stroke: `var(--color-${keyOf(i)})`, strokeWidth: 1.5 }
							}
							connectNulls
							isAnimationActive={false}
						/>
					))}
				</LineChart>
			</ChartContainer>
			<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
				{companies.map((c) => (
					<span key={c.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: c.color }} />
						{c.name}
					</span>
				))}
			</div>
		</div>
	);
}
