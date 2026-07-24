import { Badge } from "@workspace/ui/components/badge";
import { Check, X, ExternalLink } from "lucide-react";
import {
	FEATURE_CATEGORIES,
	ELMO_FEATURES,
	CATEGORY_LABELS,
	type Competitor,
	type FeatureKey,
} from "@/lib/competitors";

function Cell({ on, highlight }: { on: boolean; highlight?: boolean }) {
	return (
		<td className={`px-3 py-3 text-center ${highlight ? "bg-blue-50" : ""}`}>
			{on ? <Check className="mx-auto h-4 w-4 text-blue-600" /> : <X className="mx-auto h-4 w-4 text-zinc-300" />}
		</td>
	);
}

function ToolSummary({ tool }: { tool: Competitor }) {
	return (
		<div>
			<h3 className="mb-1 text-lg font-semibold text-zinc-950">{tool.name}</h3>
			<div className="mt-2 flex flex-wrap gap-2">
				<Badge variant="secondary">{CATEGORY_LABELS[tool.category]}</Badge>
				{tool.pricing?.hasFree && <Badge variant="secondary">Free tier</Badge>}
				{tool.pricing?.startingPrice && <Badge variant="secondary">From {tool.pricing.startingPrice}</Badge>}
			</div>
			<p className="mt-3 text-sm text-zinc-600">{tool.tagline}</p>
			{tool.url && tool.domain && (
				<a
					href={tool.url}
					target="_blank"
					rel="noopener noreferrer nofollow"
					className="mt-2 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-950"
				>
					Visit {tool.domain}
					<ExternalLink className="h-3 w-3" />
				</a>
			)}
		</div>
	);
}

export function MultiComparison({ tools }: { tools: Competitor[] }) {
	const heading = `${tools.map((t) => t.name).join(" vs ")} vs Elmo`;
	const columnCount = tools.length + 2; // feature label + tools + Elmo

	return (
		<>
			{/* Tool summaries, plus Elmo */}
			<section className="border-b border-zinc-200 bg-zinc-50 py-8">
				<div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 lg:grid-cols-3 md:px-6">
					{tools.map((tool) => (
						<ToolSummary key={tool.slug} tool={tool} />
					))}
					<div>
						<h3 className="mb-1 text-lg font-semibold text-zinc-950">Elmo</h3>
						<div className="mt-2 flex flex-wrap gap-2">
							<Badge variant="secondary">Open Source</Badge>
							<Badge variant="secondary">Self-Hosted</Badge>
							<Badge variant="secondary">Free</Badge>
						</div>
						<p className="mt-3 text-sm text-zinc-600">
							Open-source AEO platform. Self-host for free and track AI visibility across every major answer engine with
							full transparency.
						</p>
					</div>
				</div>
			</section>

			{/* N-way feature table */}
			<section className="border-b border-zinc-200 bg-white py-12">
				<div className="mx-auto max-w-6xl px-4 md:px-6">
					<h2 className="font-heading mb-8 text-2xl text-zinc-950">{heading}</h2>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-zinc-200">
									<th className="py-3 pr-4 text-left font-semibold text-zinc-950">Feature</th>
									{tools.map((tool) => (
										<th key={tool.slug} className="w-28 px-3 py-3 text-center font-semibold text-zinc-950">
											{tool.name}
										</th>
									))}
									<th className="w-28 px-3 py-3 text-center font-semibold text-zinc-950">Elmo</th>
								</tr>
							</thead>
							<tbody>
								{Object.entries(FEATURE_CATEGORIES).flatMap(([catKey, cat]) => [
									<tr key={`cat-${catKey}`}>
										<td
											colSpan={columnCount}
											className="bg-zinc-50 px-0 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500"
										>
											{cat.label}
										</td>
									</tr>,
									...Object.entries(cat.features).map(([featureKey, featureDef]) => {
										const k = featureKey as FeatureKey;
										const elmo = ELMO_FEATURES[k] ?? false;
										return (
											<tr key={featureKey} className="border-b border-dashed border-zinc-200 last:border-solid">
												<td className="py-3 pr-4 text-sm text-zinc-600">{featureDef.label}</td>
												{tools.map((tool) => (
													<Cell key={tool.slug} on={tool.features[k] ?? false} />
												))}
												<Cell on={elmo} highlight={elmo} />
											</tr>
										);
									}),
								])}
							</tbody>
						</table>
					</div>
				</div>
			</section>
		</>
	);
}
