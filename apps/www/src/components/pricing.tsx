import { Link } from "@tanstack/react-router";
import {
	CLOUD_ENTRY_PRICE_USD,
	CLOUD_SIGNUP_URL,
	PLAN_KEYS,
	PLANS,
	planPlatformBreakdown,
} from "@workspace/config/plans";
import { PlatformTier } from "@workspace/ui/brand/platform-tier";
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
	/** Draws the eye to the option we want picked; exactly one plan sets it. */
	featured?: boolean;
	features: string[];
	cta:
		| { type: "link"; text: string; href: string }
		| { type: "external"; text: string; href: string }
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
		featured: true,
		features: [
			"Managed hosting, automatic updates",
			"Track ChatGPT, Google, Perplexity & more",
			"Scraped surfaces sampled up to 4× daily",
			"Premium grounded models on Pro & Business",
			"API access on every plan",
			"Unlimited seats",
		],
		cta: { type: "external", text: "Start with Cloud", href: CLOUD_SIGNUP_URL },
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
		cta: { type: "link", text: "Self-host free", href: "/docs" },
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

/**
 * `as` controls the section heading level. The section is the whole page on
 * /pricing, where it has to be the h1, but sits under the homepage h1 when
 * embedded there.
 */
export function Pricing({ as: Heading = "h2" }: { as?: "h1" | "h2" } = {}) {
	return (
		<section id="pricing" className="border-b border-zinc-200 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-24">
				<div>
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ PRICING</p>
					<Heading className="mt-4 max-w-[28ch] text-4xl font-semibold leading-[1.05] tracking-tight text-balance text-zinc-950 md:text-5xl">
						Run it in our cloud, self-host it, or white-label it for your customers.
					</Heading>
				</div>

				<div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-zinc-200 bg-zinc-200 md:grid-cols-3">
					{plans.map((plan) => (
						<div
							key={plan.id}
							className={`flex flex-col justify-between p-6 lg:p-8 ${plan.featured ? "bg-blue-50/50" : "bg-white"}`}
						>
							<div>
								<div className="flex items-center gap-2">
									<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-blue-600 tabular-nums">
										{plan.tag}
									</span>
									{plan.featured && (
										<span className="rounded-full bg-blue-600 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-white">
											Recommended
										</span>
									)}
								</div>
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
							<div className={`mt-8 ${formButtonClass(plan.featured)}`}>
								{plan.cta.type === "link" && (
									<Link to={plan.cta.href} className={cardCtaClass(plan.featured)}>
										{plan.cta.text}
										<ArrowRight className="size-3.5" />
									</Link>
								)}
								{plan.cta.type === "external" && (
									<a href={plan.cta.href} className={cardCtaClass(plan.featured)}>
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

function CloudPlans() {
	return (
		<div className="mt-16">
			<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ CLOUD PLANS</p>
			<h3 className="mt-3 max-w-[32ch] text-2xl font-semibold tracking-tight text-zinc-950 md:text-3xl">
				Self-serve cloud, billed monthly or annually.
			</h3>
			<p className="mt-2 max-w-[52ch] text-sm text-zinc-600">Annual billing saves two months.</p>

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
						</div>
					);
				})}
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
