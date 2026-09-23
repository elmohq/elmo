import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD, PLAN_KEYS, PLANS } from "@workspace/config/plans";
import { ArrowRight, Check } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { BTN_ON_BLUE, BTN_SECONDARY, CloudButton, DISPLAY, SelfHostButton } from "./ui";

interface Plan {
	name: string;
	desc: string;
	price: string;
	unit?: string;
	features: string[];
	featured?: boolean;
	cta: React.ReactNode;
}

/** Restyles the button ContactForm renders so it matches the other cards. */
const CONTACT_BTN =
	"[&_button]:!h-11 [&_button]:w-full [&_button]:!rounded-xl [&_button]:!bg-white [&_button]:!px-5 [&_button]:!text-[15px] [&_button]:!font-semibold [&_button]:!text-zinc-950 [&_button]:ring-2 [&_button]:ring-zinc-950 [&_button]:shadow-[0_3px_0_0_#09090b] [&_button]:transition-transform [&_button]:hover:-translate-y-0.5";

const plans: Plan[] = [
	{
		name: "Self-Hosted",
		desc: "Run it on your own infrastructure with full access.",
		price: "$0",
		unit: "forever",
		features: [
			"Unlimited prompts",
			"All AI models supported",
			"Citation analysis",
			"Competitor tracking",
			"Full source code access",
			"Community support",
		],
		cta: <SelfHostButton className={`${BTN_SECONDARY} w-full`} />,
	},
	{
		name: "Cloud",
		desc: "We host it, update it, and keep it running.",
		price: `$${CLOUD_ENTRY_PRICE_USD}`,
		unit: "/mo and up",
		featured: true,
		features: [
			"Managed hosting, automatic updates",
			"Track ChatGPT on Starter; more platforms on higher plans",
			"We scrape AI answers up to 4× daily",
			"Premium grounded models on Pro & Business",
			"API access on every plan",
			"Unlimited seats",
		],
		cta: <CloudButton className={`${BTN_ON_BLUE} w-full`} />,
	},
	{
		name: "White Label",
		desc: "Offer AEO tracking to your clients, under your brand.",
		price: "Custom",
		features: [
			"Everything in Cloud",
			"Custom branding",
			"Custom domain",
			"SSO",
			"Shared Slack channel",
			"Prioritized features",
		],
		cta: (
			<div className={CONTACT_BTN}>
				<ContactForm source="pricing" />
			</div>
		),
	},
];

const TIER_NAMES = new Intl.ListFormat("en", { type: "conjunction" }).format(PLAN_KEYS.map((k) => PLANS[k].name));

export function PricingB() {
	return (
		<section id="pricing" aria-labelledby="hb-pricing" className="py-24 lg:py-32">
			<div className="mx-auto max-w-6xl px-5 md:px-8">
				<div className="mx-auto max-w-3xl text-center">
					<p className="text-sm font-bold uppercase tracking-[0.14em] text-blue-600">Pricing</p>
					<h2 id="hb-pricing" className={`${DISPLAY} mt-4 text-4xl leading-[1.05] text-zinc-950 md:text-6xl`}>
						Our cloud, your servers, or your brand.
					</h2>
					<p className="mx-auto mt-5 max-w-[36rem] text-pretty text-lg text-zinc-600">
						Same open-source product everywhere. Pick where it runs — with no lock-in either way.
					</p>
				</div>

				<div className="mt-14 grid items-stretch gap-5 lg:mt-16 lg:grid-cols-3 lg:items-center">
					{plans.map((p) => (
						<div
							key={p.name}
							className={`relative flex flex-col rounded-[2rem] p-8 transition duration-200 hover:-translate-y-1 md:p-9 ${
								p.featured
									? "order-first bg-blue-600 text-white shadow-[0_30px_60px_-20px_rgb(37_99_235/0.6)] lg:order-none lg:py-12"
									: "bg-white text-zinc-950 ring-1 ring-zinc-950/[0.07]"
							}`}
						>
							{p.featured && (
								<span className="absolute top-8 right-8 rounded-full bg-amber-300 px-3 py-1 text-xs font-bold uppercase tracking-wide text-zinc-950 md:top-9 md:right-9 lg:top-12">
									Recommended
								</span>
							)}
							<h3 className="text-xl font-bold">{p.name}</h3>
							<p className={`mt-1.5 max-w-[30ch] text-[15px] ${p.featured ? "text-blue-100" : "text-zinc-600"}`}>
								{p.desc}
							</p>
							<div className="mt-7 flex items-baseline gap-2">
								<span className="font-titan-one text-5xl tabular-nums">{p.price}</span>
								{p.unit && (
									<span className={`text-sm font-semibold ${p.featured ? "text-blue-100" : "text-zinc-500"}`}>
										{p.unit}
									</span>
								)}
							</div>
							<ul className="mt-7 space-y-3 text-[15px]">
								{p.features.map((f) => (
									<li key={f} className="flex items-start gap-2.5">
										<span
											className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
												p.featured ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
											}`}
										>
											<Check className="size-3" strokeWidth={3.5} aria-hidden="true" />
										</span>
										<span className={p.featured ? "text-white" : "text-zinc-700"}>{f}</span>
									</li>
								))}
							</ul>
							<div className="mt-9 lg:mt-10">{p.cta}</div>
						</div>
					))}
				</div>

				<p className="mt-10 text-center text-[15px] text-zinc-600">
					Cloud comes in {TIER_NAMES} tiers.{" "}
					<Link
						to="/pricing"
						className="group inline-flex items-center gap-1 rounded-sm font-semibold text-blue-700 underline decoration-2 underline-offset-4 decoration-blue-300 hover:decoration-blue-700"
					>
						Compare every plan
						<ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
					</Link>
				</p>
			</div>
		</section>
	);
}
