import { Link } from "@tanstack/react-router";
import {
	CLOUD_ENTRY_PRICE_USD,
	CLOUD_SIGNUP_URL,
	PLAN_KEYS,
	PLANS,
	type PlanDefinition,
	STANDARD_PLATFORM_MENU,
} from "@workspace/config/plans";
import { CUSTOMER_QUOTES } from "@workspace/ui/brand/customers";
import { ArrowRight, Check } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { SectionHeading } from "./ui";

const TIERS = PLAN_KEYS.map((key) => PLANS[key]);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const LADDER_ROWS: { label: string; value: (plan: PlanDefinition) => string }[] = [
	{ label: "Brands", value: (p) => String(p.maxBrands) },
	{ label: "Tracked prompts", value: (p) => String(p.maxPrompts) },
	{
		label: "Platforms",
		value: (p) =>
			p.platformMenu.length === 1 ? "ChatGPT only" : `Any ${p.platformPicks} of ${STANDARD_PLATFORM_MENU.length}`,
	},
	{ label: "Sampling", value: (p) => `${p.standardRunsPerDay}× a day` },
	{
		label: "Grounded answers",
		value: (p) => (p.premiumIncluded > 0 ? plural(p.premiumIncluded, "pairing") : "—"),
	},
];

const SELF_HOSTED = [
	"Unlimited prompts",
	"Any model, incl. OpenRouter or your own keys",
	"Runs on your own infrastructure",
	"Full source code, MIT license",
];

const WHITE_LABEL = ["Everything in Cloud", "Custom branding and domain", "SSO", "Shared Slack channel"];

const BTN =
	"inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

