import { Link } from "@tanstack/react-router";
import {
	CLOUD_ENTRY_PRICE_USD,
	MONEY_BACK_GUARANTEE_DAYS,
	PLAN_KEYS,
	PLANS,
	type PlanDefinition,
	planPlatformBreakdown,
	RECOMMENDED_PLAN,
} from "@workspace/config/plans";
import { cloudSignupUrl } from "@workspace/config/referrals";
import { PlatformTier } from "@workspace/ui/brand/platform-tier";
import { ArrowRight, Check } from "lucide-react";
import { trackCta } from "@/lib/analytics";
import { ContactForm } from "./contact-form";
import { WaitlistForm } from "./waitlist-form";

const SIGNUP_URL = cloudSignupUrl("marketing-pricing");
const GUARANTEE = `${MONEY_BACK_GUARANTEE_DAYS}-day money-back guarantee`;

interface Plan {
	id: string;
	tag: string;
	name: string;
	desc: string;
	price: string;
	priceLabel: string;
	/** The commitment, stated under the price where the price is decided on. */
	note?: string;
	/** Draws the eye to the option we want picked; exactly one plan sets it. */
	featured?: boolean;
	features: string[];
	cta:
		| { type: "cloud"; text: string }
		| { type: "self-host"; text: string }
		| { type: "waitlist" }
		| { type: "contact" };
}

const plans: Plan[] = [
	{
		id: "cloud",
		tag: "01",
		name: "Cloud",
		desc: "We host it, update it, and keep it running.",
		price: `From $${CLOUD_ENTRY_PRICE_USD}`,
		priceLabel: "/ mo",
		note: `Cancel anytime. ${GUARANTEE}.`,
		featured: true,
		features: [
			"Managed hosting, automatic updates",
			"Track ChatGPT on Starter; more platforms on higher plans",
			"We scrape AI answers up to 4× daily",
			"Premium grounded models on Pro & Business",
			"API access on every plan",
			"Unlimited seats",
		],
		cta: { type: "cloud", text: "Start with Cloud" },
	},
	{
		id: "self-hosted",
		tag: "02",
		name: "Self-Hosted",
		desc: "Run on your own infra with full access.",
		price: "$0",
		priceLabel: "",
		features: [
			"Unlimited prompts",
			"All AI models supported",
			"Citation analysis",
			"Competitor tracking",
			"Full source code access",
			"Community support",
		],
		cta: { type: "self-host", text: "Self-host free" },
	},
	{
		id: "white-label",
		tag: "03",
		name: "White Label",
		desc: "Offer AEO tracking to your clients.",
		price: "Custom",
		priceLabel: "",
		features: [
			"Everything in Cloud",
			"Custom branding",
			"Custom domain",
			"SSO",
			"Shared Slack channel",
			"Prioritized features",
		],
		cta: { type: "contact" },
	},
];

/** Only the featured plan gets a filled button, so the row has one obvious next step. */
function cardCtaClass(featured?: boolean): string {
	const base =
		"inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium leading-none";
	return featured
		? `${base} bg-blue-600 text-white ring-1 ring-blue-600 hover:bg-blue-700`
		: `${base} bg-white text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300`;
}

/** The same two treatments, reached through the buttons the embedded forms render. */
function formButtonClass(featured?: boolean): string {
	const base =
		"[&_button]:!h-8 [&_button]:w-full [&_button]:rounded-md [&_button]:!px-3 [&_button]:!py-0 [&_button]:!text-sm [&_button]:font-medium [&_button]:!leading-none [&_button]:ring-1";
	return featured
		? `${base} [&_button]:bg-blue-600 [&_button]:text-white [&_button]:ring-blue-600 [&_button]:hover:bg-blue-700`
		: `${base} [&_button]:bg-white [&_button]:text-zinc-900 [&_button]:ring-zinc-200 [&_button]:hover:bg-zinc-50 [&_button]:hover:ring-zinc-300`;
}

function RecommendedPill() {
	return (
		<span className="rounded-full bg-blue-600 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-white">
			Recommended
		</span>
	);
}

function PlanAction({ plan }: { plan: Plan }) {
	const { cta, featured } = plan;
	switch (cta.type) {
		case "cloud":
			return (
				<a
					href={SIGNUP_URL}
					onClick={() => trackCta("cloud-signup", "marketing-pricing")}
					className={cardCtaClass(featured)}
				>
					{cta.text}
					<ArrowRight className="size-3.5" />
				</a>
			);
		case "self-host":
			return (
				<Link to="/docs" onClick={() => trackCta("self-host", "marketing-pricing")} className={cardCtaClass(featured)}>
					{cta.text}
					<ArrowRight className="size-3.5" />
				</Link>
			);
		case "waitlist":
			return <WaitlistForm source="pricing" />;
		case "contact":
			return <ContactForm source="pricing" />;
	}
}

