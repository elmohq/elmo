import { createFileRoute } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD, PLANS } from "@workspace/config/plans";
import { cloudAppUrl, demoSiteUrl } from "@workspace/config/referrals";
import { ArrowRight, ArrowUpRight, Check, Minus } from "lucide-react";
import { Footer } from "@/components/footer";
import { Closing } from "@/components/home/closing";
import { Faq } from "@/components/home/faq";
import { Hero } from "@/components/home/hero";
import { LogoStrip } from "@/components/home/logos";
import { ModelCoverage } from "@/components/home/models";
import { Pricing } from "@/components/home/pricing";
import { Reviews } from "@/components/home/reviews";
import { SelfHost } from "@/components/home/self-host";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { CARD, SectionHeading } from "@/components/home/ui";
import { Navbar } from "@/components/navbar";
import { externalRel } from "@/lib/external-link";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

const PATH = "/aeo-for/profound-users";
const TITLE = "The Simpler Profound Alternative";
const META_TITLE = "Profound Alternative: Simpler, Self-Serve AI Visibility · Elmo";
const META_DESCRIPTION = `Switching from Profound? Elmo tracks your brand in ChatGPT, Perplexity, Gemini and AI Overviews up to 4× daily, with no sales call, no credit packs, and API access on every plan. From $${CLOUD_ENTRY_PRICE_USD}/mo.`;
const FROM = "marketing-profound-users-hero";

const BUTTON =
	"inline-flex h-11 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const RECOMMENDED = PLANS.pro;
const FOUR_TIMES_DAILY_FROM = PLANS.basic;

const REASONS = [
	{
		name: "No bloat",
		text: "Profound grew into a suite: content generation, shopping tracking, crawler analytics. Elmo does one job, AI visibility, and every screen is about it.",
	},
	{
		name: "Not complicated",
		text: "Are we showing up, who is beating us, what changed, and what to fix. Every view answers one of those in seconds, so checking in daily is not a chore.",
	},
	{
		name: "More data for the price",
		text: `From the $${FOUR_TIMES_DAILY_FROM.monthlyPriceUsd}/mo ${FOUR_TIMES_DAILY_FROM.name} plan, Elmo asks every prompt ${FOUR_TIMES_DAILY_FROM.standardRunsPerDay}× a day. AI answers vary run to run, so more samples means numbers you can trust.`,
	},
	{
		name: "Fully self-serve",
		text: "Pick a plan, pay by card, and start tracking. There is no demo to book, no procurement cycle, and no sales rep between you and your data.",
	},
	{
		name: "No paywall maze",
		text: "No credit packs to top up and no API held back for Enterprise. Each plan is a number of brands, prompts, and platforms, and the rest of the product comes with it.",
	},
];

// What tryprofound.com/pricing listed as of October 2026: a 7-day trial, then Enterprise through sales.
const COMPARISON: { label: string; elmo: string; profound: string; profoundHas?: boolean }[] = [
	{
		label: "Getting started",
		elmo: `Sign up and pay by card, from $${CLOUD_ENTRY_PRICE_USD}/mo`,
		profound: "7-day trial, then a call with sales",
	},
	{ label: "Published pricing", elmo: "Every plan, on the pricing page", profound: "Enterprise is custom-quoted" },
	{
		label: "How often answers are checked",
		elmo: `Up to ${FOUR_TIMES_DAILY_FROM.standardRunsPerDay}× daily`,
		profound: "Daily",
		profoundHas: true,
	},
	{ label: "API and MCP access", elmo: "Every plan", profound: "API on Enterprise only" },
	{
		label: "Usage credits",
		elmo: "None. Plans are priced by prompts and platforms",
		profound: "Credit allotments, more via sales",
	},
	{ label: "Unlimited seats", elmo: "Every plan", profound: "Yes", profoundHas: true },
	{ label: "Open source and self-hostable", elmo: "MIT-licensed, self-host free", profound: "Closed, hosted only" },
];

const STEPS = [
	{
		name: "Create an account",
		text: "Sign up and choose a plan. No call, no contract, cancel any time.",
	},
	{
		name: "Paste your prompt list",
		text: "Copy the prompts you track in Profound and paste them in, one per line. Duplicates are skipped for you.",
	},
	{
		name: "Add your competitors",
		text: "Name the rivals you benchmark against, and Elmo tracks their share of voice and citations next to yours.",
	},
];

