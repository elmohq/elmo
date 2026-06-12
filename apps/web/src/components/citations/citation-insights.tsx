/**
 * "Citation landscape" insights for the Citations page.
 *
 *   - Cited domains / Cited URLs — sortable, searchable, category-filterable
 *     data tables (domains table folds in DR + run-based volatility).
 *   - Competitor page opportunities — per-prompt bubble graph of demand vs. your
 *     citation share, to find pages to publish/replicate.
 *   - Per-prompt citation map — per-prompt domain scatter (DR × citations, sized
 *     by pages) + authority-/content-driven prompt rankings.
 *
 * CitationInsightsView is presentational (storyable); CitationInsights is the
 * connected wrapper used by the page. (The server still returns some additional
 * aggregates that are no longer rendered; they can be trimmed in a follow-up.)
 */
import { useState } from "react";
import { CartesianGrid, Cell, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@workspace/ui/components/chart";
import type { DomainKind, PromptDistribution, PromptDomainDot } from "@workspace/lib/citation-landscape";
import {
	CitedDomainsTable,
	CitedUrlsTable,
	type DomainTableRow,
	type UrlTableRow,
} from "@/components/citations/citation-tables";
import { useCitationInsights } from "@/hooks/use-citation-insights";

export interface CitationInsightsData {
	pending: number;
	domainTable: DomainTableRow[];
	urlTable: UrlTableRow[];
	promptDistributions: PromptDistribution[];
}

const KIND_COLOR: Record<DomainKind, string> = { own: "#10b981", competitor: "#ef4444", third_party: "#9ca3af" };
const KIND_LABEL: Record<DomainKind, string> = { own: "You", competitor: "Competitor", third_party: "Third party" };
const emptyChartConfig: ChartConfig = {};

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}

