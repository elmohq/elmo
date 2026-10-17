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

const OTHERS_KEY = "others";
/** Neutral and theme-aware, so it reads as "the rest" beside any palette, white-label ones included. */
const OTHERS_STROKE = "var(--muted-foreground)";

/** A short dashed stroke, so the legend and tooltip show the Others line as it's drawn. */
function DashedSwatch() {
	return (
		<svg aria-hidden="true" width="12" height="4" className="shrink-0">
			<line x1="0" y1="2" x2="12" y2="2" stroke={OTHERS_STROKE} strokeWidth="2" strokeDasharray="3 2" />
		</svg>
	);
}

export function CompanyTrendChart({
	dates,
	companies,
	others,
	format,
	lowerIsBetter = false,
	height = 260,
}: {
	dates: string[];
	companies: CompanyTrend[];
	/**
	 * For shares of a whole: what everyone not charted holds, one value per entry of `dates`, drawn as
	 * a dashed "Others" line after the companies. Leave out where the values don't add up to a whole.
	 */
	others?: (number | null)[] | null;
	format: (value: number) => string;
	/** Flips the axis so an improving line still rises. */
	lowerIsBetter?: boolean;
	/** "fill" stretches to the parent's height, which must be bounded. */
	height?: number | "fill";
}) {
	const fill = height === "fill";
	const config: ChartConfig = {
		...Object.fromEntries(companies.map((c, i) => [keyOf(i), { label: c.name, color: c.color }])),
		...(others ? { [OTHERS_KEY]: { label: "Others", color: OTHERS_STROKE } } : {}),
	};
	const data = dates.map((date, d) => ({
		date,
		...Object.fromEntries(companies.map((c, i) => [keyOf(i), c.values[d]])),
		...(others ? { [OTHERS_KEY]: others[d] ?? null } : {}),
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
										{name === OTHERS_KEY ? (
											<DashedSwatch />
										) : (
											<span
												className="size-2.5 shrink-0 rounded-[2px]"
												style={{ backgroundColor: config[name as string]?.color }}
											/>
										)}
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
					{/* Drawn last so it closes the tooltip, after every named company. */}
					{others && (
						<Line
							dataKey={OTHERS_KEY}
							type="bump"
							stroke={OTHERS_STROKE}
							strokeWidth={1.5}
							strokeDasharray="5 4"
							dot={false}
							activeDot={{ r: 3, fill: OTHERS_STROKE, strokeWidth: 0 }}
							connectNulls
							isAnimationActive={false}
						/>
					)}
				</LineChart>
			</ChartContainer>
			<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
				{companies.map((c) => (
					<span key={c.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: c.color }} />
						{c.name}
					</span>
				))}
				{others && (
					<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<DashedSwatch />
						Others
					</span>
				)}
			</div>
		</div>
	);
}