function CloudLadder() {
	return (
		<div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1.5px_rgb(37_99_235),0_24px_48px_-20px_rgb(37_99_235/0.35)]">
			<div className="flex flex-col gap-4 border-b border-zinc-100 p-6 sm:flex-row sm:items-end sm:justify-between md:p-7">
				<div>
					<h3 className="text-lg font-semibold tracking-tight text-zinc-950">Elmo Cloud</h3>
					<p className="mt-1 text-sm text-zinc-600">We host it, update it, and run the scrapers.</p>
					<p className="mt-4 flex items-baseline gap-1.5">
						<span className="text-sm text-zinc-500">From</span>
						<span className="text-4xl font-semibold tracking-[-0.03em] text-zinc-950 tabular-nums">
							${CLOUD_ENTRY_PRICE_USD}
						</span>
						<span className="text-sm text-zinc-500">/mo</span>
					</p>
				</div>
				<a href={CLOUD_SIGNUP_URL} className={`${BTN} bg-blue-600 text-white hover:bg-blue-700`}>
					Start with Cloud
					<ArrowRight className="size-3.5" aria-hidden="true" />
				</a>
			</div>

			{/* Desktop and tablet: the tiers side by side, so the step-ups read as a ladder. */}
			<table className="hidden w-full flex-1 table-fixed text-left text-[14px] sm:table">
				<caption className="sr-only">Elmo Cloud plans</caption>
				<thead>
					<tr className="border-b border-zinc-100">
						<th scope="col" className="w-[28%] px-6 py-3.5 md:px-7">
							<span className="sr-only">Limit</span>
						</th>
						{TIERS.map((plan) => (
							<th key={plan.key} scope="col" className="px-3 py-3.5 align-bottom">
								<span className="block text-[13px] font-semibold text-zinc-950">{plan.name}</span>
								<span className="mt-0.5 block text-[13px] text-zinc-500 tabular-nums">${plan.monthlyPriceUsd}/mo</span>
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{LADDER_ROWS.map((row) => (
						<tr key={row.label} className="border-b border-zinc-100 last:border-0">
							<th scope="row" className="px-6 py-3 font-normal text-zinc-600 md:px-7">
								{row.label}
							</th>
							{TIERS.map((plan) => (
								<td key={plan.key} className="px-3 py-3 font-medium text-zinc-900 tabular-nums">
									{row.value(plan)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>

			{/* Phones: one compact line per tier. */}
			<ul className="divide-y divide-zinc-100 sm:hidden">
				{TIERS.map((plan) => (
					<li key={plan.key} className="px-6 py-4">
						<p className="flex items-baseline justify-between">
							<span className="font-semibold text-zinc-950">{plan.name}</span>
							<span className="text-sm font-medium text-zinc-900 tabular-nums">${plan.monthlyPriceUsd}/mo</span>
						</p>
						<p className="mt-1 text-[13px]/5 text-zinc-600">
							{plural(plan.maxBrands, "brand")} · {plan.maxPrompts} prompts · {LADDER_ROWS[2].value(plan)} ·{" "}
							{plan.standardRunsPerDay}× a day
						</p>
					</li>
				))}
			</ul>

			<p className="border-t border-zinc-100 bg-zinc-50/70 px-6 py-3.5 text-[13px] text-zinc-600 md:px-7">
				Every tier: the full product, API and MCP access, unlimited seats.
			</p>
		</div>
	);
}

function SideCard({
	name,
	price,
	priceLabel,
	desc,
	items,
	children,
}: {
	name: string;
	price: string;
	priceLabel?: string;
	desc: string;
	items: string[];
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col rounded-2xl bg-white p-6 shadow-[0_0_0_1px_rgb(24_24_27/0.08),0_1px_2px_rgb(24_24_27/0.04)] md:p-7">
			<div className="flex items-baseline justify-between gap-4">
				<h3 className="text-lg font-semibold tracking-tight text-zinc-950">{name}</h3>
				<p className="flex items-baseline gap-1">
					<span className="text-2xl font-semibold tracking-[-0.03em] text-zinc-950 tabular-nums">{price}</span>
					{priceLabel ? <span className="text-sm text-zinc-500">{priceLabel}</span> : null}
				</p>
			</div>
			<p className="mt-1 text-sm text-zinc-600">{desc}</p>
			<ul className="mt-5 space-y-2 text-sm text-zinc-700">
				{items.map((item) => (
					<li key={item} className="flex items-start gap-2.5">
						<Check className="mt-0.5 size-4 shrink-0 text-zinc-400" strokeWidth={2.5} aria-hidden="true" />
						{item}
					</li>
				))}
			</ul>
			<div className="mt-6">{children}</div>
		</div>
	);
}

function TradeSitesQuote() {
	const { quote, author, company, companyUrl, mark } = CUSTOMER_QUOTES.tradesites;
	return (
		<figure className="mt-5 grid gap-6 rounded-2xl bg-zinc-50 p-7 shadow-[inset_4px_0_0_rgb(37_99_235)] ring-1 ring-zinc-200/80 md:grid-cols-12 md:items-center md:gap-10 md:p-9 md:pl-10">
			<blockquote className="text-pretty text-lg/[1.5] tracking-[-0.01em] text-zinc-950 md:col-span-9 md:text-xl/[1.5]">
				<span aria-hidden="true" className="-ml-2.5 text-blue-600">
					“
				</span>
				{quote}”
			</blockquote>
			<figcaption className="flex items-center justify-between gap-4 text-sm md:col-span-3 md:flex-col md:items-end">
				<span className="text-zinc-600">
					<span className="font-medium text-zinc-950">{author}</span>, {company}
				</span>
				<a
					href={companyUrl}
					target="_blank"
					rel="noopener noreferrer"
					aria-label={company}
					className="inline-flex items-center rounded-sm transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
				>
					{mark}
				</a>
			</figcaption>
		</figure>
	);
}

export function Pricing() {
	return (
		<section id="pricing" className="border-t border-zinc-200 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
					<SectionHeading
						eyebrow="Pricing"
						title={`Start at $${CLOUD_ENTRY_PRICE_USD}. Grow without a sales call.`}
						lede="Our cloud, your servers, or your brand. Every plan has the whole product; you pay for brands, prompts and platforms."
					/>
					<Link
						to="/pricing"
						className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 lg:pb-2"
					>
						Compare every plan
						<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
					</Link>
				</div>

				<div className="mt-12 grid gap-5 lg:grid-cols-12">
					<div className="lg:col-span-8">
						<CloudLadder />
					</div>
					<div className="grid gap-5 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1">
						<SideCard
							name="Self-hosted"
							price="$0"
							priceLabel="forever"
							desc="The same product on your own infrastructure."
							items={SELF_HOSTED}
						>
							<Link
								to="/docs"
								className={`${BTN} w-full bg-white text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300`}
							>
								Self-host free
								<ArrowRight className="size-3.5" aria-hidden="true" />
							</Link>
						</SideCard>
						<SideCard
							name="White label"
							price="Custom"
							desc="Offer AI visibility tracking to your clients."
							items={WHITE_LABEL}
						>
							{/* The contact form renders its own trigger; restyle it to match. */}
							<div className="[&>button]:!h-10 [&>button]:w-full [&>button]:rounded-lg [&>button]:bg-white [&>button]:!text-sm [&>button]:font-medium [&>button]:text-zinc-900 [&>button]:ring-1 [&>button]:ring-zinc-200 [&>button]:hover:bg-zinc-50">
								<ContactForm source="pricing" />
							</div>
						</SideCard>
					</div>
				</div>

				<TradeSitesQuote />
			</div>
		</section>
	);
}
