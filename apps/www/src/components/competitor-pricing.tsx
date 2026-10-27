import { Link } from "@tanstack/react-router";
import { PLAN_KEYS, PLANS, type PlanDefinition } from "@workspace/config/plans";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { CARD } from "@/components/home/ui";
import type { Competitor } from "@/lib/competitors";
import type { CompetitorPricing, PricingPlan } from "@/lib/competitors/profiles";
import { formatPostDate } from "@/lib/format";

const LINK = "font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900";

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

export const ELMO_PLAN_ROWS: PricingPlan[] = [
	{
		name: "Self-Hosted",
		price: "Free",
		includes: "Unlimited prompts and brands. You pay your own scraping and model providers.",
	},
	...PLAN_KEYS.map((key) => {
		const plan = PLANS[key];
		return {
			name: `Cloud ${plan.name}`,
			price: `$${plan.monthlyPriceUsd}/mo`,
			includes: planLimits(plan),
			answers: { monthlyUsd: plan.monthlyPriceUsd, perMonth: monthlyAnswers(plan) },
		};
	}),
];

function perThousand(answers: { monthlyUsd: number; perMonth: number }): number {
	return (answers.monthlyUsd / answers.perMonth) * 1000;
}

function usd(value: number): string {
	return `$${value.toFixed(2)}`;
}