function PromptDrRankList({ title, hint, items }: { title: string; hint: string; items: PromptDistribution[] }) {
	return (
		<div>
			<div className="font-medium text-sm">{title}</div>
			<p className="text-muted-foreground text-xs mb-2">{hint}</p>
			<ul className="space-y-1 text-sm">
				{items.map((p) => (
					<li key={p.promptId} className="flex items-center justify-between gap-2">
						<span className="truncate" title={p.value}>
							{p.value}
						</span>
						<span className="shrink-0 font-mono tabular-nums text-xs text-muted-foreground">
							ρ {(p.drSpearman ?? 0).toFixed(2)} · {p.ratedDomains}d
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function CompetitorPageOpportunities({ prompts }: { prompts: PromptDistribution[] }) {
	const points = prompts
		.map((p) => {
			let yours = 0;
			let competitor = 0;
			for (const d of p.dots) {
				if (d.kind === "own") yours += d.citations;
				else if (d.kind === "competitor") competitor += d.citations;
			}
			const total = p.totalCitations;
			return {
				promptId: p.promptId,
				value: p.value,
				total,
				competitor,
				yourShare: total > 0 ? (yours / total) * 100 : 0,
				absent: yours === 0,
				size: total,
			};
		})
		.filter((p) => p.total >= 3);
	const useLog = points.some((p) => p.total > 1);

	return (
		<Section
			title="Competitor page opportunities"
			description="Each dot is a prompt: x = your citation share, y = total citations (demand), dot size = volume. Top-left (high demand, low your-share) = pages worth publishing or replicating to compete. Red = you're not cited at all."
		>
			{points.length === 0 ? (
				<p className="text-muted-foreground text-sm py-2">No cited prompts in range.</p>
			) : (
				<ChartContainer config={emptyChartConfig} className="aspect-auto h-[300px] w-full">
					<ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 16 }}>
						<CartesianGrid strokeDasharray="3 3" />
						<XAxis
							type="number"
							dataKey="yourShare"
							name="Your share"
							domain={[0, 100]}
							tickCount={6}
							tickLine={false}
							axisLine={false}
							tick={{ fontSize: 11 }}
							tickFormatter={(v) => `${v}%`}
							label={{ value: "Your citation share", position: "insideBottom", offset: -8, fontSize: 11 }}
						/>
						<YAxis
							type="number"
							dataKey="total"
							name="Citations"
							scale={useLog ? "log" : "linear"}
							domain={useLog ? [1, "auto"] : [0, "auto"]}
							allowDataOverflow
							tickLine={false}
							axisLine={false}
							width={44}
							tick={{ fontSize: 11 }}
							label={{ value: "Total citations", angle: -90, position: "insideLeft", fontSize: 11 }}
						/>
						<ZAxis type="number" dataKey="size" range={[30, 500]} name="Citations" />
						<ChartTooltip
							isAnimationActive={false}
							cursor={{ strokeDasharray: "3 3" }}
							content={({ active, payload }) => {
								if (!active || !payload?.length) return null;
								const p = payload[0]?.payload as (typeof points)[number];
								if (!p) return null;
								return (
									<div className="border-border/50 bg-background grid min-w-[12rem] gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
										<div className="font-medium">{p.value}</div>
										<div className="flex items-center justify-between gap-3 text-muted-foreground">
											<span>Total citations</span>
											<span className="font-mono tabular-nums">{p.total.toLocaleString()}</span>
										</div>
										<div className="flex items-center justify-between gap-3 text-muted-foreground">
											<span>Your share</span>
											<span className="font-mono tabular-nums">{Math.round(p.yourShare)}%</span>
										</div>
										<div className="flex items-center justify-between gap-3 text-muted-foreground">
											<span>Competitor citations</span>
											<span className="font-mono tabular-nums">{p.competitor.toLocaleString()}</span>
										</div>
									</div>
								);
							}}
						/>
						<Scatter data={points} isAnimationActive={false}>
							{points.map((p) => (
								<Cell key={p.promptId} fill={p.absent ? "#ef4444" : "#10b981"} fillOpacity={0.6} />
							))}
						</Scatter>
					</ScatterChart>
				</ChartContainer>
			)}
		</Section>
	);
}

function PromptDomainMap({ prompts }: { prompts: PromptDistribution[] }) {
	const [selectedId, setSelectedId] = useState(prompts[0]?.promptId ?? "");
	const selected = prompts.find((p) => p.promptId === selectedId) ?? prompts[0];
	const ranked = prompts.filter((p) => p.drSpearman !== null);
	const authorityDriven = [...ranked].sort((a, b) => (b.drSpearman ?? 0) - (a.drSpearman ?? 0)).slice(0, 6);
	const contentDriven = [...ranked].sort((a, b) => (a.drSpearman ?? 0) - (b.drSpearman ?? 0)).slice(0, 6);

	if (!selected) {
		return (
			<Section title="Per-prompt citation map" description="For a prompt: who's cited, their authority, and how entrenched they are.">
				<p className="text-muted-foreground text-sm py-2">No prompts with citations.</p>
			</Section>
		);
	}

	const rated = selected.dots.filter((d): d is PromptDomainDot & { rating: number } => d.rating !== null);
	const unrated = selected.dots.length - rated.length;
	const useLog = rated.some((d) => d.citations > 1);

	return (
		<Section
			title="Per-prompt citation map"
			description="For one prompt: every cited domain by authority (DR) and citations, sized by how many of its pages are referenced. Big high-DR dots = entrenched; small low-DR dots = beatable."
		>
			<div className="space-y-3">
				<select
					value={selected.promptId}
					onChange={(e) => setSelectedId(e.target.value)}
					className="w-full max-w-xl rounded-md border bg-background px-2 py-1.5 text-sm"
				>
					{prompts.map((p) => (
						<option key={p.promptId} value={p.promptId}>
							{p.value} ({p.totalCitations.toLocaleString()} citations)
						</option>
					))}
				</select>

				<p className="text-muted-foreground text-xs">
					DR ↔ citations for this prompt:{" "}
					{selected.drSpearman === null
						? "not enough rated domains"
						: `ρ ${selected.drSpearman.toFixed(2)} (${selected.ratedDomains} rated domains)`}
				</p>

				{rated.length === 0 ? (
					<p className="text-muted-foreground text-sm py-2">No rated domains for this prompt yet.</p>
				) : (
					<ChartContainer config={emptyChartConfig} className="aspect-auto h-[280px] w-full">
						<ScatterChart margin={{ top: 10, right: 16, left: 0, bottom: 16 }}>
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
								dataKey="citations"
								name="Citations"
								scale={useLog ? "log" : "linear"}
								domain={useLog ? [1, "auto"] : [0, "auto"]}
								allowDataOverflow
								tickLine={false}
								axisLine={false}
								width={40}
								tick={{ fontSize: 11 }}
								label={{ value: "Citations", angle: -90, position: "insideLeft", fontSize: 11 }}
							/>
							<ZAxis type="number" dataKey="pages" range={[50, 600]} name="Pages" />
							<ChartTooltip
								isAnimationActive={false}
								cursor={{ strokeDasharray: "3 3" }}
								content={({ active, payload }) => {
									if (!active || !payload?.length) return null;
									const p = payload[0]?.payload as PromptDomainDot;
									if (!p) return null;
									return (
										<div className="border-border/50 bg-background grid min-w-[11rem] gap-1 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl">
											<div className="font-medium">{p.domain}</div>
											<div className="flex items-center justify-between gap-3 text-muted-foreground">
												<span>Domain Rating</span>
												<span className="font-mono tabular-nums">{p.rating === null ? "—" : Math.round(p.rating)}</span>
											</div>
											<div className="flex items-center justify-between gap-3 text-muted-foreground">
												<span>Citations</span>
												<span className="font-mono tabular-nums">{p.citations.toLocaleString()}</span>
											</div>
											<div className="flex items-center justify-between gap-3 text-muted-foreground">
												<span>Pages referenced</span>
												<span className="font-mono tabular-nums">{p.pages.toLocaleString()}</span>
											</div>
										</div>
									);
								}}
							/>
							<Scatter data={rated} isAnimationActive={false}>
								{rated.map((d) => (
									<Cell key={d.domain} fill={KIND_COLOR[d.kind]} fillOpacity={0.65} />
								))}
							</Scatter>
						</ScatterChart>
					</ChartContainer>
				)}

				<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
					{(Object.keys(KIND_LABEL) as DomainKind[]).map((k) => (
						<div key={k} className="flex items-center gap-1.5">
							<span className="shrink-0 rounded-full h-2.5 w-2.5" style={{ backgroundColor: KIND_COLOR[k] }} />
							{KIND_LABEL[k]}
						</div>
					))}
					<span>· dot size = pages referenced</span>
					{unrated > 0 && <span>· {unrated} unrated domain{unrated === 1 ? "" : "s"} hidden</span>}
				</div>

				{ranked.length > 0 && (
					<div className="grid gap-6 sm:grid-cols-2 pt-2 border-t">
						<PromptDrRankList
							title="Most authority-driven prompts"
							hint="DR strongly predicts who's cited — hard to break in without authority."
							items={authorityDriven}
						/>
						<PromptDrRankList
							title="Most content-driven prompts"
							hint="DR barely predicts citations — winnable with better content."
							items={contentDriven}
						/>
					</div>
				)}
			</div>
		</Section>
	);
}

export function CitationInsightsView({ data, isError }: { data?: CitationInsightsData; isError?: boolean }) {
	if (isError) {
		return (
			<Section title="Citation landscape" description="Experimental AEO insights.">
				<div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">Failed to load citation insights.</div>
			</Section>
		);
	}
	if (!data) {
		return (
			<Section title="Citation landscape" description="Experimental AEO insights.">
				<div className="space-y-3">
					<Skeleton className="h-4 w-2/3" />
					<Skeleton className="h-24 w-full" />
				</div>
			</Section>
		);
	}

	const { pending, domainTable, urlTable, promptDistributions } = data;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<h2 className="font-semibold text-lg">Citation landscape</h2>
				<Badge variant="outline">Experimental</Badge>
				{pending > 0 && (
					<span className="text-muted-foreground text-xs">· domain ratings still loading ({pending} left)</span>
				)}
			</div>

			<Section
				title="Cited domains"
				description="Every cited domain with its category, DR, and citation volatility (CV across prompt-runs). Sort any column, search, or filter by category."
			>
				<CitedDomainsTable rows={domainTable} />
			</Section>

			<Section title="Cited URLs" description="Every cited page. Sort, search, or filter by category.">
				<CitedUrlsTable rows={urlTable} />
			</Section>

			<CompetitorPageOpportunities prompts={promptDistributions} />

			<PromptDomainMap prompts={promptDistributions} />
		</div>
	);
}

export function CitationInsights({
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
	const { data, isError } = useCitationInsights(brandId, { days, tags, model });
	return <CitationInsightsView data={data} isError={!!isError} />;
}
