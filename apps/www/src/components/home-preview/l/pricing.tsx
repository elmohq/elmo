import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD, CLOUD_SIGNUP_URL } from "@workspace/config/plans";
import { ArrowRight, Check } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { SectionHeading } from "./ui";

interface Plan {
	id: string;
	name: string;
	desc: string;
	price: string;
	priceLabel?: string;
	featured?: boolean;
	features: string[];
	cta: "cloud" | "self-host" | "contact";
}

const plans: Plan[] = [
	{
		id: "cloud",
		name: "Cloud",
		desc: "We host it, update it, and keep it running.",
		price: `$${CLOUD_ENTRY_PRICE_USD}`,
		priceLabel: "/mo and up",
		featured: true,
		features: [
			"Managed hosting, automatic updates",
			"Track ChatGPT on Starter; more platforms on higher plans",
			"We scrape AI answers up to 4× daily",
			"Premium grounded models on Pro & Business",
			"API access on every plan",
			"Unlimited seats",
		],
		cta: "cloud",
	},
	{
		id: "self-hosted",
		name: "Self-Hosted",
		desc: "Run on your own infra with full access.",
		price: "$0",
		priceLabel: "forever",
		features: [
			"Unlimited prompts",
			"All AI models supported",
			"Citation analysis",
			"Competitor tracking",
			"Full source code access",
			"Community support",
		],
		cta: "self-host",
	},
	{
		id: "white-label",
		name: "White Label",
		desc: "Offer AEO tracking to your clients.",
		price: "Custom",
		features: [
			"Everything in Cloud",
			"Custom branding",
			"Custom domain",
			"SSO",
			"Shared Slack channel",
			"Prioritized features",
		],
		cta: "contact",
	},
];

const BTN =
	"inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium leading-none";
const PRIMARY = `${BTN} bg-blue-600 text-white ring-1 ring-blue-600 hover:bg-blue-700`;
const SECONDARY = `${BTN} bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300`;

function PlanCta({ plan }: { plan: Plan }) {
	if (plan.cta === "cloud") {
		return (
			<a href={CLOUD_SIGNUP_URL} className={PRIMARY}>
				Start with Cloud
				<ArrowRight className="size-3.5" />
			</a>
		);
	}
	if (plan.cta === "self-host") {
		return (
			<Link to="/docs" className={SECONDARY}>
				Self-host free
				<ArrowRight className="size-3.5" />
			</Link>
		);
	}
	// The contact form renders its own trigger; restyle it to match the secondary buttons.
	return (
		<div className="[&>button]:!h-9 [&>button]:w-full [&>button]:rounded-md [&>button]:bg-white [&>button]:!text-sm [&>button]:font-medium [&>button]:text-slate-900 [&>button]:ring-1 [&>button]:ring-slate-200 [&>button]:hover:bg-slate-50 [&>button]:hover:ring-slate-300">
			<ContactForm source="pricing" />
		</div>
	);
}

export function Pricing() {
	return (
		<section id="pricing">
			<div className="mx-auto max-w-6xl px-4 py-16 md:px-6 lg:py-20">
				<SectionHeading
					eyebrow="Pricing"
					align="center"
					title="Our cloud, your servers, or your brand."
					lede="The same open-source product, three ways to run it."
				/>

				<div className="mt-14 grid items-stretch gap-4 md:grid-cols-3 md:gap-5">
					{plans.map((plan) => (
						<div
							key={plan.id}
							className={`relative flex flex-col rounded-2xl p-7 ${
								plan.featured
									? "bg-white shadow-[0_0_0_1.5px_rgb(37_99_235),0_24px_48px_-16px_rgb(37_99_235/0.3)]"
									: "bg-white shadow-[0_0_0_1px_rgb(30_58_138/0.07),0_1px_2px_rgb(30_58_138/0.05),0_18px_40px_-24px_rgb(30_58_138/0.22)]"
							}`}
						>
							{plan.featured ? (
								<span className="absolute -top-3 left-7 rounded-full bg-blue-600 px-2.5 py-1 font-mono text-[10px] uppercase leading-none tracking-[0.15em] text-white">
									Recommended
								</span>
							) : null}
							<h3 className="text-lg font-semibold tracking-tight text-slate-950">{plan.name}</h3>
							<p className="mt-1 text-sm text-slate-600">{plan.desc}</p>
							<div className="mt-6 flex items-baseline gap-1.5">
								<span className="text-4xl font-semibold tracking-[-0.03em] text-slate-950 tabular-nums">
									{plan.price}
								</span>
								{plan.priceLabel ? <span className="text-sm text-slate-500">{plan.priceLabel}</span> : null}
							</div>
							<div className="mt-6">
								<PlanCta plan={plan} />
							</div>
							<ul className="mt-7 space-y-3 border-t border-slate-100 pt-6 text-sm text-slate-700">
								{plan.features.map((f) => (
									<li key={f} className="flex items-start gap-2.5">
										<Check
											className={`mt-0.5 size-4 shrink-0 ${plan.featured ? "text-blue-600" : "text-slate-400"}`}
											strokeWidth={2.5}
											aria-hidden="true"
										/>
										<span>{f}</span>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<p className="mt-10 text-center text-sm text-slate-600">
					Cloud comes in several tiers by brands, prompts, and models.{" "}
					<Link
						to="/pricing"
						className="group inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
					>
						Compare every plan
						<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
					</Link>
				</p>
			</div>
		</section>
	);
}
