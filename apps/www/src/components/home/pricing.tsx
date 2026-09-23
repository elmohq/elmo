import { Link } from "@tanstack/react-router";
import { PLAN_KEYS, PLANS, type PlanDefinition, type PlanKey } from "@workspace/config/plans";
import { bookDemoUrl } from "@workspace/config/referrals";
import { ArrowRight, Check } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { externalRel } from "@/lib/external-link";
import { CtaPair } from "./cta";
import { CARD, SectionHeading } from "./ui";

interface Highlight {
	lead: string;
	rest: string;
	/** Claims measured against Profound, set apart from Elmo's own plan facts. */
	versus?: boolean;
}

/**
 * One line per plan saying why you'd pick it. The Profound figures are fixed
 * claims, not derived from the competitor data in lib/competitors.
 */
const HIGHLIGHTS: Record<PlanKey, Highlight> = {
	starter: { lead: "⅓ the price", rest: "of Profound's equivalent plan", versus: true },
	basic: { lead: "4× the data", rest: "of Profound's equivalent plan", versus: true },
	pro: { lead: "Premium models", rest: `${PLANS.pro.premiumIncluded} grounded, cited pairings` },
	business: { lead: `${PLANS.business.maxBrands} brands`, rest: "For agencies and portfolios" },
};

function planLines(plan: PlanDefinition): string[] {
	const platforms = plan.platformMenu.length === 1 ? "ChatGPT only" : `Any ${plan.platformPicks} AI platforms`;
	return [
		`${plan.maxBrands} brand${plan.maxBrands === 1 ? "" : "s"}, ${plan.maxPrompts} prompts`,
		platforms,
		`Answers checked ${plan.standardRunsPerDay}× a day`,
	];
}

function TierCard({ planKey }: { planKey: PlanKey }) {
	const plan = PLANS[planKey];
	const highlight = HIGHLIGHTS[planKey];
	return (
		<div className={`flex flex-col p-6 ${CARD}`}>
			<h3 className="text-base font-semibold text-zinc-950">{plan.name}</h3>
			<p className="mt-2 flex items-baseline gap-1">
				<span className="text-4xl font-semibold tracking-[-0.035em] text-zinc-950 tabular-nums">
					${plan.monthlyPriceUsd}
				</span>
				<span className="text-sm text-zinc-500">/mo</span>
			</p>
			<p
				className={`mt-5 rounded-xl px-3.5 py-3 text-[13px]/5 ${
					highlight.versus
						? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80"
						: "bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200/70"
				}`}
			>
				<span className={`block text-lg font-semibold ${highlight.versus ? "text-emerald-700" : "text-zinc-950"}`}>
					{highlight.lead}
				</span>
				{highlight.rest}
			</p>
			<ul className="mt-5 space-y-2.5 text-sm text-zinc-700">
				{planLines(plan).map((line) => (
					<li key={line} className="flex items-start gap-2">
						<Check className="mt-0.5 size-4 shrink-0 text-blue-600" strokeWidth={2.5} aria-hidden="true" />
						{line}
					</li>
				))}
			</ul>
		</div>
	);
}

const LINK = "group inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700";

function MoreLink({ children }: { children: React.ReactNode }) {
	return (
		<>
			{children}
			<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
		</>
	);
}

function OtherOption({
	name,
	price,
	body,
	action,
}: {
	name: string;
	price: string;
	body: string;
	action: React.ReactNode;
}) {
	return (
		<div className="flex flex-col rounded-2xl bg-zinc-50/80 p-6 ring-1 ring-zinc-200/80">
			<div className="flex items-baseline justify-between gap-3">
				<h3 className="text-base font-semibold text-zinc-950">{name}</h3>
				<p className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">{price}</p>
			</div>
			<p className="mt-2 flex-1 text-pretty text-sm/6 text-zinc-600">{body}</p>
			<div className="mt-4">{action}</div>
		</div>
	);
}

const DEMO_URL = bookDemoUrl("marketing-cta");

export function Pricing() {
	return (
		<section id="pricing" className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					eyebrow="Pricing"
					align="center"
					title="Start at $29 a month. Self-host for $0."
					lede="Starter is ⅓ the price of Profound's equivalent plan, and Basic gives you 4× the data of theirs. Every plan is self-serve, with unlimited seats and API access."
				/>

				<div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{PLAN_KEYS.map((key) => (
						<TierCard key={key} planKey={key} />
					))}
				</div>

				<div className="mt-4 grid gap-4 md:grid-cols-3">
					<OtherOption
						name="Custom"
						price="Let's talk"
						body="More brands, custom prompt limits, higher sampling rates, and any models."
						action={
							<a href={DEMO_URL} target="_blank" rel={externalRel(DEMO_URL)} className={LINK}>
								<MoreLink>Book a call</MoreLink>
							</a>
						}
					/>
					<OtherOption
						name="Self-hosted"
						price="$0"
						body="The same open-source product on your own servers. Unlimited prompts, every model, full source."
						action={
							<Link to="/docs" className={LINK}>
								<MoreLink>Read the setup guide</MoreLink>
							</Link>
						}
					/>
					<OtherOption
						name="White label"
						price="Custom"
						body="Offer AI visibility tracking to your clients under your own brand, domain, and SSO."
						action={
							<div className="[&_button]:!h-auto [&_button]:!w-auto [&_button]:!bg-transparent [&_button]:!p-0 [&_button]:!text-sm [&_button]:!font-medium [&_button]:!text-blue-600 [&_button]:hover:!text-blue-700">
								<ContactForm source="pricing" />
							</div>
						}
					/>
				</div>

				<div className="mt-12 flex flex-col items-center gap-5">
					<CtaPair />
					<Link to="/pricing" className={LINK}>
						<MoreLink>Compare every plan</MoreLink>
					</Link>
				</div>
			</div>
		</section>
	);
}