const FAQS = [
	{
		question: "Do I need to talk to sales to use Elmo?",
		answer: `No. Every Elmo Cloud plan is self-serve: sign up, pay by card, and start tracking. Plans start at $${CLOUD_ENTRY_PRICE_USD}/mo, and you can change or cancel from the billing page. A tour is available if you want one, but it is never required.`,
	},
	{
		question: "Can I bring my prompts over from Profound?",
		answer:
			"Yes. Paste your existing prompt list into Elmo, one prompt per line, and it is tracked from then on. Your Profound history stays in Profound, so most teams run both for a short overlap before cancelling.",
	},
	{
		question: "Is Elmo's data comparable to Profound's?",
		answer: `Both track how AI engines answer your buyers' prompts. Elmo checks each prompt up to ${FOUR_TIMES_DAILY_FROM.standardRunsPerDay}× a day rather than once, which smooths out the run-to-run variation in AI answers, and every metric is computed by open-source code you can read.`,
	},
	{
		question: "Which Elmo plan matches a Profound setup?",
		answer: `Most teams coming from Profound choose ${RECOMMENDED.name}: ${RECOMMENDED.maxPrompts} prompts across ${RECOMMENDED.platformPicks} AI platforms, checked ${RECOMMENDED.standardRunsPerDay}× daily, with premium grounded models included, for $${RECOMMENDED.monthlyPriceUsd}/mo. Larger programs can step up to ${PLANS.business.name} or self-host Elmo for free.`,
	},
];

export const Route = createFileRoute("/aeo-for/profound-users")({
	head: () => ({
		meta: [
			{ title: META_TITLE },
			{ name: "description", content: META_DESCRIPTION },
			...ogMeta({ title: META_TITLE, description: META_DESCRIPTION, path: PATH }),
		],
		links: [{ rel: "canonical", href: canonicalUrl(PATH) }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "AEO by industry", path: "/aeo-for" },
				{ name: TITLE, path: PATH },
			]),
			faqJsonLd(FAQS),
		],
	}),
	component: ProfoundUsersPage,
});

function Badge() {
	return (
		<span className="inline-flex h-7 items-center gap-2 rounded-full bg-white/80 px-3 text-xs font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200">
			<span className="size-1.5 rounded-full bg-blue-600" />
			For Profound users
		</span>
	);
}

function Reasons() {
	const cloudUrl = cloudAppUrl(FROM);
	return (
		<section className="border-t border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					title="Everything you check in Profound, without the rest."
					lede="Teams switch to Elmo when the tool they bought for a weekly visibility number turns into a suite, a sales process, and a credit balance."
				/>
				<ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{REASONS.map((r) => (
						<li key={r.name} className={`p-6 ${CARD}`}>
							<p className="text-lg font-semibold tracking-[-0.015em] text-zinc-950">{r.name}</p>
							<p className="mt-2 text-pretty text-[15px]/6 text-zinc-600">{r.text}</p>
						</li>
					))}
					<li className="flex flex-col justify-between gap-6 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white">
						<div>
							<p className="text-lg font-semibold tracking-[-0.015em]">Try it on your own brand</p>
							<p className="mt-2 text-pretty text-[15px]/6 text-blue-50">
								Plans start at ${CLOUD_ENTRY_PRICE_USD}/mo. You can be tracking your Profound prompt set in minutes.
							</p>
						</div>
						<a href={cloudUrl} className={`${BUTTON} self-start bg-white text-blue-700 hover:bg-blue-50`}>
							Get started
							<ArrowRight className="size-4" aria-hidden="true" />
						</a>
					</li>
				</ul>
			</div>
		</section>
	);
}

