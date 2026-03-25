import { Link } from "@tanstack/react-router";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Check, X, ExternalLink, ArrowLeft } from "lucide-react";
import { AlertTriangle } from "lucide-react";
import {
	FEATURE_CATEGORIES,
	ELMO_FEATURES,
	CATEGORY_LABELS,
	isLowDR,
	getPopularityGrade,
	getScreenshotUrl,
	type Competitor,
	type FeatureKey,
} from "@/lib/competitors";

function FeatureRow({
	label,
	elmo,
	competitor,
}: {
	label: string;
	elmo: boolean;
	competitor: boolean;
}) {
	const elmoWins = elmo && !competitor;
	const competitorWins = !elmo && competitor;
	return (
		<tr className="border-b border-dashed last:border-solid">
			<td className="py-3 pr-4 text-sm">{label}</td>
			<td
				className={`px-4 py-3 text-center ${elmoWins ? "bg-primary/5" : ""}`}
			>
				{elmo ? (
					<Check className="text-primary mx-auto h-4 w-4" />
				) : (
					<X className="text-muted-foreground/30 mx-auto h-4 w-4" />
				)}
			</td>
			<td
				className={`px-4 py-3 text-center ${competitorWins ? "bg-primary/5" : ""}`}
			>
				{competitor ? (
					<Check className="text-primary mx-auto h-4 w-4" />
				) : (
					<X className="text-muted-foreground/30 mx-auto h-4 w-4" />
				)}
			</td>
		</tr>
	);
}

