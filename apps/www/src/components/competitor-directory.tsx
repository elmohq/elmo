import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { Check, X } from "lucide-react";
import {
	sortedCompetitors,
	FEATURE_CATEGORIES,
	ELMO_FEATURES,
	CATEGORY_LABELS,
	getFeatureLabel,
	getComparisonSlug,
	getPopularityGrade,
	type Competitor,
	type CompetitorCategory,
	type FeatureKey,
} from "@/lib/competitors";

function FeatureIcon({ has }: { has: boolean }) {
	return has ? (
		<Check className="text-primary mx-auto h-4 w-4" />
	) : (
		<X className="text-muted-foreground/30 mx-auto h-4 w-4" />
	);
}

const visibleCompetitors = sortedCompetitors.filter(
	(c) => c.status !== "shutting-down" && c.category !== "other",
);

export function CompetitorDirectory() {
	const [selectedCategory, setSelectedCategory] =
		useState<CompetitorCategory | "all">("all");

	const filteredCompetitors = visibleCompetitors.filter(
		(c) => selectedCategory === "all" || c.category === selectedCategory,
	);

	const categories = [
		...new Set(visibleCompetitors.map((c) => c.category)),
	];

	return (
		<>
			{/* Hero */}
			<section className="relative overflow-hidden py-16 lg:py-28">
				<div className="pointer-events-none absolute inset-0 -z-10">
					<div className="from-primary/[0.04] via-primary/[0.02] absolute inset-0 bg-gradient-to-b to-transparent" />
					<div
						className="absolute inset-0 opacity-[0.03]"
						style={{
							backgroundImage:
								"radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
							backgroundSize: "32px 32px",
						}}
					/>
				</div>
				<div className="mx-auto max-w-7xl px-4 md:px-6">
					<p className="text-primary mb-4 text-sm font-semibold uppercase tracking-widest">
						Resources
					</p>
					<h1 className="font-heading text-4xl text-balance md:text-5xl lg:text-6xl">
						AI Visibility Tool Directory
					</h1>
					<p className="text-muted-foreground mt-6 max-w-3xl text-lg text-balance md:text-xl">
						Every AI visibility and Answer Engine Optimization tool in
						one place. Compare features, pricing, and find the right
						platform for your team.
					</p>
				</div>
			</section>

			{/* Category Filters */}
			<section className="border-b pb-6">
				<div className="mx-auto max-w-7xl px-4 md:px-6">
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={() => setSelectedCategory("all")}
							className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
								selectedCategory === "all"
									? "bg-foreground text-background"
									: "bg-muted text-muted-foreground hover:bg-muted/80"
							}`}
						>
							All
						</button>
						{categories.map((cat) => (
							<button
								type="button"
								key={cat}
								onClick={() => setSelectedCategory(cat)}
								className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
									selectedCategory === cat
										? "bg-foreground text-background"
										: "bg-muted text-muted-foreground hover:bg-muted/80"
								}`}
							>
								{CATEGORY_LABELS[cat]}
							</button>
						))}
					</div>
				</div>
			</section>

			{/* Feature Matrix */}
			<section className="py-12 lg:py-16">
				<div className="mx-auto max-w-7xl px-4 md:px-6">
					<h2 className="mb-8 text-lg font-semibold">
						{filteredCompetitors.length} tools
					</h2>
					<FeatureMatrix competitors={filteredCompetitors} />
				</div>
			</section>

			{/* Elmo CTA */}
			<section className="border-t py-16 lg:py-24">
				<div className="mx-auto max-w-3xl px-4 text-center md:px-6">
					<h2 className="font-heading text-3xl md:text-4xl">
						Why teams choose Elmo
					</h2>
					<p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg text-balance">
						Open source, self-hosted, and transparent. Track AI
						visibility without vendor lock-in or inflated pricing.
					</p>
					<div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
						<Button asChild size="lg">
							<Link to="/docs">Read the Docs</Link>
						</Button>
						<Button asChild variant="outline" size="lg">
							<a
								href="https://github.com/elmohq/elmo"
								target="_blank"
								rel="noopener noreferrer"
							>
								View on GitHub
							</a>
						</Button>
					</div>
				</div>
			</section>
		</>
	);
}

function CompetitorHeader({
	competitor,
}: {
	competitor: Competitor;
}) {
	return (
		<Link
			to="/ai-visibility-tools/$slug"
			params={{ slug: getComparisonSlug(competitor) }}
			className="hover:text-foreground text-muted-foreground block text-[11px] leading-tight hover:underline"
		>
			{competitor.name}
		</Link>
	);
}

function FeatureMatrix({ competitors: items }: { competitors: Competitor[] }) {
	const stickyCell =
		"sticky left-0 z-10 bg-background shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]";

	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[800px] text-sm">
				<thead>
					<tr className="border-b">
						<th
							className={`${stickyCell} py-3 pr-4 text-left font-semibold`}
						>
							Feature
						</th>
						<th className="bg-primary/5 border-x px-2 py-3 text-center font-semibold">
							Elmo
						</th>
						{items.map((c) => (
							<th
								key={c.slug}
								className="px-2 py-3 text-center font-normal"
							>
								<CompetitorHeader competitor={c} />
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{Object.entries(FEATURE_CATEGORIES).flatMap(([catKey, cat]) => [
						<tr key={`cat-${catKey}`}>
							<td
								className={`${stickyCell} bg-muted/50! py-2 text-xs font-semibold uppercase tracking-wider`}
							>
								{cat.label}
							</td>
							<td
								colSpan={1 + items.length}
								className="bg-muted/50 px-0 py-2"
							/>
						</tr>,
						...Object.keys(cat.features).map((featureKey) => (
							<tr
								key={featureKey}
								className="border-b border-dashed last:border-solid"
							>
								<td
									className={`${stickyCell} py-2 pr-4 text-xs text-muted-foreground`}
								>
									{getFeatureLabel(featureKey as FeatureKey)}
								</td>
								<td className="bg-primary/5 border-x px-2 py-2">
									<FeatureIcon
										has={
											ELMO_FEATURES[featureKey as FeatureKey] ??
											false
										}
									/>
								</td>
								{items.map((c) => (
									<td key={c.slug} className="px-2 py-2">
										<FeatureIcon
											has={
												c.features[featureKey as FeatureKey] ??
												false
											}
										/>
									</td>
								))}
							</tr>
						)),
					])}
					<tr className="border-t-2">
						<td
							className={`${stickyCell} py-2 pr-4 text-xs font-semibold`}
						>
							Popularity
						</td>
						<td className="bg-primary/5 border-x px-2 py-2 text-center text-xs text-primary">
							♥︎
						</td>
						{items.map((c) => (
							<td
								key={c.slug}
								className="px-2 py-2 text-center text-xs tabular-nums"
							>
								{getPopularityGrade(c)}
							</td>
						))}
					</tr>
				</tbody>
			</table>
		</div>
	);
}