function Comparison() {
	return (
		<section className="border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					title="Elmo and Profound, side by side."
					lede="How the two compare on the things that decide what you pay and how quickly you get going."
				/>
				<div className={`mt-12 overflow-x-auto ${CARD}`}>
					<table className="w-full min-w-[40rem] text-left text-[15px]">
						<thead>
							<tr className="border-b border-zinc-100 text-[13px] font-medium text-zinc-500">
								<th scope="col" className="px-6 py-4 font-medium">
									<span className="sr-only">Feature</span>
								</th>
								<th scope="col" className="px-6 py-4 font-semibold text-blue-600">
									Elmo
								</th>
								<th scope="col" className="px-6 py-4 font-medium">
									Profound
								</th>
							</tr>
						</thead>
						<tbody>
							{COMPARISON.map((row) => (
								<tr key={row.label} className="border-b border-zinc-100 last:border-0">
									<th scope="row" className="px-6 py-4 font-medium text-zinc-950">
										{row.label}
									</th>
									<td className="px-6 py-4 text-zinc-900">
										<span className="flex items-start gap-2">
											<Check className="mt-0.5 size-4 shrink-0 text-blue-600" strokeWidth={2.5} aria-hidden="true" />
											{row.elmo}
										</span>
									</td>
									<td className="px-6 py-4 text-zinc-600">
										<span className="flex items-start gap-2">
											{row.profoundHas ? (
												<Check className="mt-0.5 size-4 shrink-0 text-zinc-400" strokeWidth={2.5} aria-hidden="true" />
											) : (
												<Minus className="mt-0.5 size-4 shrink-0 text-zinc-300" strokeWidth={2.5} aria-hidden="true" />
											)}
											{row.profound}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
				<p className="mt-4 text-[13px] text-zinc-500">
					Profound details are from its public pricing page as of October 2026 and may have changed since.
				</p>
			</div>
		</section>
	);
}

function Switching() {
	const cloudUrl = cloudAppUrl(FROM);
	const demoUrl = demoSiteUrl(FROM);
	return (
		<section className="border-t border-zinc-200/80 bg-zinc-50/70">
			<div className="mx-auto max-w-6xl px-4 py-20 md:px-6 lg:py-28">
				<SectionHeading
					title="Switch in an afternoon."
					lede={`Bring the prompts you already track, and Elmo starts checking them up to ${FOUR_TIMES_DAILY_FROM.standardRunsPerDay}× a day across the engines you pick.`}
				/>
				<ol className="mt-12 grid gap-4 md:grid-cols-3">
					{STEPS.map((step, i) => (
						<li key={step.name} className={`p-6 ${CARD}`}>
							<p className="flex items-center gap-2.5 text-lg font-semibold tracking-[-0.015em] text-zinc-950">
								<span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white tabular-nums">
									{i + 1}
								</span>
								{step.name}
							</p>
							<p className="mt-2 text-pretty text-[15px]/6 text-zinc-600">{step.text}</p>
						</li>
					))}
				</ol>
				<div className="mt-8 flex flex-col gap-3 sm:flex-row">
					<a href={cloudUrl} className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}>
						Start tracking
						<ArrowRight className="size-4" aria-hidden="true" />
					</a>
					<a
						href={demoUrl}
						target="_blank"
						rel={externalRel(demoUrl)}
						className={`${BUTTON} bg-white text-zinc-950 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300`}
					>
						Try the live demo
						<ArrowUpRight className="size-4" aria-hidden="true" />
					</a>
				</div>
			</div>
		</section>
	);
}

function ProfoundUsersPage() {
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen bg-white antialiased`}>
			<HomeStyles />
			<Navbar />
			<main>
				<Hero
					badge={<Badge />}
					title={TITLE}
					lede={`Everything you check in Profound, sampled up to ${FOUR_TIMES_DAILY_FROM.standardRunsPerDay}× as often, at a price you can see and pay by card today. No sales call, no credit packs, and nothing held back for Enterprise.`}
					from={FROM}
				/>
				<LogoStrip />
				<Reasons />
				<Comparison />
				<Reviews />
				<Switching />
				<ModelCoverage />
				<Pricing
					lede={`Most teams coming from Profound choose ${RECOMMENDED.name}: ${RECOMMENDED.maxPrompts} prompts across ${RECOMMENDED.platformPicks} AI platforms, checked ${RECOMMENDED.standardRunsPerDay}× daily, for $${RECOMMENDED.monthlyPriceUsd}/mo. Unlimited seats on every plan.`}
					recommended={{ plan: RECOMMENDED.key, label: "Best for Profound users" }}
				/>
				<SelfHost />
				<Faq items={FAQS} />
				<Closing from="marketing-profound-users-closing" />
			</main>
			<Footer />
		</div>
	);
}
