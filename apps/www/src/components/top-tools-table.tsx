import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import {
	type Competitor,
	ELMO_FEATURES,
	FEATURE_CATEGORIES,
	type FeatureKey,
	getComparisonSlug,
	hasOwnPages,
	isIndexed,
	sortedCompetitors,
} from "@/lib/competitors";

const ENGINE_KEYS = (Object.keys(FEATURE_CATEGORIES.engines.features) as FeatureKey[]).filter(
	(key) => key !== "anyModel" && key !== "uiCapture" && key !== "byoKeys",
);

function engineCount(features: Partial<Record<FeatureKey, boolean>>): number {
	return ENGINE_KEYS.filter((key) => features[key]).length;
}

function startingPrice(c: Competitor): string {
	if (c.pricing?.startingPrice) return c.pricing.startingPrice;
	return c.pricing?.hasFree ? "Free tier" : "Contact sales";
}

const LINK = "text-blue-700 hover:text-blue-900";

export function TopToolsTable({ limit = 10 }: { limit?: number }) {
	const tools = sortedCompetitors.filter((c) => isIndexed(c) && hasOwnPages(c)).slice(0, limit);
	return (
		<section className="border-b border-zinc-200 bg-white py-12 lg:py-16">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<h2 className="font-heading text-2xl text-zinc-950 md:text-3xl">
					The leading AI visibility tracking tools at a glance
				</h2>
				<p className="mt-3 max-w-3xl leading-relaxed text-zinc-600">
					The {limit} most established LLM visibility trackers in the directory, with the AI engines each one covers and
					where pricing starts. Every tool links to a head-to-head comparison and a list of its alternatives.
				</p>
				<div className="mt-8 overflow-x-auto">
					<table className="w-full min-w-[720px] text-sm">
						<thead>
							<tr className="border-b border-zinc-200 text-left">
								<th className="py-3 pr-4 font-semibold text-zinc-950">Tool</th>
								<th className="py-3 pr-4 font-semibold text-zinc-950">Known for</th>
								<th className="py-3 pr-4 text-center font-semibold text-zinc-950">AI engines</th>
								<th className="py-3 pr-4 font-semibold text-zinc-950">Starting price</th>
								<th className="py-3 font-semibold text-zinc-950">Compare</th>
							</tr>
						</thead>
						<tbody>
							<tr className="border-b border-dashed border-zinc-200 bg-blue-50/40">
								<td className="py-3 pr-4 align-top font-medium text-zinc-950">Elmo</td>
								<td className="py-3 pr-4 align-top text-zinc-600">
									Open-source AI visibility tracking you can self-host and audit
								</td>
								<td className="py-3 pr-4 text-center align-top tabular-nums text-zinc-700">
									{engineCount(ELMO_FEATURES)}
								</td>
								<td className="py-3 pr-4 align-top text-zinc-700">
									Free to self-host, Cloud from ${CLOUD_ENTRY_PRICE_USD}/mo
								</td>
								<td className="py-3 align-top">
									<Link to="/pricing" className={LINK}>
										Pricing
									</Link>
								</td>
							</tr>
							{tools.map((c) => (
								<tr key={c.slug} className="border-b border-dashed border-zinc-200">
									<td className="py-3 pr-4 align-top font-medium text-zinc-950">{c.name}</td>
									<td className="py-3 pr-4 align-top text-zinc-600">{c.tagline}</td>
									<td className="py-3 pr-4 text-center align-top tabular-nums text-zinc-700">
										{engineCount(c.features)}
									</td>
									<td className="py-3 pr-4 align-top text-zinc-700">{startingPrice(c)}</td>
									<td className="py-3 align-top whitespace-nowrap">
										<Link to="/ai-visibility-tools/$slug" params={{ slug: getComparisonSlug(c) }} className={LINK}>
											vs Elmo
										</Link>
										<span className="text-zinc-300"> · </span>
										<Link to="/ai-visibility-tools/alternatives/$slug" params={{ slug: c.slug }} className={LINK}>
											Alternatives
										</Link>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="mt-4 text-sm text-zinc-500">
					Want a shortlist with a verdict on each tool instead? Read our pick of the{" "}
					<a href="/blog/best-ai-visibility-tools" className="font-medium text-blue-700 underline underline-offset-2">
						best AI visibility tools by use case
					</a>
					.
				</p>
			</div>
		</section>
	);
}
