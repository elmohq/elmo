import { PLAN_KEYS, PLANS, type PlanDefinition } from "@workspace/config/plans";
import type { Competitor } from "@/lib/competitors";
import type { CompetitorPricing } from "@/lib/competitors/profiles";
import { formatPostDate } from "@/lib/format";

const LINK = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900";

/** AI answers a plan can collect in a 30-day month at full usage. */
function monthlyAnswers(plan: PlanDefinition): number {
	return plan.maxPrompts * plan.platformPicks * plan.standardRunsPerDay * 30;
}

export function elmoCostPerAnswer(plan: PlanDefinition): string {
	return `$${(plan.monthlyPriceUsd / monthlyAnswers(plan)).toFixed(4)}`;
}

function planLimits(plan: PlanDefinition): string {
	const platforms =
		plan.platformMenu.length === 1 ? "ChatGPT" : `${plan.platformPicks} platforms of your choice per brand`;
	const runs = plan.standardRunsPerDay === 1 ? "daily" : `up to ${plan.standardRunsPerDay}× a day`;
	const brands = plan.maxBrands === 1 ? "1 brand" : `${plan.maxBrands} brands`;
	return `${plan.maxPrompts} prompts, ${platforms}, ${runs}, ${brands}, unlimited seats, API and MCP.`;
}

export const ELMO_PLAN_ROWS = [
	{
		name: "Self-hosted",
		price: "Free",
		includes: "Unlimited prompts and brands. You pay your own scraping and model providers.",
	},
	...PLAN_KEYS.map((key) => {
		const plan = PLANS[key];
		return {
			name: `Cloud ${plan.name}`,
			price: `$${plan.monthlyPriceUsd}/mo`,
			includes: planLimits(plan),
		};
	}),
];

export function SourceList({ pricing }: { pricing: CompetitorPricing }) {
	return (
		<p className="mt-4 text-sm text-zinc-500">
			Prices verified {formatPostDate(pricing.verified)} from{" "}
			{pricing.sources.map((source, i) => (
				<span key={source.url}>
					{i > 0 ? ", " : ""}
					<a href={source.url} target="_blank" rel="noopener noreferrer nofollow" className={LINK}>
						{source.label}
					</a>
				</span>
			))}
			. Vendors change plans often, so check the source before you buy.
		</p>
	);
}

export function PlanTable({
	rows,
	highlight,
}: {
	rows: { name: string; price: string; billedAnnually?: string; includes: string }[];
	highlight?: boolean;
}) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-zinc-200 text-left">
						<th className="py-3 pr-4 font-semibold text-zinc-950">Plan</th>
						<th className="py-3 pr-4 font-semibold text-zinc-950">Price</th>
						<th className="py-3 font-semibold text-zinc-950">What you get</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.name} className={`border-b border-dashed border-zinc-200 ${highlight ? "bg-blue-50/40" : ""}`}>
							<td className="py-3 pr-4 align-top font-medium text-zinc-950">{row.name}</td>
							<td className="py-3 pr-4 align-top whitespace-nowrap text-zinc-700">
								{row.price}
								{row.billedAnnually ? (
									<span className="block text-xs text-zinc-500">{row.billedAnnually} billed annually</span>
								) : null}
							</td>
							<td className="py-3 align-top text-zinc-600">{row.includes}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

/** A competitor's plans, extra costs, and sources, as a page section body. */
export function CompetitorPricingDetails({ pricing }: { pricing: CompetitorPricing }) {
	return (
		<>
			<p className="mb-6 max-w-3xl leading-relaxed text-zinc-600">{pricing.summary}</p>
			<PlanTable rows={pricing.plans} />
			{pricing.extraCosts?.length ? (
				<ul className="mt-6 max-w-3xl list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-600">
					{pricing.extraCosts.map((cost) => (
						<li key={cost}>{cost}</li>
					))}
				</ul>
			) : null}
			{pricing.costPerAnswer ? (
				<p className="mt-4 max-w-3xl text-sm text-zinc-600">
					<span className="font-medium text-zinc-950">Cost per AI answer:</span> {pricing.costPerAnswer}
				</p>
			) : null}
			<SourceList pricing={pricing} />
		</>
	);
}

/** Side-by-side pricing for a compare page, Elmo included as the reference point. */
export function ComparePricing({ tools }: { tools: { competitor: Competitor; pricing: CompetitorPricing }[] }) {
	const basic = PLANS.basic;
	return (
		<section className="border-b border-zinc-200 bg-white py-12">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<h2 className="font-heading mb-8 text-2xl text-zinc-950">
					{tools.map((t) => t.competitor.name).join(" vs ")} pricing
				</h2>
				<div className="space-y-10">
					{tools.map(({ competitor, pricing }) => (
						<div key={competitor.slug}>
							<h3 className="mb-3 text-lg font-semibold text-zinc-950">{competitor.name}</h3>
							<CompetitorPricingDetails pricing={pricing} />
						</div>
					))}
					<div>
						<h3 className="mb-3 text-lg font-semibold text-zinc-950">Elmo</h3>
						<p className="mb-6 max-w-3xl leading-relaxed text-zinc-600">
							Elmo is free to self-host, and Elmo Cloud has public, self-serve prices. On the ${basic.monthlyPriceUsd}
							/mo {basic.name} plan a fully used prompt set works out to about {elmoCostPerAnswer(basic)} per AI answer.{" "}
							<a href="/pricing" className={LINK}>
								See Elmo pricing
							</a>
						</p>
						<PlanTable rows={ELMO_PLAN_ROWS} highlight />
					</div>
				</div>
			</div>
		</section>
	);
}