export function CompetitorComparison({
	competitor,
}: {
	competitor: Competitor;
}) {
	const elmoOnlyFeatures: string[] = [];
	const competitorOnlyFeatures: string[] = [];
	const sharedFeatures: string[] = [];

	for (const [catKey, cat] of Object.entries(FEATURE_CATEGORIES)) {
		for (const featureKey of Object.keys(cat.features)) {
			const k = featureKey as FeatureKey;
			const elmoHas = ELMO_FEATURES[k] ?? false;
			const compHas = competitor.features[k] ?? false;
			if (elmoHas && !compHas) elmoOnlyFeatures.push(cat.features[k].label);
			if (!elmoHas && compHas)
				competitorOnlyFeatures.push(cat.features[k].label);
			if (elmoHas && compHas) sharedFeatures.push(cat.features[k].label);
		}
	}

	return (
		<>
			{/* Back link */}
			<div className="mx-auto max-w-4xl px-4 pt-8 md:px-6">
				<Link
					to="/ai-visibility-tools"
					className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
				>
					<ArrowLeft className="h-3 w-3" />
					AI Visibility Tool Directory
				</Link>
			</div>

			{/* Hero */}
			<section className="py-12 lg:py-20">
				<div className="mx-auto max-w-4xl px-4 md:px-6">
					<Badge variant="outline" className="mb-4">
						{CATEGORY_LABELS[competitor.category]}
					</Badge>
					<h1 className="font-heading text-4xl text-balance md:text-5xl">
						Elmo vs {competitor.name}
					</h1>
					<p className="text-muted-foreground mt-4 max-w-3xl text-lg text-balance">
						How Elmo's open-source AEO platform compares to{" "}
						{competitor.name} for AI visibility tracking.
					</p>
				{competitor.status === "shutting-down" && (
					<div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
						Note: {competitor.name} is shutting down.
					</div>
				)}
				{isLowDR(competitor) && (
					<div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-50/50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
						<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
						<div>
							<p className="font-medium">Limited market presence</p>
							<p className="mt-0.5 text-amber-800/80 dark:text-amber-300/70">
								{competitor.name} appears to be a very early-stage product
								with limited adoption. Information on this page may be
								incomplete, and the tool's availability or feature set could
								change.
							</p>
						</div>
					</div>
				)}
				</div>
			</section>

			{/* Quick summary */}
			<section className="border-y py-8">
				<div className="mx-auto grid max-w-4xl grid-cols-2 gap-8 px-4 md:px-6">
					<div>
						<h3 className="mb-1 text-lg font-semibold">Elmo</h3>
						<div className="mt-2 flex flex-wrap gap-2">
							<Badge variant="secondary">Open Source</Badge>
							<Badge variant="secondary">Self-Hosted</Badge>
							<Badge variant="secondary">White-Label</Badge>
						</div>
						<p className="text-muted-foreground mt-3 text-sm">
							Open-source AEO platform. Self-host for free, forever.
							Track AI visibility across ChatGPT, Claude, and Google AI
							Overviews with full transparency.
						</p>
					</div>
					<div>
						<h3 className="mb-1 text-lg font-semibold">
							{competitor.name}
						</h3>
						<div className="mt-2 flex flex-wrap gap-2">
							<Badge variant="secondary">
								{CATEGORY_LABELS[competitor.category]}
							</Badge>
							{competitor.pricing?.hasFree && (
								<Badge variant="secondary">Free Tier</Badge>
							)}
							{competitor.pricing?.startingPrice && (
								<Badge variant="secondary">
									From {competitor.pricing.startingPrice}
								</Badge>
							)}
						</div>
						<p className="text-muted-foreground mt-3 text-sm">
							{competitor.tagline}
						</p>
					</div>
				</div>
			</section>

			{/* Screenshot */}
			<section className="py-12">
				<div className="mx-auto max-w-4xl px-4 md:px-6">
					<h2 className="font-heading mb-6 text-2xl">
						{competitor.name} at a glance
					</h2>
					<div className="overflow-hidden rounded-lg border shadow-sm">
						<img
							src={getScreenshotUrl(competitor.url)}
							alt={`Screenshot of ${competitor.name} homepage`}
							className="w-full"
							loading="lazy"
						/>
					</div>
					<div className="mt-3 flex items-center gap-2">
						<a
							href={competitor.url}
							target="_blank"
							rel="noopener noreferrer nofollow"
							className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
						>
							Visit {competitor.domain}
							<ExternalLink className="h-3 w-3" />
						</a>
					</div>
				</div>
			</section>

			{/* About the competitor */}
			<section className="border-t py-12">
				<div className="mx-auto max-w-4xl px-4 md:px-6">
					<h2 className="font-heading mb-4 text-2xl">
						About {competitor.name}
					</h2>
					<p className="text-muted-foreground leading-relaxed">
						{competitor.description}
					</p>
					<p className="text-muted-foreground mt-4 text-sm">
						Popularity grade:{" "}
						<span className="text-foreground font-semibold">
							{getPopularityGrade(competitor)}
						</span>
					</p>
					{competitor.highlights && competitor.highlights.length > 0 && (
						<ul className="mt-4 space-y-2">
							{competitor.highlights.map((h) => (
								<li
									key={h}
									className="text-muted-foreground flex items-start gap-2 text-sm"
								>
									<Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
									{h}
								</li>
							))}
						</ul>
					)}
				</div>
			</section>

			{/* Feature comparison table */}
			<section className="border-t py-12">
				<div className="mx-auto max-w-4xl px-4 md:px-6">
					<h2 className="font-heading mb-8 text-2xl">
						Feature comparison
					</h2>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b">
									<th className="py-3 pr-4 text-left font-semibold">
										Feature
									</th>
									<th className="w-32 px-4 py-3 text-center font-semibold">
										Elmo
									</th>
									<th className="w-32 px-4 py-3 text-center font-semibold">
										{competitor.name}
									</th>
								</tr>
							</thead>
							<tbody>
								{Object.entries(FEATURE_CATEGORIES).flatMap(
									([catKey, cat]) => [
										<tr key={`cat-${catKey}`}>
											<td
												colSpan={3}
												className="bg-muted/50 px-0 py-2 text-xs font-semibold uppercase tracking-wider"
											>
												{cat.label}
											</td>
										</tr>,
										...Object.entries(cat.features).map(
											([featureKey, featureDef]) => (
												<FeatureRow
													key={featureKey}
													label={featureDef.label}
													elmo={
														ELMO_FEATURES[
															featureKey as FeatureKey
														] ?? false
													}
													competitor={
														competitor.features[
															featureKey as FeatureKey
														] ?? false
													}
												/>
											),
										),
									],
								)}
							</tbody>
						</table>
					</div>
				</div>
			</section>

			{/* Key Differences */}
			<section className="border-t py-12">
				<div className="mx-auto max-w-4xl px-4 md:px-6">
					<h2 className="font-heading mb-8 text-2xl">
						Key differences
					</h2>
					<div className="grid gap-6 md:grid-cols-3">
						{elmoOnlyFeatures.length > 0 && (
							<div className="bg-muted/50 rounded-lg p-5">
								<h3 className="mb-3 text-sm font-semibold uppercase tracking-wider">
									Only in Elmo
								</h3>
								<ul className="space-y-2">
									{elmoOnlyFeatures.map((f) => (
										<li
											key={f}
											className="text-muted-foreground flex items-center gap-2 text-sm"
										>
											<Check className="text-primary h-3.5 w-3.5 shrink-0" />
											{f}
										</li>
									))}
								</ul>
							</div>
						)}
						{sharedFeatures.length > 0 && (
							<div className="bg-muted/50 rounded-lg p-5">
								<h3 className="mb-3 text-sm font-semibold uppercase tracking-wider">
									Both offer
								</h3>
								<ul className="space-y-2">
									{sharedFeatures.map((f) => (
										<li
											key={f}
											className="text-muted-foreground flex items-center gap-2 text-sm"
										>
											<Check className="text-muted-foreground/60 h-3.5 w-3.5 shrink-0" />
											{f}
										</li>
									))}
								</ul>
							</div>
						)}
						{competitorOnlyFeatures.length > 0 && (
							<div className="bg-muted/50 rounded-lg p-5">
								<h3 className="mb-3 text-sm font-semibold uppercase tracking-wider">
									Only in {competitor.name}
								</h3>
								<ul className="space-y-2">
									{competitorOnlyFeatures.map((f) => (
										<li
											key={f}
											className="text-muted-foreground flex items-center gap-2 text-sm"
										>
											<Check className="text-muted-foreground/40 h-3.5 w-3.5 shrink-0" />
											{f}
										</li>
									))}
								</ul>
							</div>
						)}
					</div>
				</div>
			</section>

			{/* Why Elmo */}
			<section className="border-t py-12">
				<div className="mx-auto max-w-4xl px-4 md:px-6">
					<h2 className="font-heading mb-4 text-2xl">
						Why choose Elmo over {competitor.name}?
					</h2>
					<div className="grid gap-6 sm:grid-cols-2">
						<div className="rounded-lg border p-5">
							<h3 className="font-semibold">Open source and transparent</h3>
							<p className="text-muted-foreground mt-2 text-sm">
								Every line of code is open. You can verify exactly how
								your visibility data is collected, calculated, and
								presented. No black boxes.
							</p>
						</div>
						<div className="rounded-lg border p-5">
							<h3 className="font-semibold">Self-host for free, forever</h3>
							<p className="text-muted-foreground mt-2 text-sm">
								Run Elmo on your own infrastructure. 
								The core platform is free and always will be, even when we release a cloud version of Elmo.
							</p>
						</div>
						<div className="rounded-lg border p-5">
							<h3 className="font-semibold">No vendor lock-in</h3>
							<p className="text-muted-foreground mt-2 text-sm">
								Export everything, fork the code, or migrate at any time. 
								You own all of your data and have the right to use it wherever you want.
							</p>
						</div>
						<div className="rounded-lg border p-5">
							<h3 className="font-semibold">Built to last</h3>
							<p className="text-muted-foreground mt-2 text-sm">
								Bootstrapped and sustainable. No investors pushing
								towards dark patterns. We'll outlast the companies taking
								too much VC money.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* CTA */}
			<section className="border-t py-16 lg:py-24">
				<div className="mx-auto max-w-3xl px-4 text-center md:px-6">
					<h2 className="font-heading text-3xl md:text-4xl">
						Ready to track your AI visibility?
					</h2>
					<p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg text-balance">
						Deploy Elmo in minutes and start monitoring how ChatGPT,
						Claude, and Google AI Overviews talk about your brand.
					</p>
					<div className="mt-8 flex flex-wrap justify-center gap-3">
						<Button asChild size="lg">
							<Link to="/docs">Deploy Elmo</Link>
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
