import { Link } from "@tanstack/react-router";
import {
	MONEY_BACK_GUARANTEE_DAYS,
	PLAN_KEYS,
	PLANS,
	planPlatformBreakdown,
	RECOMMENDED_PLAN,
} from "@workspace/config/plans";
import { cloudAppUrl } from "@workspace/config/referrals";
import { PlatformTier } from "@workspace/ui/brand/platform-tier";
import { ArrowRight } from "lucide-react";
import { trackCta } from "@/lib/analytics";
import { OtherPlans } from "./home/pricing";

export function Pricing({ as: Heading = "h2" }: { as?: "h1" | "h2" } = {}) {
	return (
		<section id="pricing" className="border-b border-zinc-200 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
				<Heading className="max-w-[28ch] text-4xl font-semibold leading-[1.05] tracking-tight text-balance text-zinc-950 md:text-5xl">
					Simple, self-serve pricing.
				</Heading>
				<p className="mt-4 text-pretty text-zinc-600 md:text-lg">
					Unlimited seats and API/MCP access on every plan. Annual billing saves two months. Every plan comes with a{" "}
					{MONEY_BACK_GUARANTEE_DAYS}-day money-back guarantee.
				</p>

				<CloudPlans />
				<OtherPlans className="mt-4" />
				<Compared />
			</div>
		</section>
	);
}

function CloudPlans() {
	return (
		<div className="mt-12">
			<div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
				{PLAN_KEYS.map((key) => {
					const plan = PLANS[key];
					const breakdown = planPlatformBreakdown(plan);
					const recommended = key === RECOMMENDED_PLAN;
					return (
						<div key={key} className={`flex flex-col p-5 ${recommended ? "bg-blue-50/50" : "bg-white"}`}>
							<div className="flex flex-wrap items-center gap-2">
								<h4 className="text-lg font-semibold tracking-tight text-zinc-950">{plan.name}</h4>
								{recommended && (
									<span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
										Recommended
									</span>
								)}
							</div>
							<div className="mt-2 flex items-baseline gap-1">
								<span className="text-2xl font-semibold tracking-tight text-zinc-950 tabular-nums">
									${plan.monthlyPriceUsd}
								</span>
								<span className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">/ mo</span>
							</div>
							<p className="mt-1 text-xs text-zinc-500 tabular-nums">${plan.annualPriceUsd}/yr</p>

							<ul className="mt-4 space-y-1.5 text-xs text-zinc-700">
								<li>
									{plan.maxBrands} brand{plan.maxBrands === 1 ? "" : "s"}
								</li>
								<li>{plan.maxPrompts} tracked prompts</li>
							</ul>

							{/* The pick tiers all spend the same budget, so they sit together
							    under what the plan lets you choose. */}
							<div className="mt-4 space-y-2.5 border-t border-zinc-100 pt-4">
								<p className="text-xs font-medium text-zinc-900">{breakdown.pickHeading}</p>
								{breakdown.pickGroups.map((group) => (
									<PlatformTier
										key={group.id}
										label={group.label}
										runsPerDay={group.runsPerDay}
										models={group.models}
									/>
								))}
							</div>

							{/* Chosen per prompt and added to the picks above, not swapped for
							    one of them, and paid out of a metered pool. Omitted entirely on
							    plans that don't sell it, rather than advertising an absence. */}
							{breakdown.premium && (
								<div className="mt-4 border-t border-zinc-100 pt-4">
									<PlatformTier
										label={breakdown.premium.label}
										runsPerDay={breakdown.premium.runsPerDay}
										models={breakdown.premium.models}
									/>
									<p className="mt-1 text-[11px] leading-snug text-zinc-500">{breakdown.premium.summary}</p>
								</div>
							)}

							<div className="mt-auto pt-6">
								<a
									href={cloudAppUrl(`marketing-pricing-${key}`)}
									onClick={() => trackCta("cloud-signup", `marketing-pricing-${key}`)}
									className="inline-flex w-full h-9 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 pt-0 text-sm font-medium leading-none text-white hover:bg-blue-700"
								>
									Get {plan.name}
									<ArrowRight className="size-3.5" />
								</a>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

/**
 * The one comparison a buyer of this category makes, in the terms the
 * sign-up page already uses, with the head-to-head pages for the detail.
 */
function Compared() {
	const plan = PLANS[RECOMMENDED_PLAN];
	return (
		<div className="mt-16 rounded-lg border border-zinc-200 bg-zinc-50 p-6 lg:p-8">
			<h3 className="max-w-[32ch] text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
				{plan.standardRunsPerDay}× Profound's Daily Runs
			</h3>
			<p className="mt-3 max-w-[60ch] text-pretty text-sm text-zinc-600 md:text-base">
				{plan.name} samples every tracked prompt {plan.standardRunsPerDay} times a day across {plan.platformPicks}{" "}
				platforms for ${plan.monthlyPriceUsd}/mo, and because Elmo is open source you can check how every number is
				produced.
			</p>
			<div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium">
				<Link
					to="/ai-visibility-tools/$slug"
					params={{ slug: "elmo-vs-profound" }}
					className="text-zinc-700 underline underline-offset-2 hover:text-zinc-950"
				>
					Elmo vs Profound
				</Link>
				<Link
					to="/ai-visibility-tools/$slug"
					params={{ slug: "elmo-vs-peec-ai" }}
					className="text-zinc-700 underline underline-offset-2 hover:text-zinc-950"
				>
					Elmo vs Peec AI
				</Link>
				<Link to="/ai-visibility-tools" className="text-zinc-700 underline underline-offset-2 hover:text-zinc-950">
					Every AI Visibility Tool
				</Link>
			</div>
		</div>
	);
}
