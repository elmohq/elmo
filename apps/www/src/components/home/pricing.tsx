import { Link } from "@tanstack/react-router";
import { PLAN_KEYS, PLANS, type PlanDefinition, type PlanKey } from "@workspace/config/plans";
import { cloudAppUrl } from "@workspace/config/referrals";
import { ArrowRight, Check, Minus } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { CARD, SectionHeading } from "./ui";

function planLines(plan: PlanDefinition): { text: string; included: boolean }[] {
	const platforms = plan.platformMenu.length === 1 ? "ChatGPT only" : `Any ${plan.platformPicks} AI platforms`;
	return [
		{ text: `${plan.maxBrands} brand${plan.maxBrands === 1 ? "" : "s"}, ${plan.maxPrompts} prompts`, included: true },
		{ text: platforms, included: true },
		{ text: `Answers checked ${plan.standardRunsPerDay}× daily`, included: true },
		plan.premiumIncluded > 0
			? { text: `${plan.premiumIncluded} premium prompts 1× daily`, included: true }
			: { text: "No premium models", included: false },
	];
}

/** The whole card is the link, so any click on a tier starts sign-up. */
function TierCard({ planKey }: { planKey: PlanKey }) {
	const plan = PLANS[planKey];
	return (
		<a
			href={cloudAppUrl(`marketing-plan-${planKey}`)}
			className={`group flex flex-col p-6 transition hover:shadow-[0_0_0_1px_rgb(37_99_235/0.45),0_16px_40px_-20px_rgb(37_99_235/0.35)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${CARD}`}
		>
			<span className="flex items-center justify-between text-base font-semibold text-zinc-950">
				{plan.name}
				<ArrowRight
					className="size-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600"
					aria-hidden="true"
				/>
			</span>
			<span className="mt-2 flex items-baseline gap-1">
				<span className="text-4xl font-semibold tracking-[-0.035em] text-zinc-950 tabular-nums">
					${plan.monthlyPriceUsd}
				</span>
				<span className="text-sm text-zinc-500">/mo</span>
			</span>
			<ul className="mt-5 space-y-2.5 text-sm">
				{planLines(plan).map((line) => (
					<li key={line.text} className={`flex items-start gap-2 ${line.included ? "text-zinc-700" : "text-zinc-400"}`}>
						{line.included ? (
							<Check className="mt-0.5 size-4 shrink-0 text-blue-600" strokeWidth={2.5} aria-hidden="true" />
						) : (
							<Minus className="mt-0.5 size-4 shrink-0 text-zinc-300" strokeWidth={2.5} aria-hidden="true" />
						)}
						{line.text}
					</li>
				))}
			</ul>
		</a>
	);
}

const LINK = "group inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700";
// The shared contact form renders a full-width button; here it should read as a quiet link.
const FORM_AS_LINK =
	"[&_button]:!h-auto [&_button]:!w-auto [&_button]:!bg-transparent [&_button]:!p-0 [&_button]:!text-sm [&_button]:!font-medium [&_button]:!text-blue-600 [&_button]:hover:!text-blue-700";

function OtherOption({ name, body, action }: { name: string; body: string; action: React.ReactNode }) {
	return (
		<div className="flex flex-col rounded-2xl bg-zinc-50/80 p-6 ring-1 ring-zinc-200/80">
			<h3 className="text-base font-semibold text-zinc-950">{name}</h3>
			<p className="mt-2 flex-1 text-pretty text-sm/6 text-zinc-600">{body}</p>
			<div className="mt-4">{action}</div>
		</div>
	);
}

export function Pricing() {
	return (
		<section id="pricing" className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					align="center"
					title="Start at $29 a month. Self-host for $0."
					lede="Self-serve, with unlimited seats and API/MCP access."
				/>

				<div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{PLAN_KEYS.map((key) => (
						<TierCard key={key} planKey={key} />
					))}
				</div>

				<div className="mt-4 grid gap-4 md:grid-cols-3">
					<OtherOption
						name="Self-hosted"
						body="The same product on your own servers. Unlimited prompts, every model, full source."
						action={
							<Link to="/docs" className={LINK}>
								Read the setup guide
								<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
							</Link>
						}
					/>
					<OtherOption
						name="Custom"
						body="More brands, custom prompt limits, higher sampling rates, and any models."
						action={
							<div className={FORM_AS_LINK}>
								<ContactForm source="pricing-custom" title="Custom Plan Inquiry" />
							</div>
						}
					/>
					<OtherOption
						name="White label"
						body="Offer AI visibility tracking to your clients under your own brand, domain, and SSO."
						action={
							<div className={FORM_AS_LINK}>
								<ContactForm source="pricing" />
							</div>
						}
					/>
				</div>

				<div className="mt-10 flex justify-center">
					<Link to="/pricing" className={LINK}>
						Compare every plan
						<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
					</Link>
				</div>
			</div>
		</section>
	);
}