function PlanCard({ plan }: { plan: Plan }) {
	return (
		<div className={`flex flex-col justify-between p-6 lg:p-8 ${plan.featured ? "bg-blue-50/50" : "bg-white"}`}>
			<div>
				<div className="flex items-center gap-2">
					<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-blue-600 tabular-nums">
						{plan.tag}
					</span>
					{plan.featured && <RecommendedPill />}
				</div>
				<h3 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-950">{plan.name}</h3>
				<p className="mt-2 max-w-[36ch] text-pretty text-sm text-zinc-600">{plan.desc}</p>
				<div className="mt-6 border-y border-zinc-200 py-4">
					<div className="flex items-baseline gap-2">
						<span className="text-4xl font-semibold tracking-tight text-zinc-950 tabular-nums">{plan.price}</span>
						{plan.priceLabel && (
							<span className="font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500">{plan.priceLabel}</span>
						)}
					</div>
					{plan.note && <p className="mt-2 text-xs text-zinc-500">{plan.note}</p>}
				</div>
				<ul className="mt-6 space-y-2.5 text-sm text-zinc-700">
					{plan.features.map((f) => (
						<li key={f} className="flex items-start gap-2">
							<Check className="mt-0.5 size-3.5 shrink-0 text-blue-600" strokeWidth={3} />
							<span>{f}</span>
						</li>
					))}
				</ul>
			</div>
			<div className={`mt-8 ${formButtonClass(plan.featured)}`}>
				<PlanAction plan={plan} />
			</div>
		</div>
	);
}

export function Pricing({ as: Heading = "h2" }: { as?: "h1" | "h2" } = {}) {
	return (
		<section id="pricing" className="border-b border-zinc-200 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
				<div>
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ PRICING</p>
					<Heading className="mt-4 max-w-[28ch] text-4xl font-semibold leading-[1.05] tracking-tight text-balance text-zinc-950 md:text-5xl">
						Start at ${CLOUD_ENTRY_PRICE_USD}/mo. Or self-host for free.
					</Heading>
					<p className="mt-5 max-w-[58ch] text-pretty text-zinc-600 md:text-lg">
						Every cloud plan is backed by a {GUARANTEE}, and agencies can white-label the whole thing.
					</p>
				</div>

				<div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-3">
					{plans.map((plan) => (
						<PlanCard key={plan.id} plan={plan} />
					))}
				</div>

				<CloudPlans />
				<Compared />
			</div>
		</section>
	);
}

/**
 * The one comparison a buyer of this category makes, in the terms the
 * sign-up page already uses, with the head-to-head pages for the detail.
 */
function Compared() {
	const basic = PLANS[RECOMMENDED_PLAN];
	return (
		<div className="mt-16 rounded-lg border border-zinc-200 bg-zinc-50 p-6 lg:p-8">
			<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ COMPARED</p>
			<h3 className="mt-3 max-w-[32ch] text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
				{basic.standardRunsPerDay}× Profound's daily runs, at the same price.
			</h3>
			<p className="mt-3 max-w-[60ch] text-pretty text-sm text-zinc-600 md:text-base">
				{basic.name} samples every tracked prompt {basic.standardRunsPerDay} times a day across {basic.platformPicks}{" "}
				platforms for ${basic.monthlyPriceUsd}/mo, and because Elmo is open source you can check how every number is
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
					All 200+ tools
				</Link>
			</div>
		</div>
	);
}

function CloudPlans() {
	return (
		<div className="mt-16">
			<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ CLOUD PLANS</p>
			<h3 className="mt-3 max-w-[32ch] text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
				Self-serve cloud, billed monthly or annually.
			</h3>
			<p className="mt-2 max-w-[52ch] text-sm text-zinc-600">Annual billing saves two months.</p>

			<div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-5">
				{PLAN_KEYS.map((key) => (
					<CloudPlanCard key={key} plan={PLANS[key]} recommended={key === RECOMMENDED_PLAN} />
				))}
				<div className="flex flex-col bg-white p-5">
					<h4 className="text-lg font-semibold tracking-tight text-zinc-950">Custom</h4>
					<div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Let&apos;s talk</div>
					<p className="mt-1 text-xs text-zinc-500">Contract billing</p>
					<ul className="mt-4 space-y-1.5 text-xs text-zinc-700">
						<li>Multiple brands</li>
						<li>Custom prompt limits</li>
						<li>Higher daily sampling rates</li>
						<li>Any models</li>
						<li>White label</li>
						<li>SSO</li>
					</ul>
				</div>
			</div>

			<div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
				<a
					href={SIGNUP_URL}
					onClick={() => trackCta("cloud-signup", "marketing-pricing")}
					className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 text-sm font-medium leading-none text-white ring-1 ring-blue-600 hover:bg-blue-700"
				>
					Start with Cloud
					<ArrowRight className="size-3.5" />
				</a>
				<p className="text-sm text-zinc-500">Cancel anytime. Not for you in the first week? Full refund.</p>
			</div>
		</div>
	);
}

function CloudPlanCard({ plan, recommended }: { plan: PlanDefinition; recommended: boolean }) {
	const breakdown = planPlatformBreakdown(plan);
	return (
		<div className={`flex flex-col p-5 ${recommended ? "bg-blue-50/50" : "bg-white"}`}>
			<div className="flex flex-wrap items-center gap-2">
				<h4 className="text-lg font-semibold tracking-tight text-zinc-950">{plan.name}</h4>
				{recommended && <RecommendedPill />}
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
					<PlatformTier key={group.id} label={group.label} runsPerDay={group.runsPerDay} models={group.models} />
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
		</div>
	);
}
