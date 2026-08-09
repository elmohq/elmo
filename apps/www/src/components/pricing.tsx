import { Link } from "@tanstack/react-router";
import { getModelMeta } from "@workspace/config/models";
import {
	CLOUD_ENTRY_PRICE_USD,
	CLOUD_SIGNUP_URL,
	MAX_STANDARD_RUNS_PER_DAY,
	PLAN_KEYS,
	PLANS,
	type PlanPlatformGroup,
	PREMIUM_ADDON_MONTHLY_USD,
	planPlatformBreakdown,
} from "@workspace/config/plans";
import { PlatformTier, type PlatformTierRow } from "@workspace/ui/brand/platform-tier";
import { ArrowRight, Check } from "lucide-react";
import { ContactForm } from "./contact-form";
import { WaitlistForm } from "./waitlist-form";

interface Plan {
	id: string;
	tag: string;
	name: string;
	desc: string;
	price: string;
	priceLabel: string;
	features: string[];
	cta:
		| { type: "link"; text: string; href: string }
		| { type: "external"; text: string; href: string }
		| { type: "waitlist" }
		| { type: "contact" };
}

const plans: Plan[] = [
	{
		id: "self-hosted",
		tag: "01",
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
		cta: { type: "link", text: "Get started", href: "/docs" },
	},
	{
		id: "cloud",
		tag: "02",
		name: "Cloud",
		desc: "Managed hosting, no maintenance.",
		price: `From $${CLOUD_ENTRY_PRICE_USD}`,
		priceLabel: "/ mo",
		features: [
			"Managed hosting, automatic updates",
			"Track ChatGPT, Google, Perplexity & more",
			"Scraped surfaces sampled up to 4× daily",
			"Premium grounded models on Pro & Business",
			"API access on every plan",
			"Unlimited seats",
		],
		cta: { type: "external", text: "View plans & sign up", href: CLOUD_SIGNUP_URL },
	},
	{
		id: "white-label",
		tag: "03",
		name: "White Label",
		desc: "Provide AEO for all of your customers.",
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

export function Pricing() {
	return (
		<section id="pricing" className="border-b border-zinc-200 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
				<div>
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ PRICING</p>
					<h2 className="mt-4 max-w-[28ch] text-4xl font-semibold leading-[1.05] tracking-tight text-balance text-zinc-950 md:text-5xl">
						Self-host it, run it in our cloud, or white-label it for your customers.
					</h2>
				</div>

				<div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-3">
					{plans.map((plan) => (
						<div key={plan.id} className="flex flex-col justify-between bg-white p-6 lg:p-8">
							<div>
								<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-blue-600 tabular-nums">
									{plan.tag}
								</span>
								<h3 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-950">{plan.name}</h3>
								<p className="mt-2 max-w-[36ch] text-pretty text-sm text-zinc-600">{plan.desc}</p>
								<div className="mt-6 flex items-baseline gap-2 border-y border-zinc-200 py-4">
									<span className="text-4xl font-semibold tracking-tight text-zinc-950 tabular-nums">{plan.price}</span>
									{plan.priceLabel && (
										<span className="font-mono text-[11px] uppercase tracking-[0.15em] text-zinc-500">
											{plan.priceLabel}
										</span>
									)}
								</div>
								<ul role="list" className="mt-6 space-y-2.5 text-sm text-zinc-700">
									{plan.features.map((f) => (
										<li key={f} className="flex items-start gap-2">
											<Check className="mt-0.5 size-3.5 shrink-0 text-blue-600" strokeWidth={3} />
											<span>{f}</span>
										</li>
									))}
								</ul>
							</div>
							<div className="mt-8 [&_button]:!h-8 [&_button]:w-full [&_button]:rounded-md [&_button]:bg-blue-600 [&_button]:!px-3 [&_button]:!py-0 [&_button]:!text-sm [&_button]:font-medium [&_button]:!leading-none [&_button]:text-white [&_button]:ring-1 [&_button]:ring-blue-600 [&_button]:hover:bg-blue-700">
								{plan.cta.type === "link" && (
									<Link
										to={plan.cta.href}
										className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium leading-none text-white ring-1 ring-blue-600 hover:bg-blue-700"
									>
										{plan.cta.text}
										<ArrowRight className="size-3.5" />
									</Link>
								)}
								{plan.cta.type === "external" && (
									<a
										href={plan.cta.href}
										className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium leading-none text-white ring-1 ring-blue-600 hover:bg-blue-700"
									>
										{plan.cta.text}
										<ArrowRight className="size-3.5" />
									</a>
								)}
								{plan.cta.type === "waitlist" && <WaitlistForm source="pricing" />}
								{plan.cta.type === "contact" && <ContactForm source="pricing" />}
							</div>
						</div>
					))}
				</div>

				<CloudPlans />
			</div>
		</section>
	);
}

/**
 * The platforms a tier covers, named. Logos alone were ambiguous — Google AI
 * Mode, AI Overviews and Gemini all carry the same mark — and a name a reader has
 * to hover for is not on the page.
 */
/** The catalog's tier, as the shared renderer wants it. */
function tierRows(group: PlanPlatformGroup): PlatformTierRow[] {
	return group.models.map(({ model, label }) => ({ iconId: getModelMeta(model).iconId, label }));
}

function CloudPlans() {
	return (
		<div className="mt-16">
			<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ CLOUD PLANS</p>
			<h3 className="mt-3 max-w-[32ch] text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
				Self-serve cloud, billed monthly or annually.
			</h3>
			<p className="mt-2 max-w-[52ch] text-sm text-zinc-600">
				Annual billing saves two months. No trial — evaluate with the{" "}
				<a href="https://demo.elmohq.com" className="text-blue-600 underline">
					live demo
				</a>{" "}
				or self-host for free.
			</p>

			<div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-5">
				{PLAN_KEYS.map((key) => {
					const plan = PLANS[key];
					const breakdown = planPlatformBreakdown(plan);
					return (
						<div key={key} className="flex flex-col bg-white p-5">
							<h4 className="text-lg font-semibold tracking-tight text-zinc-950">{plan.name}</h4>
							<div className="mt-2 flex items-baseline gap-1">
								<span className="text-2xl font-semibold tracking-tight text-zinc-950 tabular-nums">
									${plan.monthlyPriceUsd}
								</span>
								<span className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">/ mo</span>
							</div>
							<p className="mt-1 text-xs text-zinc-500 tabular-nums">${plan.annualPriceUsd}/yr</p>

							<ul className="mt-4 space-y-1.5 text-xs text-zinc-700">
								<li></li>
								<li>{plan.maxPrompts} tracked prompts</li>
							</ul>

							{/* The pick tiers all spend the same budget, so they sit together
							    under what the plan lets you choose. */}
							<div className="mt-4 space-y-2.5 border-t border-zinc-100 pt-4">
								<p className="text-xs font-medium text-zinc-900">{breakdown.pickHeading}</p>
								{breakdown.pickGroups.map((group) => (
									<PlatformTier key={group.id} {...group} models={tierRows(group)} />
								))}
							</div>

							{/* Chosen per prompt and added to the picks above, not swapped for
							    one of them, and paid out of a metered pool. Omitted entirely on
							    plans that don't sell it, rather than advertising an absence. */}
							{breakdown.premium && (
								<div className="mt-4 border-t border-zinc-100 pt-4">
									<PlatformTier {...breakdown.premium} models={tierRows(breakdown.premium)} />
									<p className="mt-1 text-[11px] leading-snug text-zinc-500">{breakdown.premium.summary}</p>
								</div>
							)}
						</div>
					);
				})}
				<div className="flex flex-col bg-white p-5">
					<h4 className="text-lg font-semibold tracking-tight text-zinc-950">Custom</h4>
					<div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">Let&apos;s talk</div>
					<p className="mt-1 text-xs text-zinc-500">Contract billing</p>
					<ul className="mt-4 space-y-1.5 text-xs text-zinc-700">
						<li>Multiple brands, custom prompt limits</li>
						<li>Up to {MAX_STANDARD_RUNS_PER_DAY}×/day sampling</li>
						<li>Any other models, white label</li>
						<li>SSO</li>
					</ul>
				</div>
			</div>

			<div className="mt-6 grid gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 sm:grid-cols-2">
				<div className="bg-white p-5">
					<p className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">/ SCRAPED SURFACES</p>
					<p className="mt-2 text-sm text-zinc-700">
						ChatGPT, Google AI Mode and AI Overviews, Copilot, Perplexity and Gemini are read the way a visitor sees
						them, so you get the answer <em>and</em> the sources it cited — including the shopping and search modules
						alongside it. Sampled at your plan&apos;s rate.
					</p>
				</div>
				<div className="bg-white p-5">
					<p className="font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500">/ MODEL APIS</p>
					<p className="mt-2 text-sm text-zinc-700">
						Claude, Mistral, DeepSeek and Qwen are called directly, which shows how each model describes your brand from
						what it already knows — nothing is searched, so nothing is cited. Claude costs the most per call, so it
						samples once a day rather than at your plan&apos;s rate. On Pro and Business you can also track a prompt on
						a premium model with its own web search switched on — Claude, Grok or GPT-5 — for grounded, cited answers,
						at ${PREMIUM_ADDON_MONTHLY_USD}/prompt/mo beyond what your plan includes.
					</p>
				</div>
			</div>

			<div className="mt-6 flex flex-wrap gap-3">
				<a
					href={CLOUD_SIGNUP_URL}
					className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 text-sm font-medium leading-none text-white ring-1 ring-blue-600 hover:bg-blue-700"
				>
					Sign up
					<ArrowRight className="size-3.5" />
				</a>
			</div>
		</div>
	);
}
