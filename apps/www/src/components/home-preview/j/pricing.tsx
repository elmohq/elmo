import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD, CLOUD_SIGNUP_URL, PLAN_KEYS, PLANS } from "@workspace/config/plans";
import { ArrowRight } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { SectionHeading } from "./ui";

interface Option {
	id: string;
	name: string;
	price: string;
	unit: string;
	desc: string;
	points: string[];
	cta: "cloud" | "self-host" | "contact";
	featured?: boolean;
}

const options: Option[] = [
	{
		id: "self-hosted",
		name: "Self-hosted",
		price: "$0",
		unit: "forever",
		desc: "The whole product on your own servers, with your own scraper and model keys.",
		points: ["Unlimited prompts", "Any model, incl. OpenRouter", "Runs on your own infrastructure"],
		cta: "self-host",
	},
	{
		id: "cloud",
		name: "Cloud",
		price: `$${CLOUD_ENTRY_PRICE_USD}`,
		unit: "/mo and up",
		desc: "We host it, update it, and pay the scraping bills.",
		points: ["API access on every plan", "Unlimited seats on every plan", "Scraped up to 4× daily from Basic"],
		cta: "cloud",
		featured: true,
	},
	{
		id: "white-label",
		name: "White label",
		price: "Custom",
		unit: "",
		desc: "Offer AI visibility tracking to your clients under your brand.",
		points: ["Everything in Cloud", "Custom branding and domain", "SSO and a shared Slack channel"],
		cta: "contact",
	},
];

const BTN =
	"inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

function OptionCta({ option }: { option: Option }) {
	if (option.cta === "cloud") {
		return (
			<a href={CLOUD_SIGNUP_URL} className={`${BTN} bg-blue-600 text-white hover:bg-blue-700`}>
				Start with Cloud
				<ArrowRight className="size-3.5" aria-hidden="true" />
			</a>
		);
	}
	if (option.cta === "self-host") {
		return (
			<Link to="/docs" className={`${BTN} bg-white text-[#1c1a17] ring-1 ring-[#1c1a17]/20 hover:ring-[#1c1a17]/40`}>
				Self-host free
				<ArrowRight className="size-3.5" aria-hidden="true" />
			</Link>
		);
	}
	// The contact form renders its own trigger; restyle it to match the secondary button.
	return (
		<div className="[&>button]:!h-10 [&>button]:w-full [&>button]:rounded-md [&>button]:bg-white [&>button]:!text-sm [&>button]:font-medium [&>button]:text-[#1c1a17] [&>button]:ring-1 [&>button]:ring-[#1c1a17]/20 [&>button]:hover:ring-[#1c1a17]/40">
			<ContactForm source="pricing" />
		</div>
	);
}

function platformsLine(key: (typeof PLAN_KEYS)[number]) {
	const plan = PLANS[key];
	if (plan.platformMenu.length === 1) return "ChatGPT";
	return `Any ${plan.platformPicks} of ${plan.platformMenu.length}`;
}