export function SourceList({ pricing }: { pricing: CompetitorPricing }) {
	return (
		<p className="mt-6 text-sm text-zinc-500">
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

const COLUMNS: Record<number, string> = {
	1: "",
	2: "sm:grid-cols-2",
	3: "sm:grid-cols-2 lg:grid-cols-3",
	5: "sm:grid-cols-2 lg:grid-cols-5",
};

type PlanVariant = "current" | "previous" | "elmo";

const CARD_STYLE: Record<PlanVariant, string> = {
	current: CARD,
	previous: "rounded-2xl bg-white/70 ring-1 ring-zinc-200",
	elmo: "rounded-2xl bg-white shadow-[0_0_0_1px_rgb(37_99_235/0.3),0_16px_40px_-24px_rgb(37_99_235/0.4)]",
};

function PlanPrice({ price, muted }: { price: string; muted: boolean }) {
	const monthly = /^(\$[\d,.]+)\/mo$/.exec(price);
	const ink = muted ? "text-zinc-500" : "text-zinc-950";
	if (monthly) {
		return (
			<p className="mt-2 flex items-baseline gap-1">
				<span className={`text-3xl font-semibold tracking-[-0.035em] ${ink}`}>{monthly[1]}</span>
				<span className="text-sm text-zinc-500">/mo</span>
			</p>
		);
	}
	return <p className={`mt-2 text-xl font-semibold tracking-[-0.02em] text-balance ${ink}`}>{price}</p>;
}

export function PlanCards({ plans, variant = "current" }: { plans: PricingPlan[]; variant?: PlanVariant }) {
	const columns = COLUMNS[plans.length] ?? "sm:grid-cols-2 lg:grid-cols-4";
	const muted = variant === "previous";
	return (
		<ul className={`grid gap-4 ${columns}`}>
			{plans.map((plan) => (
				<li key={plan.name} className={`flex flex-col p-5 ${CARD_STYLE[variant]}`}>
					<p className={`text-sm font-semibold ${muted ? "text-zinc-600" : "text-zinc-950"}`}>{plan.name}</p>
					<PlanPrice price={plan.price} muted={muted} />
					{plan.billedAnnually ? (
						<p className="mt-0.5 text-xs text-zinc-500">{plan.billedAnnually} billed annually</p>
					) : null}
					<p className={`mt-4 flex-1 text-pretty text-sm/6 ${muted ? "text-zinc-500" : "text-zinc-600"}`}>
						{plan.includes}
					</p>
					{plan.answers ? (
						<p className="mt-4 border-t border-dashed border-zinc-200 pt-3 font-mono text-[11px] tracking-[0.04em] text-zinc-500">
							≈ {usd(perThousand(plan.answers))} per 1,000 answers
						</p>
					) : null}
				</li>
			))}
		</ul>
	);
}

export function PreviousPlans({ pricing }: { pricing: CompetitorPricing }) {
	if (!pricing.previous) return null;
	return (
		<div className="mt-10 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-5 md:p-7">
			<div className="flex flex-wrap items-center gap-3">
				<h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">Previous Plans (No Longer Offered)</h3>
				<span className="rounded-full bg-zinc-200/80 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-600">
					Discontinued
				</span>
			</div>
			<p className="mt-2 mb-5 max-w-3xl text-pretty text-sm/6 text-zinc-600">{pricing.previous.note}</p>
			<PlanCards plans={pricing.previous.plans} variant="previous" />
		</div>
	);
}

function CostItems({ items }: { items: string[] }) {
	return (
		<ol className="space-y-4">
			{items.map((item, i) => (
				<li key={item} className="flex gap-4 text-pretty leading-relaxed text-zinc-700">
					<span className="mt-0.5 font-mono text-xs text-amber-700">{String(i + 1).padStart(2, "0")}</span>
					<span>{item}</span>
				</li>
			))}
		</ol>
	);
}

export function HiddenCosts({ items }: { items: string[] }) {
	return (
		<div className="grid gap-6 rounded-2xl bg-amber-50/70 p-6 ring-1 ring-amber-200/80 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10 md:p-8">
			<div>
				<TriangleAlert className="size-5 text-amber-600" aria-hidden="true" />
				<p className="mt-3 text-pretty font-semibold text-zinc-950">The list price is not the whole bill.</p>
			</div>
			<CostItems items={items} />
		</div>
	);
}

function FinePrint({ items }: { items: string[] }) {
	return (
		<div className="rounded-2xl bg-amber-50/70 p-5 ring-1 ring-amber-200/80 md:p-6">
			<p className="mb-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-800">
				<TriangleAlert className="size-3.5" aria-hidden="true" />
				Add-Ons and Fine Print
			</p>
			<CostItems items={items} />
		</div>
	);
}

interface CostBar {
	label: string;
	price: string;
	elmo: boolean;
	monthlyUsd: number;
	perMonth: number;
	value: number;
}

function competitorBars(competitor: Competitor, pricing: CompetitorPricing): CostBar[] {
	return [...pricing.plans, ...(pricing.previous?.plans ?? [])].flatMap((plan) =>
		plan.answers
			? [
					{
						label: `${competitor.name} ${plan.name}`,
						price: plan.price,
						elmo: false,
						...plan.answers,
						value: perThousand(plan.answers),
					},
				]
			: [],
	);
}

const ELMO_BARS: CostBar[] = PLAN_KEYS.map((key) => {
	const plan = PLANS[key];
	const answers = { monthlyUsd: plan.monthlyPriceUsd, perMonth: monthlyAnswers(plan) };
	return {
		label: `Elmo ${plan.name}`,
		price: `$${plan.monthlyPriceUsd}/mo`,
		elmo: true,
		...answers,
		value: perThousand(answers),
	};
});

export function hasCostChart(pricing: CompetitorPricing): boolean {
	return [...pricing.plans, ...(pricing.previous?.plans ?? [])].some((plan) => plan.answers);
}

/** Horizontal bars, one per plan, longest first: Elmo in the accent, the competitor in recessive gray. */
export function CostPerAnswerChart({ competitor, pricing }: { competitor: Competitor; pricing: CompetitorPricing }) {
	const bars = [...competitorBars(competitor, pricing), ...ELMO_BARS].sort((a, b) => b.value - a.value);
	const max = bars[0]?.value ?? 1;
	return (
		<figure className={`p-5 md:p-7 ${CARD}`}>
			<figcaption>
				<h3 className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">Cost per 1,000 AI Answers</h3>
				<p className="mt-1 text-sm text-zinc-500">
					Monthly list price divided by the AI answers each plan can collect in 30 days. Shorter bars are cheaper.
				</p>
				<ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-600">
					<li className="flex items-center gap-2">
						<span aria-hidden="true" className="size-2.5 rounded-sm bg-blue-600" />
						Elmo Cloud
					</li>
					<li className="flex items-center gap-2">
						<span aria-hidden="true" className="size-2.5 rounded-sm bg-zinc-400" />
						{competitor.name}
					</li>
				</ul>
			</figcaption>
			<ul className="mt-6 space-y-3 sm:space-y-2">
				{bars.map((bar) => (
					<li
						key={bar.label}
						className="group relative grid gap-1 rounded-md sm:grid-cols-[15rem_minmax(0,1fr)] sm:items-center sm:gap-4 sm:px-2 sm:py-1 sm:hover:bg-zinc-50"
					>
						<p className="flex items-baseline justify-between gap-2 text-sm sm:block">
							<span className="font-medium text-zinc-950">{bar.label}</span>
							<span className="text-xs text-zinc-500 sm:block">{bar.price}</span>
						</p>
						<div className="flex items-center gap-2 border-l border-zinc-300">
							<div
								className={`h-5 rounded-r-[4px] ${bar.elmo ? "bg-blue-600" : "bg-zinc-400"}`}
								style={{ width: `max(3px, calc((100% - 4rem) * ${bar.value / max}))` }}
							/>
							<span className="text-sm font-medium tabular-nums text-zinc-950">{usd(bar.value)}</span>
						</div>
						<span
							role="tooltip"
							className="pointer-events-none absolute -top-8 right-0 z-10 hidden whitespace-nowrap rounded-md bg-zinc-950 px-2 py-1 text-xs text-white shadow-sm group-hover:block"
						>
							{bar.price} for {bar.perMonth.toLocaleString("en-US")} answers a month
						</span>
					</li>
				))}
			</ul>
			<details className="mt-6 border-t border-zinc-200 pt-4 text-sm">
				<summary className="cursor-pointer font-medium text-zinc-700 hover:text-zinc-950">View as Table</summary>
				<div className="mt-3 overflow-x-auto">
					<table className="w-full min-w-[480px] text-left">
						<thead>
							<tr className="border-b border-zinc-200 text-zinc-500">
								<th className="py-2 pr-4 font-medium">Plan</th>
								<th className="py-2 pr-4 font-medium">Monthly Price</th>
								<th className="py-2 pr-4 font-medium">AI Answers a Month</th>
								<th className="py-2 font-medium">Per 1,000 Answers</th>
							</tr>
						</thead>
						<tbody className="tabular-nums">
							{bars.map((bar) => (
								<tr key={bar.label} className="border-b border-dashed border-zinc-200 last:border-0">
									<td className="py-2 pr-4 text-zinc-950">{bar.label}</td>
									<td className="py-2 pr-4 text-zinc-600">${bar.monthlyUsd}</td>
									<td className="py-2 pr-4 text-zinc-600">{bar.perMonth.toLocaleString("en-US")}</td>
									<td className="py-2 text-zinc-950">{usd(bar.value)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>
		</figure>
	);
}

function PlanPriceList({ plans, muted }: { plans: PricingPlan[]; muted?: boolean }) {
	return (
		<ul className="divide-y divide-dashed divide-zinc-200">
			{plans.map((plan) => (
				<li key={plan.name} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
					<span className={`font-medium ${muted ? "text-zinc-500" : "text-zinc-950"}`}>{plan.name}</span>
					<span className={`text-right ${muted ? "text-zinc-500" : "text-zinc-600"}`}>{plan.price}</span>
				</li>
			))}
		</ul>
	);
}

/** The compact version for pages whose subject isn't pricing, pointing at the full breakdown. */
export function PricingSnapshot({ competitor, pricing }: { competitor: Competitor; pricing: CompetitorPricing }) {
	return (
		<div className={`grid gap-6 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-10 ${CARD}`}>
			<div>
				<p className="text-pretty leading-relaxed text-zinc-600">{pricing.summary}</p>
				<Link
					to="/ai-visibility-tools/pricing/$slug"
					params={{ slug: competitor.slug }}
					className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:text-blue-900"
				>
					Full {competitor.name} Pricing Breakdown
					<ArrowRight className="size-3.5" />
				</Link>
			</div>
			<div className="self-start">
				<PlanPriceList plans={pricing.plans} />
				{pricing.previous ? (
					<>
						<p className="mt-5 mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
							Previous Plans (No Longer Offered)
						</p>
						<PlanPriceList plans={pricing.previous.plans} muted />
					</>
				) : null}
			</div>
		</div>
	);
}

export function CompetitorPricingDetails({ pricing }: { pricing: CompetitorPricing }) {
	return (
		<>
			<p className="mb-6 max-w-3xl leading-relaxed text-zinc-600">{pricing.summary}</p>
			<PlanCards plans={pricing.plans} />
			<PreviousPlans pricing={pricing} />
			{pricing.extraCosts?.length ? (
				<div className="mt-6">
					<FinePrint items={pricing.extraCosts} />
				</div>
			) : null}
			{pricing.costPerAnswer ? (
				<p className="mt-4 max-w-3xl text-sm text-zinc-600">
					<span className="font-medium text-zinc-950">Cost per AI Answer:</span> {pricing.costPerAnswer}
				</p>
			) : null}
			<SourceList pricing={pricing} />
		</>
	);
}

export function ComparePricing({ tools }: { tools: { competitor: Competitor; pricing: CompetitorPricing }[] }) {
	const basic = PLANS.basic;
	return (
		<section className="border-b border-zinc-200 bg-white py-12">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<h2 className="font-heading mb-8 text-2xl text-zinc-950">
					{tools.map((t) => t.competitor.name).join(" vs ")} Pricing
				</h2>
				<div className="space-y-12">
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
								See Elmo Pricing
							</a>
						</p>
						<PlanCards plans={ELMO_PLAN_ROWS} variant="elmo" />
					</div>
				</div>
			</div>
		</section>
	);
}
