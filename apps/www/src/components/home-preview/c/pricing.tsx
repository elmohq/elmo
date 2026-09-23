import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD, CLOUD_SIGNUP_URL } from "@workspace/config/plans";
import { ArrowRight, Check } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { FOCUS_RING, PRIMARY_BTN, SECONDARY_BTN, SectionHeading } from "./ui";

interface Plan {
	id: string;
	name: string;
	desc: string;
	price: string;
	priceLabel?: string;
	featured?: boolean;
	features: string[];
	cta: { type: "link" | "external"; text: string; href: string } | { type: "contact" };
}

const plans: Plan[] = [
	{
		id: "cloud",
		name: "Cloud",
		desc: "We host it, update it, and keep it running.",
		price: `$${CLOUD_ENTRY_PRICE_USD}`,
		priceLabel: "/mo to start",
		featured: true,
		features: [
			"Managed hosting, automatic updates",
			"Track ChatGPT on Starter; more platforms on higher plans",
			"We scrape AI answers up to 4× daily",
			"Premium grounded models on Pro & Business",
			"API access on every plan",
			"Unlimited seats",
		],
		cta: { type: "external", text: "Start with Cloud", href: CLOUD_SIGNUP_URL },
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
		cta: { type: "link", text: "Self-host free", href: "/docs" },
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
		cta: { type: "contact" },
	},
];

// ContactForm renders its own shadcn Button; these reach in so it matches the
// secondary button beside it rather than the light-theme default.
const CONTACT_BUTTON =
	"[&_button]:!h-10 [&_button]:w-full [&_button]:rounded-md [&_button]:!bg-white/[0.04] [&_button]:!px-4 [&_button]:!text-sm [&_button]:font-medium [&_button]:!text-zinc-100 [&_button]:ring-1 [&_button]:ring-white/15 [&_button]:hover:!bg-white/[0.08]";

export function Pricing() {
	return (
		<section id="pricing" aria-labelledby="pricing-heading" className="border-t border-white/[0.06] py-20 lg:py-24">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
					<SectionHeading
						id="pricing-heading"
						eyebrow="Pricing"
						title="Pick how you run it."
						lede="Cloud, self-hosted, or white-label — the same open-source product every way."
					/>
					<Link
						to="/pricing"
						className={`group inline-flex shrink-0 items-center gap-1.5 rounded font-mono text-xs text-zinc-400 hover:text-white ${FOCUS_RING}`}
					>
						Compare all cloud plans
						<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
					</Link>
				</div>

				<div className="mt-12 grid gap-4 lg:grid-cols-3">
					{plans.map((plan) => (
						<div
							key={plan.id}
							className={`relative flex flex-col rounded-xl p-px ${plan.featured ? "bg-gradient-to-b from-blue-500 via-blue-500/30 to-white/10 shadow-[0_0_60px_-20px_rgb(37_99_235/0.6)]" : "bg-white/10"}`}
						>
							<div
								className={`flex flex-1 flex-col rounded-[11px] p-6 lg:p-7 ${plan.featured ? "bg-[linear-gradient(to_bottom,rgb(23_37_84/0.55),rgb(9_9_11)_45%)]" : "bg-zinc-950"}`}
							>
								<div className="flex items-center justify-between">
									<h3 className="text-lg font-medium tracking-tight text-white">{plan.name}</h3>
									{plan.featured ? (
										<span className="rounded-full bg-blue-500/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-blue-300 ring-1 ring-blue-400/30">
											Recommended
										</span>
									) : null}
								</div>
								<p className="mt-1.5 text-sm text-zinc-400">{plan.desc}</p>
								<p className="mt-6 flex items-baseline gap-2">
									<span className="text-4xl font-semibold tracking-[-0.03em] text-white tabular-nums">
										{plan.price}
									</span>
									{plan.priceLabel ? <span className="font-mono text-xs text-zinc-500">{plan.priceLabel}</span> : null}
								</p>

								<div className={`mt-6 ${plan.cta.type === "contact" ? CONTACT_BUTTON : ""}`}>
									{plan.cta.type === "external" && (
										<a href={plan.cta.href} className={`${PRIMARY_BTN} w-full`}>
											{plan.cta.text}
											<ArrowRight className="size-4" aria-hidden="true" />
										</a>
									)}
									{plan.cta.type === "link" && (
										<Link to={plan.cta.href} className={`${SECONDARY_BTN} w-full`}>
											{plan.cta.text}
										</Link>
									)}
									{plan.cta.type === "contact" && <ContactForm source="pricing" />}
								</div>

								<ul className="mt-7 space-y-3 border-t border-white/10 pt-6 text-sm text-zinc-300">
									{plan.features.map((f) => (
										<li key={f} className="flex items-start gap-2.5">
											<Check
												className={`mt-0.5 size-4 shrink-0 ${plan.featured ? "text-blue-400" : "text-zinc-500"}`}
												strokeWidth={2.5}
												aria-hidden="true"
											/>
											<span>{f}</span>
										</li>
									))}
								</ul>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