/** Every Cloud tier, read straight from the plan catalog so the page can't drift from billing. */
function TierLadder() {
	return (
		<>
			<ul className="divide-y divide-[#1c1a17]/10 border-y border-[#1c1a17]/15 sm:hidden">
				{PLAN_KEYS.map((key) => {
					const plan = PLANS[key];
					return (
						<li key={key} className="py-3 text-[13.5px]">
							<p className="flex items-baseline justify-between font-medium text-[#1c1a17]">
								<span>{plan.name}</span>
								<span className="tabular-nums">${plan.monthlyPriceUsd}/mo</span>
							</p>
							<p className="mt-0.5 text-stone-600 tabular-nums">
								{plan.maxPrompts} prompts · {plan.maxBrands} {plan.maxBrands === 1 ? "brand" : "brands"} ·{" "}
								{platformsLine(key)} · {plan.standardRunsPerDay}×/day
							</p>
						</li>
					);
				})}
			</ul>
			<div className="hidden overflow-x-auto sm:block">
				<table className="w-full min-w-[40rem] border-collapse text-left text-[13.5px]">
					<caption className="sr-only">Elmo Cloud plans</caption>
					<thead>
						<tr className="border-b border-[#1c1a17]/15 font-mono text-[10.5px] uppercase tracking-[0.14em] text-stone-600">
							<th scope="col" className="py-3 pr-4 font-normal">
								Cloud plan
							</th>
							<th scope="col" className="py-3 pr-4 font-normal">
								Per month
							</th>
							<th scope="col" className="py-3 pr-4 font-normal">
								Prompts
							</th>
							<th scope="col" className="py-3 pr-4 font-normal">
								Brands
							</th>
							<th scope="col" className="py-3 pr-4 font-normal">
								Platforms
							</th>
							<th scope="col" className="py-3 pr-4 font-normal">
								Samples / day
							</th>
							<th scope="col" className="py-3 font-normal">
								Grounded slots
							</th>
						</tr>
					</thead>
					<tbody className="tabular-nums text-stone-700">
						{PLAN_KEYS.map((key) => {
							const plan = PLANS[key];
							return (
								<tr key={key} className="border-b border-[#1c1a17]/8 last:border-b-0">
									<th scope="row" className="py-3 pr-4 font-medium text-[#1c1a17]">
										{plan.name}
									</th>
									<td className="py-3 pr-4 font-medium text-[#1c1a17]">${plan.monthlyPriceUsd}</td>
									<td className="py-3 pr-4">{plan.maxPrompts}</td>
									<td className="py-3 pr-4">{plan.maxBrands}</td>
									<td className="py-3 pr-4">{platformsLine(key)}</td>
									<td className="py-3 pr-4">{plan.standardRunsPerDay}×</td>
									<td className="py-3">{plan.premiumIncluded || "—"}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</>
	);
}

// Only facts recorded from each vendor's public pricing page; keep in step with /ai-visibility-tools/compare.
const FACTS = [
	{
		k: "Lowest public price",
		elmo: `$${CLOUD_ENTRY_PRICE_USD}/mo (ChatGPT, 1× a day)`,
		others: "Peec AI and Promptwatch $95/mo; Profound not published",
	},
	{ k: "API access", elmo: "Every plan", others: "Peec AI and Profound: Enterprise only" },
	{ k: "Seats", elmo: "Unlimited on every plan", others: "Promptwatch 1 on its $95 plan; SE Ranking 1 on Core" },
	{
		k: "Claude and Perplexity",
		elmo: `From Basic, $${PLANS.basic.monthlyPriceUsd}/mo`,
		others: "Peec AI: Enterprise only",
	},
	{ k: "Sampling", elmo: "Up to 4× a day, from Basic", others: "Peec AI: daily" },
	{ k: "Self-hosting", elmo: "Free, open source", others: "Not listed" },
];

function Facts() {
	return (
		<div className="mt-16 grid gap-8 lg:grid-cols-12 lg:gap-12">
			<div className="lg:col-span-4">
				<h3 className="text-xl font-semibold tracking-[-0.02em] text-[#1c1a17]">What's included, side by side.</h3>
				<p className="mt-3 text-pretty text-sm/6 text-stone-600">
					Based on public pricing pages, Sept 2026.{" "}
					<Link
						to="/ai-visibility-tools/compare"
						className="rounded-sm font-medium text-blue-700 underline decoration-blue-600/30 underline-offset-4 hover:decoration-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
					>
						Compare tools in detail
					</Link>
					.
				</p>
			</div>
			<div className="lg:col-span-8">
				<div
					aria-hidden="true"
					className="hidden gap-6 border-b border-[#1c1a17]/15 pb-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-stone-500 sm:grid sm:grid-cols-[11rem_1fr_1fr]"
				>
					<span />
					<span className="text-blue-700">Elmo</span>
					<span>Elsewhere</span>
				</div>
				<dl className="divide-y divide-[#1c1a17]/10 border-b border-[#1c1a17]/15 max-sm:border-t">
					{FACTS.map((f) => (
						<div key={f.k} className="grid gap-1 py-3.5 text-[14px] sm:grid-cols-[11rem_1fr_1fr] sm:gap-6">
							<dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-stone-600 sm:pt-0.5">{f.k}</dt>
							<dd className="font-medium text-[#1c1a17]">
								<span className="text-blue-700 sm:sr-only">Elmo: </span>
								{f.elmo}
							</dd>
							<dd className="text-stone-600">
								<span className="sm:sr-only">Elsewhere: </span>
								{f.others}
							</dd>
						</div>
					))}
				</dl>
			</div>
		</div>
	);
}

export function Pricing() {
	return (
		<section id="pricing">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					n="§ 04"
					label="Pricing"
					title="Prices on the page. Method in the repo."
					lede="The same open-source product, three ways to run it. You don't need a sales call to find out what it costs."
				/>

				<div className="mt-12 grid overflow-hidden rounded-xl bg-white ring-1 ring-[#1c1a17]/15 md:grid-cols-3">
					{options.map((o) => (
						<div
							key={o.id}
							className={`relative flex flex-col border-[#1c1a17]/12 p-7 ${o.featured ? "max-md:order-first" : ""} max-md:border-b max-md:last:border-b-0 md:border-r md:last:border-r-0 ${o.featured ? "bg-[#fdfcf9]" : ""}`}
						>
							{o.featured ? <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px] bg-blue-600" /> : null}
							<div className="flex items-center justify-between">
								<h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-stone-600">{o.name}</h3>
								{o.featured ? (
									<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-blue-700">Recommended</span>
								) : null}
							</div>
							<p className="mt-5 flex items-baseline gap-2">
								<span className="text-[3.5rem] font-semibold leading-none tracking-[-0.045em] text-[#1c1a17] tabular-nums">
									{o.price}
								</span>
								{o.unit ? <span className="text-sm text-stone-600">{o.unit}</span> : null}
							</p>
							<p className="mt-4 min-h-[3rem] text-pretty text-sm/6 text-stone-600">{o.desc}</p>
							<ul className="mt-5 flex-1 space-y-2 border-t border-[#1c1a17]/10 pt-5 text-[13.5px] text-stone-700">
								{o.points.map((p) => (
									<li key={p} className="flex gap-2.5">
										<span aria-hidden="true" className="mt-[9px] h-px w-3 shrink-0 bg-blue-600" />
										{p}
									</li>
								))}
							</ul>
							<div className="mt-7">
								<OptionCta option={o} />
							</div>
						</div>
					))}
				</div>

				<div className="mt-10">
					<TierLadder />
					<p className="mt-4 text-sm text-stone-600">
						Annual billing gets two months free. Grounded slots run GPT-5 Search, Claude and Grok with their own web
						search.{" "}
						<Link
							to="/pricing"
							className="group inline-flex items-center gap-1 rounded-sm font-medium text-blue-700 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
						>
							Every plan in detail
							<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
						</Link>
					</p>
				</div>

				<Facts />
			</div>
		</section>
	);
}
