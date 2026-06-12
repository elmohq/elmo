/**
 * "Citation quadrants" — a DR × citations scatter of cited domains.
 *
 * Each dot is a cited domain: x = Ahrefs Domain Rating, y = citations (log),
 * dot size = citations. Median crosshairs split it into four quadrants
 * (quick wins / strategic / untapped authority / long tail). Category toggles
 * let you focus the view (e.g. drop the social/Google giants to see the open
 * web). A plain-language authority verdict sits on top.
 *
 * DomainRatingCorrelationView is presentational (storyable); DomainRatingCorrelation
 * is the connected wrapper used by the page.
 */
import { useState } from "react";
import { CartesianGrid, Cell, ReferenceLine, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@workspace/ui/components/chart";
import {
	classifyAuthorityRegime,
	computeDrCorrelation,
	type DrCorrelationResult,
	type DrScatterPoint,
} from "@workspace/lib/dr-correlation";
import { CATEGORY_CONFIG, type CitationCategory, DOMAIN_CATEGORY_COLORS } from "@/lib/domain-categories";
import { useDomainRatings } from "@/hooks/use-domain-ratings";

export interface DomainRatingData {
	total: number;
	resolved: number;
	pending: number;
	brandRating: number | null;
	correlation: DrCorrelationResult<CitationCategory>;
}

const ALL_CATEGORIES = Object.keys(CATEGORY_CONFIG) as CitationCategory[];
const emptyChartConfig: ChartConfig = {};

function medianOf(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function SectionShell({ children }: { children: React.ReactNode }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Citation quadrants</CardTitle>
				<CardDescription>
					Every cited domain by authority (DR, 0–100) vs. how often it&apos;s cited — split into four quadrants. Dot
					size = citations. Toggle categories to focus the view.
				</CardDescription>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

function CornerLabel({
	position,
	label,
	count,
	className,
}: {
	position: string;
	label: string;
	count: number;
	className: string;
}) {
	return (
		<div className={`pointer-events-none absolute ${position} rounded bg-background/70 px-1.5 py-0.5 text-[11px] ${className}`}>
			<span className="font-medium">{label}</span> <span className="tabular-nums opacity-70">{count}</span>
		</div>
	);
}

function CitationQuadrants({
	correlation,
	brandRating,
}: {
	correlation: DrCorrelationResult<CitationCategory>;
	brandRating: number | null;
}) {
	const [enabled, setEnabled] = useState<Set<CitationCategory>>(() => new Set(ALL_CATEGORIES));
	const toggle = (c: CitationCategory) =>
		setEnabled((prev) => {
			const next = new Set(prev);
			if (next.has(c)) next.delete(c);
			else next.add(c);
			return next;
		});

	const filtered = correlation.scatter.filter((p) => enabled.has(p.category));
	const drMedian = medianOf(filtered.map((p) => p.rating));
	const countMedian = medianOf(filtered.map((p) => p.count));
	const counts = { quickWins: 0, strategic: 0, untapped: 0, longTail: 0 };
	if (drMedian !== null && countMedian !== null) {
		for (const p of filtered) {
			const hc = p.count > countMedian;
			const hd = p.rating > drMedian;
			if (hc && !hd) counts.quickWins++;
			else if (hc && hd) counts.strategic++;
			else if (!hc && hd) counts.untapped++;
			else counts.longTail++;
		}
	}
	const data = filtered.map((p) => ({ ...p, size: Math.sqrt(p.count) }));
	const useLog = filtered.some((p) => p.count > 1);

	const subset = computeDrCorrelation(filtered.map((p) => ({ domain: p.domain, count: p.count, category: p.category, rating: p.rating })));
	const verdict = classifyAuthorityRegime(correlation.spearman, brandRating, medianOf(correlation.scatter.map((p) => p.rating)));

	return (
		<div className="space-y-4">
			<div
				className={`rounded-md border p-3 text-sm ${
					verdict.regime === "authority" ? "border-blue-300 bg-blue-50/60" : "border-emerald-300 bg-emerald-50/60"
				}`}
			>
				<div className="font-semibold">{verdict.headline}</div>
				<p className="text-muted-foreground mt-0.5">{verdict.detail}</p>
			</div>

			<div className="flex flex-wrap gap-1.5">
				{ALL_CATEGORIES.map((c) => {
					const on = enabled.has(c);
					return (
						<button
							type="button"
							key={c}
							onClick={() => toggle(c)}
							className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
								on ? "bg-muted" : "opacity-40 hover:opacity-70"
							}`}
						>
							<span className="shrink-0 rounded-[2px] h-2.5 w-2.5" style={{ backgroundColor: DOMAIN_CATEGORY_COLORS[c] }} />
							{CATEGORY_CONFIG[c].label}
						</button>
					);
				})}
			</div>

			<div className="text-muted-foreground text-xs font-mono tabular-nums">
				{filtered.length.toLocaleString()} domains shown
				{subset.spearman !== null && ` · Spearman ρ ${subset.spearman.toFixed(2)}`}
			</div>

			{filtered.length < 2 || drMedian === null || countMedian === null ? (
				<p className="text-muted-foreground text-sm py-2">Select at least one category with rated domains.</p>
			) : (
				<div className="relative">
					<ChartContainer config={emptyChartConfig} className="aspect-auto h-[320px] w-full">
						<ScatterChart margin={{ top: 12, right: 16, left: 0, bottom: 16 }}>
							<CartesianGrid strokeDasharray="3 3" />
							<XAxis
								type="number"
								dataKey="rating"
								name="Domain Rating"
								domain={[0, 100]}
								tickCount={6}
								tickLine={false}
								axisLine={false}
								tick={{ fontSize: 11 }}
								label={{ value: "Domain Rating (DR)", position: "insideBottom", offset: -8, fontSize: 11 }}
							/>
							<YAxis
								type="number"
								dataKey="count"
								name="Citations"
								scale={useLog ? "log" : "linear"}
								domain={useLog ? [1, "auto"] : [0, "auto"]}
								allowDataOverflow
								tickLine={false}
								axisLine={false}
								width={44}
								tick={{ fontSize: 11 }}
								label={{ value: "Citations", angle: -90, position: "insideLeft", fontSize: 11 }}
							/>
							<ZAxis type="number" dataKey="size" range={[20, 500]} name="Citations" />
							<ReferenceLine x={drMedian} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
							<ReferenceLine y={countMedian} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
							<ChartTooltip
								isAnimationActive={false}
								cursor={{ strokeDasharray: "3 3" }}
								content={({ active, payload }) => {
									if (!active || !payload?.length) return null;
									const p = payload[0]?.payload as DrScatterPoint<CitationCategory>;
									if (!p) return null;
									return (
										<div className="border-border/50 bg-background grid min-w-[10rem] gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
											<div className="font-medium">{p.domain}</div>
											<div className="flex items-center justify-between gap-3 text-muted-foreground">
												<span>Domain Rating</span>
												<span className="font-mono tabular-nums">{Math.round(p.rating)}</span>
											</div>
											<div className="flex items-center justify-between gap-3 text-muted-foreground">
												<span>Citations</span>
												<span className="font-mono tabular-nums">{p.count.toLocaleString()}</span>
											</div>
											<div className="text-muted-foreground">{CATEGORY_CONFIG[p.category].label}</div>
										</div>
									);
								}}
							/>
							<Scatter data={data} isAnimationActive={false}>
								{data.map((p) => (
									<Cell key={p.domain} fill={DOMAIN_CATEGORY_COLORS[p.category]} fillOpacity={0.6} />
								))}
							</Scatter>
						</ScatterChart>
					</ChartContainer>
					<CornerLabel position="top-2 left-12" label="Quick wins" count={counts.quickWins} className="text-emerald-700" />
					<CornerLabel position="top-2 right-2" label="Strategic" count={counts.strategic} className="text-blue-700" />
					<CornerLabel position="bottom-10 left-12" label="Long tail" count={counts.longTail} className="text-muted-foreground" />
					<CornerLabel position="bottom-10 right-2" label="Untapped authority" count={counts.untapped} className="text-amber-700" />
				</div>
			)}

			<p className="text-muted-foreground text-xs">
				Crosshairs at median DR {drMedian === null ? "—" : Math.round(drMedian)} and median{" "}
				{countMedian === null ? "—" : Math.round(countMedian).toLocaleString()} citations (recomputed on the selected
				categories).
			</p>
		</div>
	);
}

export function DomainRatingCorrelationView({
	data,
	isLoading,
	isError,
}: {
	data?: DomainRatingData;
	isLoading?: boolean;
	isError?: boolean;
}) {
	if (isError) {
		return (
			<SectionShell>
				<div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">Failed to load domain ratings.</div>
			</SectionShell>
		);
	}

	if (!data) {
		return (
			<SectionShell>
				<div className="space-y-3">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-[280px] w-full" />
				</div>
			</SectionShell>
		);
	}

	const { total, resolved, pending, correlation } = data;

	if (total === 0) {
		return (
			<SectionShell>
				<p className="text-muted-foreground text-sm py-2">No cited domains to rate for the selected filters.</p>
			</SectionShell>
		);
	}

	// Still warming the cache — show progress instead of a half-empty chart.
	if (pending > 0) {
		const pct = total > 0 ? Math.round((resolved / total) * 100) : 0;
		return (
			<SectionShell>
				<div className="space-y-3 py-2">
					<p className="text-muted-foreground text-sm">
						Loading domain ratings… {resolved.toLocaleString()} of {total.toLocaleString()} domains
						{isLoading ? "" : " (this fills in over a few seconds)"}.
					</p>
					<div className="h-2 w-full rounded-full bg-muted overflow-hidden">
						<div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
					</div>
				</div>
			</SectionShell>
		);
	}

	if (correlation.n < 2) {
		return (
			<SectionShell>
				<p className="text-muted-foreground text-sm py-2">
					Not enough domains have a Domain Rating yet
					{total > 0 ? ` (${resolved.toLocaleString()} of ${total.toLocaleString()} domains rated)` : ""}.
				</p>
			</SectionShell>
		);
	}

	return (
		<SectionShell>
			<CitationQuadrants correlation={correlation} brandRating={data.brandRating} />
		</SectionShell>
	);
}

export function DomainRatingCorrelation({
	brandId,
	days,
	tags,
	model,
}: {
	brandId?: string;
	days?: number;
	tags?: string[];
	model?: string;
}) {
	const { data, isLoading, isError } = useDomainRatings(brandId, { days, tags, model });
	return <DomainRatingCorrelationView data={data} isLoading={isLoading} isError={!!isError} />;
}
