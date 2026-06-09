/**
 * Experimental "Citation landscape" insights for the Citations page.
 *
 * Five AEO-actionable cuts over the brand's citations:
 *   1. Scoreboard      — share of citations, you vs. competitors, per model
 *   2. Source-type mix — what *kind* of pages LLMs cite for your prompts
 *   3. Kingmakers      — third-party domains to get placed on, by prompt reach
 *   4. Winnability     — which prompts look easiest/highest-value to break into
 *   5. DR quadrants    — DR × citation-frequency (quick wins vs strategic)
 *
 * CitationInsightsView is presentational (storyable); CitationInsights is the
 * connected wrapper used by the page.
 */
import { useState } from "react";
import { IconExternalLink } from "@tabler/icons-react";
import { CartesianGrid, Cell, Scatter, ScatterChart, XAxis, YAxis, ZAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@workspace/ui/components/chart";
import type {
	CandidateCompetitor,
	DomainKind,
	DrQuadrants,
	EntityShare,
	Kingmaker,
	PromptDistribution,
	PromptDomainDot,
	PromptWinnability,
	Scoreboard,
	ScoreboardModel,
	SourceTypeDrSummary,
} from "@workspace/lib/citation-landscape";
import type { SourceTypeSummary } from "@workspace/lib/source-type";
import {
	CitedDomainsTable,
	CitedUrlsTable,
	type DomainTableRow,
	type UrlTableRow,
} from "@/components/citation-tables";
import { useCitationInsights } from "@/hooks/use-citation-insights";

export interface CitationInsightsData {
	pending: number;
	totalDomains: number;
	drQuadrants: DrQuadrants;
	sourceTypes: SourceTypeSummary[];
	kingmakers: (Kingmaker & { examples: string[] })[];
	winnability: PromptWinnability[];
	scoreboard: Scoreboard;
	domainTable: DomainTableRow[];
	urlTable: UrlTableRow[];
	drBySourceType: SourceTypeDrSummary[];
	promptDistributions: PromptDistribution[];
	brandRating: number | null;
	brandedShare: {
		branded: { brand: number; total: number; share: number };
		unbranded: { brand: number; total: number; share: number };
	};
	untrackedCompetitors: CandidateCompetitor[];
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const dr = (r: number | null) => (r === null ? "—" : Math.round(r).toString());

const KIND_COLOR: Record<DomainKind, string> = { own: "#10b981", competitor: "#ef4444", third_party: "#9ca3af" };
const KIND_LABEL: Record<DomainKind, string> = { own: "You", competitor: "Competitor", third_party: "Third party" };
const emptyChartConfig: ChartConfig = {};

function Bar({ value, className }: { value: number; className?: string }) {
	return (
		<div className="h-2 w-full rounded-full bg-muted overflow-hidden">
			<div className={`h-full ${className ?? "bg-primary"}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
		</div>
	);
}

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

function ScoreboardBlock({ model }: { model: ScoreboardModel }) {
	const top = model.entities.filter((e) => e.kind === "brand" || e.citations > 0).slice(0, 6);
	return (
		<div>
			<div className="flex items-baseline justify-between mb-2">
				<span className="font-medium text-sm">{model.model === "all" ? "All models" : model.model}</span>
				<span className="text-muted-foreground text-xs font-mono tabular-nums">{model.total.toLocaleString()} citations</span>
			</div>
			<div className="space-y-1.5">
				{top.map((e: EntityShare) => (
					<div key={e.name} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-sm">
						<span className={`truncate ${e.kind === "brand" ? "font-semibold" : ""}`}>{e.name}</span>
						<Bar value={e.share} className={e.kind === "brand" ? "bg-emerald-500" : "bg-muted-foreground/50"} />
						<span className="text-right font-mono tabular-nums text-xs text-muted-foreground">{pct(e.share)}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function DrHistogram({ histogram, brandRating }: { histogram: number[]; brandRating: number | null }) {
	const max = Math.max(1, ...histogram);
	return (
		<div className="relative h-12 flex items-end gap-0.5">
			{histogram.map((c, i) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed 10 DR deciles
					key={i}
					className="flex-1 rounded-sm bg-primary/70"
					style={{ height: `${(c / max) * 100}%` }}
					title={`DR ${i * 10}–${i * 10 + 10}: ${c}`}
				/>
			))}
			{brandRating !== null && (
				<div
					className="absolute top-0 bottom-0 w-px bg-foreground"
					style={{ left: `${Math.min(100, Math.max(0, brandRating))}%` }}
					title={`Your DR: ${Math.round(brandRating)}`}
				/>
			)}
		</div>
	);
}

function DrBySourceTypeBlock({ summaries, brandRating }: { summaries: SourceTypeDrSummary[]; brandRating: number | null }) {
	const rows = summaries.filter((s) => s.domains >= 3).slice(0, 7);
	return (
		<Section
			title="Authority bar by source type"
			description="DR distribution of the domains cited in each source type — how much authority it takes to compete there. Listicles skewing low means you can crack them with content, not links."
		>
			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm py-2">Not enough rated domains yet.</p>
			) : (
				<div className="space-y-3">
					<div className="grid grid-cols-[10rem_1fr] gap-3">
						<span />
						<div className="flex justify-between text-muted-foreground text-[10px] font-mono">
							<span>DR 0</span>
							<span>50</span>
							<span>100</span>
						</div>
					</div>
					{rows.map((s) => (
						<div key={s.type} className="grid grid-cols-[10rem_1fr] gap-3 items-center">
							<div>
								<div className={`text-sm ${s.type === "comparison" ? "font-semibold" : ""}`}>{s.label}</div>
								<div className="text-muted-foreground text-xs font-mono tabular-nums">
									med DR {s.medianDr === null ? "—" : Math.round(s.medianDr)} · {s.domains} sites
								</div>
							</div>
							<DrHistogram histogram={s.histogram} brandRating={brandRating} />
						</div>
					))}
					{brandRating !== null && (
						<p className="text-muted-foreground text-xs">Vertical line = your DR ({Math.round(brandRating)}).</p>
					)}
				</div>
			)}
		</Section>
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

/** Feasibility tier for a kingmaker target: how you'd actually get cited there. */
function kingmakerTier(k: { rating: number | null; reach: number; brandAbsentReach: number }): {
	label: string;
	className: string;
} {
	if (k.reach > 0 && k.brandAbsentReach / k.reach < 0.34) {
		return { label: "Already in", className: "text-muted-foreground border-muted-foreground/30" };
	}
	if (k.rating !== null && k.rating >= 70) return { label: "PR / earned", className: "text-blue-700 border-blue-300" };
	if (k.rating !== null && k.rating < 40) return { label: "Quick — list", className: "text-emerald-700 border-emerald-300" };
	return { label: "Outreach", className: "text-amber-700 border-amber-300" };
}

export function CitationInsightsView({
	data,
	isError,
}: {
	data?: CitationInsightsData;
	isError?: boolean;
}) {
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

	const { pending, sourceTypes, kingmakers, winnability, scoreboard, domainTable, urlTable, drBySourceType, promptDistributions, brandRating, brandedShare, untrackedCompetitors } = data;
	const trackedModels = scoreboard.byModel.map((m) => m.model);

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-2">
				<h2 className="font-semibold text-lg">Citation landscape</h2>
				<Badge variant="outline">Experimental</Badge>
				{pending > 0 && (
					<span className="text-muted-foreground text-xs">· domain ratings still loading ({pending} left)</span>
				)}
			</div>

			{/* 1. Scoreboard */}
			<Section
				title="Share of citations — you vs. competitors"
				description="Your slice of all citations across your tracked prompts, split by model. The core AEO scoreboard."
			>
				<div className="grid gap-6 sm:grid-cols-2">
					<ScoreboardBlock model={scoreboard.overall} />
					{scoreboard.byModel.map((m) => (
						<ScoreboardBlock key={m.model} model={m} />
					))}
				</div>

				<div className="mt-4 pt-3 border-t grid gap-4 sm:grid-cols-2">
					<div>
						<div className="text-muted-foreground text-xs mb-1">Your share by query type</div>
						<div className="space-y-1.5">
							{([
								["Branded", brandedShare.branded],
								["Unbranded", brandedShare.unbranded],
							] as const).map(([label, b]) => (
								<div key={label} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-sm">
									<span>{label}</span>
									<Bar value={b.share} className="bg-emerald-500" />
									<span className="text-right font-mono tabular-nums text-xs text-muted-foreground">
										{b.total > 0 ? pct(b.share) : "—"}
									</span>
								</div>
							))}
						</div>
					</div>
					<div className="text-xs text-muted-foreground">
						<div className="mb-1">Engines measured: {trackedModels.length ? trackedModels.join(", ") : "—"}</div>
						{trackedModels.length <= 1 && (
							<p className="text-amber-700">
								You're measuring only {trackedModels.length || "no"} engine{trackedModels.length === 1 ? "" : "s"} — you
								may be blind to citations on others (e.g. Google AI Mode, Perplexity).
							</p>
						)}
					</div>
				</div>
			</Section>

			{/* 2. Source-type mix */}
			<Section
				title="What kind of sources get cited"
				description="The format mix LLMs pull from for your prompts — comparison/best-of pages, communities, review sites, etc. Tells you what content to create or get into."
			>
				{sourceTypes.length === 0 ? (
					<p className="text-muted-foreground text-sm py-2">No citations in range.</p>
				) : (
					<div className="space-y-2">
						{sourceTypes.map((s) => (
							<div key={s.type} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
								<span className="truncate">{s.label}</span>
								<Bar value={s.share} />
								<span className="text-right font-mono tabular-nums text-xs text-muted-foreground whitespace-nowrap">
									{pct(s.share)} · {s.count.toLocaleString()}
								</span>
							</div>
						))}
						<p className="text-muted-foreground text-xs pt-1">
							e.g. {sourceTypes[0].examples.slice(0, 3).join(", ")}
						</p>
					</div>
				)}
			</Section>

			{/* 3. Kingmakers */}
			<Section
				title="Third-party domains to get placed on"
				description="Domains cited across the most of your prompts where you're often absent — your highest-leverage placement / PR targets. Sorted by reach."
			>
				{kingmakers.length === 0 ? (
					<p className="text-muted-foreground text-sm py-2">No third-party domains found.</p>
				) : (
					<div className="space-y-2">
						<div className="grid grid-cols-[1fr_3.5rem_3rem_4rem_6.5rem] gap-2 text-xs text-muted-foreground font-medium">
							<span>Domain</span>
							<span className="text-right">Prompts</span>
							<span className="text-right">DR</span>
							<span className="text-right">Absent</span>
							<span className="text-right">Play</span>
						</div>
						{kingmakers.slice(0, 12).map((k) => {
							const tier = kingmakerTier(k);
							return (
								<div key={k.domain} className="grid grid-cols-[1fr_3.5rem_3rem_4rem_6.5rem] items-center gap-2 text-sm">
									<a
										href={`https://${k.domain}`}
										target="_blank"
										rel="noopener noreferrer"
										className="truncate hover:underline inline-flex items-center gap-1"
										title={k.examples[0] ?? undefined}
									>
										{k.domain}
										<IconExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
									</a>
									<span className="text-right font-mono tabular-nums">{k.reach}</span>
									<span className="text-right font-mono tabular-nums text-muted-foreground">{dr(k.rating)}</span>
									<span className="text-right font-mono tabular-nums text-amber-700">{k.brandAbsentReach}</span>
									<span className="flex justify-end">
										<Badge variant="outline" className={`text-[10px] ${tier.className}`}>
											{tier.label}
										</Badge>
									</span>
								</div>
							);
						})}
					</div>
				)}
			</Section>

			{/* Possible untracked competitors */}
			<Section
				title="Possible untracked competitors"
				description="Top brand-like domains in “Other” getting cited that you don't track as competitors — candidates to add and watch."
			>
				{untrackedCompetitors.length === 0 ? (
					<p className="text-muted-foreground text-sm py-2">No untracked brand-like domains found.</p>
				) : (
					<ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
						{untrackedCompetitors.map((c) => (
							<li key={c.domain} className="flex items-center justify-between gap-2 text-sm">
								<a
									href={`https://${c.domain}`}
									target="_blank"
									rel="noopener noreferrer"
									className="truncate hover:underline inline-flex items-center gap-1"
								>
									{c.domain}
									<IconExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
								</a>
								<span className="shrink-0 font-mono tabular-nums text-xs text-muted-foreground">
									{c.citations.toLocaleString()} cites
								</span>
							</li>
						))}
					</ul>
				)}
			</Section>

			{/* 4. Winnability */}
			<Section
				title="Most winnable prompts"
				description="Prompts where citations are diffuse and shift run-to-run (the model is undecided) and you're not yet cited — the easiest, highest-value openings."
			>
				{winnability.length === 0 ? (
					<p className="text-muted-foreground text-sm py-2">No cited prompts in range.</p>
				) : (
					<div className="space-y-2">
						<div className="grid grid-cols-[1fr_5rem_5rem_4rem] gap-2 text-xs text-muted-foreground font-medium">
							<span>Prompt</span>
							<span className="text-right">Opportunity</span>
							<span className="text-right">Volatility</span>
							<span className="text-right">You</span>
						</div>
						{winnability.slice(0, 12).map((w) => (
							<div key={w.promptId} className="grid grid-cols-[1fr_5rem_5rem_4rem] items-center gap-2 text-sm">
								<span className="truncate" title={w.value}>
									{w.value}
								</span>
								<div className="flex items-center gap-1">
									<Bar value={w.opportunity} />
								</div>
								<span className="text-right font-mono tabular-nums text-muted-foreground">
									{w.volatility === null ? "—" : pct(w.volatility)}
								</span>
								<span className="text-right">
									{w.brandCited ? (
										<Badge variant="outline" className="text-emerald-700 border-emerald-300">
											cited
										</Badge>
									) : (
										<span className="text-muted-foreground text-xs">absent</span>
									)}
								</span>
							</div>
						))}
					</div>
				)}
			</Section>

			{/* Cited domains table (DR + volatility as sortable columns) */}
			<Section
				title="Cited domains"
				description="Every cited domain with its category, DR, and citation volatility (CV across prompt-runs). Sort any column, search, or filter by category."
			>
				<CitedDomainsTable rows={domainTable} />
			</Section>

			{/* Cited URLs table */}
			<Section
				title="Cited URLs"
				description="Every cited page. Sort, search, or filter by category."
			>
				<CitedUrlsTable rows={urlTable} />
			</Section>

			{/* 7. Authority bar by source type */}
			<DrBySourceTypeBlock summaries={drBySourceType} brandRating={brandRating} />

			{/* 8. Per-prompt citation map */}
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
