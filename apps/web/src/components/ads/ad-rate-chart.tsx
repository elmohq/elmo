import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@workspace/ui/components/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AD_ATTRIBUTION_META, AttributionLegend, formatDay, InfoTitle } from "@/components/ads/shared";
import type { AdAttribution, AdsData } from "@/components/ads/types";

const AXIS_STEPS = [0.5, 1, 2, 2.5, 5, 10, 25];

/** Bottom band first so the long tail sits under the two series that matter. */
const BANDS: AdAttribution[] = ["other", "competitor", "brand"];

const CONFIG: ChartConfig = Object.fromEntries(
	BANDS.map((key) => [key, { label: AD_ATTRIBUTION_META[key].label, color: AD_ATTRIBUTION_META[key].color }]),
);

/**
 * Ad rate over time, stacked by who bought the ad.
 *
 * Deliberately not fixed to a 0–100 axis the way the citation-share charts are:
 * ad rate lives in the single digits, and a percent axis that runs to 100 would
 * flatten the entire series into the baseline.
 */
export function AdRateChart({ data }: { data: AdsData["timeSeries"] }) {
	const peak = data.reduce((max, point) => Math.max(max, point.adRate), 0);
	// Four even steps off a nice-number ladder, so no tick is ever 11.25%.
	// Recharts' own picker divides an arbitrary ceiling and lands on stops like that.
	const step = AXIS_STEPS.find((candidate) => candidate * 4 >= peak * 1.1) ?? AXIS_STEPS.at(-1) ?? 25;
	const ticks = [0, 1, 2, 3, 4].map((index) => step * index);
	const ceiling = step * 4;
	const present = BANDS.filter((band) => data.some((point) => point[band] > 0));

	return (
		<Card className="gap-4">
			<CardHeader className="gap-1">
				<CardTitle className="text-sm font-medium">
					<InfoTitle tooltip="Share of each day's answers that carried an ad, split by who bought it. Smoothing is not applied — ad serving rotates hard day to day, and averaging it away hides exactly the volatility worth seeing.">
						Ad Rate Over Time
					</InfoTitle>
				</CardTitle>
				<CardDescription>How often an ad appeared alongside answers to your prompts</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<ChartContainer config={CONFIG} className="aspect-auto h-[200px] w-full">
					<AreaChart data={data} margin={{ top: 10, right: 10, left: -4, bottom: 0 }}>
						<CartesianGrid vertical={false} strokeDasharray="3 3" />
						<XAxis
							dataKey="date"
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							minTickGap={48}
							tick={{ fontSize: 11 }}
							tickFormatter={(value) => formatDay(String(value))}
						/>
						<YAxis
							tickLine={false}
							axisLine={false}
							tickMargin={8}
							domain={[0, ceiling]}
							ticks={ticks}
							tick={{ fontSize: 11 }}
							tickFormatter={(value) => `${value}%`}
						/>
						<ChartTooltip
							isAnimationActive={false}
							content={({ active, payload, label }) => {
								if (!active || !payload?.length) return null;
								const point = payload[0]?.payload as AdsData["timeSeries"][number] | undefined;
								if (!point) return null;
								const rows = [...present].reverse().filter((band) => point[band] > 0);
								return (
									<div className="grid min-w-[11rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
										<div className="font-medium">{formatDay(String(label))}</div>
										<div className="grid gap-1">
											{rows.length === 0 && <span className="text-muted-foreground">No ads</span>}
											{rows.map((band) => (
												<div key={band} className="flex items-center gap-2">
													<span
														className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
														style={{ backgroundColor: AD_ATTRIBUTION_META[band].color }}
													/>
													<span className="text-muted-foreground">{AD_ATTRIBUTION_META[band].label}</span>
													<span className="ml-auto font-mono tabular-nums">{point[band]}%</span>
												</div>
											))}
										</div>
										<div className="mt-0.5 flex items-center gap-2 border-t border-border/50 pt-1">
											<span className="text-muted-foreground">Ad rate</span>
											<span className="ml-auto font-mono tabular-nums">{point.adRate}%</span>
										</div>
									</div>
								);
							}}
						/>
						{present.map((band) => (
							<Area
								key={band}
								dataKey={band}
								type="monotone"
								stackId="rate"
								stroke={`var(--color-${band})`}
								fill={`var(--color-${band})`}
								fillOpacity={0.75}
								strokeWidth={0}
							/>
						))}
					</AreaChart>
				</ChartContainer>
				<AttributionLegend only={[...present].reverse()} />
			</CardContent>
		</Card>
	);
}
