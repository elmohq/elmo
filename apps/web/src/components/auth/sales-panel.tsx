/**
 * The pitch shown beside the sign-in and sign-up forms in local and cloud mode.
 *
 * Sign-in is the highest-intent page either deployment has, so it carries the
 * argument for the product rather than just a card on an empty background: what
 * Elmo does, which engines it reaches, who already runs it, and — for a
 * self-hosted instance — that a managed option exists.
 *
 * Demo and whitelabel deliberately never see this. A demo visitor has already
 * decided to look, and a whitelabel tenant is not ours to sell to.
 */

import { IconCheck } from "@tabler/icons-react";
import { CLOUD_ENTRY_PRICE_USD, PLANS, platformTierMembers, STANDARD_PLATFORM_MENU } from "@workspace/config/plans";
import {
	bookDemoUrl,
	cloudPricingUrl,
	cloudSignupUrl,
	marketingUrl,
	type ReferralSource,
} from "@workspace/config/referrals";
import { CUSTOMER_QUOTES, VECTOR_CUSTOMERS } from "@workspace/ui/brand/customers";
import { G2Rating } from "@workspace/ui/brand/g2-rating";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { buttonVariants } from "@workspace/ui/components/button";
import type { ReactNode } from "react";

/** Everything Elmo reaches, named — the coverage claim is the product. */
const ENGINES = [...platformTierMembers("scraped"), ...platformTierMembers("api")];

const ENGINE_COUNT = STANDARD_PLATFORM_MENU.length;

interface Stat {
	value: string;
	label: string;
}

interface Pitch {
	eyebrow: string;
	headline: string;
	subhead: string;
	bullets: string[];
	stats: Stat[];
}

const CLOUD_PITCH: Pitch = {
	eyebrow: "AI Visibility",
	headline: "Know how AI talks about your brand.",
	subhead:
		"Elmo watches what ChatGPT, Google AI Overviews, Perplexity, and Gemini say when someone asks about your category — and tells you why they said it.",
	bullets: [
		"Read every answer AI gives about you, in full",
		"Benchmark share of voice against your competitors",
		"See which citations are moving your visibility",
	],
	stats: [
		{ value: String(ENGINE_COUNT), label: "engines tracked" },
		{ value: `${PLANS.basic.standardRunsPerDay}×`, label: "sampled daily" },
		{ value: `$${CLOUD_ENTRY_PRICE_USD}`, label: "per month to start" },
	],
};

const SELF_HOSTED_PITCH: Pitch = {
	eyebrow: "Self-Hosted",
	headline: "Your AI visibility, on your own infrastructure.",
	subhead:
		"Elmo watches what ChatGPT, Google AI Overviews, Perplexity, and Gemini say about your brand. This instance is yours — your database, your keys, your data.",
	bullets: [
		"Unlimited prompts, brands, and seats",
		"Bring your own model and scraper keys",
		"MIT licensed — read it, change it, fork it",
	],
	stats: [
		{ value: String(ENGINE_COUNT), label: "engines you can track" },
		{ value: "$0", label: "self-hosted, forever" },
		{ value: "MIT", label: "open source license" },
	],
};

type SalesPanelVariant = "cloud" | "self-hosted";

export function SalesPanel({ variant, source }: { variant: SalesPanelVariant; source: ReferralSource }) {
	const pitch = variant === "cloud" ? CLOUD_PITCH : SELF_HOSTED_PITCH;
	const quote = CUSTOMER_QUOTES.speakeasy;

	return (
		<div className="mx-auto flex w-full max-w-lg flex-col gap-8">
			<div>
				<G2Rating className="text-muted-foreground" />
				<p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
					/ {pitch.eyebrow}
				</p>
				<h2 className="mt-4 text-3xl font-semibold leading-[1.1] tracking-tight text-balance">{pitch.headline}</h2>
				<p className="mt-4 text-pretty text-sm text-muted-foreground md:text-base">{pitch.subhead}</p>
			</div>

			<ul className="space-y-2.5">
				{pitch.bullets.map((bullet) => (
					<li key={bullet} className="flex items-start gap-2.5 text-sm">
						<IconCheck className="mt-0.5 size-4 shrink-0 text-primary" />
						<span>{bullet}</span>
					</li>
				))}
			</ul>

			<dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
				{pitch.stats.map((stat) => (
					<div key={stat.label} className="bg-card px-3 py-3">
						<dt className="sr-only">{stat.label}</dt>
						<dd>
							<span className="block text-xl font-semibold tabular-nums">{stat.value}</span>
							<span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">{stat.label}</span>
						</dd>
					</div>
				))}
			</dl>

			<EngineStrip />

			{variant === "self-hosted" ? <CloudOffer source={source} /> : <DemoOffer source={source} />}

			<Proof quote={quote} />
		</div>
	);
}

/** The coverage claim, spelled out. Names sit beside logos because three Google surfaces share a mark. */
function EngineStrip() {
	return (
		<div>
			<p className="font-mono text-[10px] uppercase leading-none tracking-[0.2em] text-muted-foreground">Tracking</p>
			<ul className="mt-3 flex flex-wrap gap-1.5">
				{ENGINES.map((engine) => (
					<li
						key={engine.model}
						className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[11px] leading-none"
					>
						<ModelIcon iconId={engine.iconId} className="size-3 shrink-0 text-muted-foreground" />
						{engine.label}
					</li>
				))}
			</ul>
		</div>
	);
}

/**
 * Shown only to a self-hosted operator: the same product, managed. Someone at a
 * self-hosted sign-in screen has already chosen to run it themselves, so this
 * argues the part they haven't priced — provider accounts, keys, and uptime —
 * rather than repeating the feature list they just read.
 */
function CloudOffer({ source }: { source: ReferralSource }) {
	return (
		<div className="rounded-lg border bg-card p-5">
			<h3 className="text-sm font-semibold">Would you rather not run this yourself?</h3>
			<p className="mt-2 text-sm text-muted-foreground">
				Elmo Cloud is the same open-source product, hosted by us. Scraper and model access is included, so there are no
				provider accounts to open, no keys to rotate, and no server to keep up.
			</p>
			<p className="mt-3 text-sm">
				<span className="font-semibold">From ${CLOUD_ENTRY_PRICE_USD}/mo</span>
				<span className="text-muted-foreground"> · unlimited seats · cancel anytime</span>
			</p>
			<div className="mt-4 flex flex-wrap items-center gap-2">
				<a href={cloudSignupUrl(source)} className={buttonVariants({ size: "sm" })}>
					Try Elmo Cloud
				</a>
				<a href={bookDemoUrl(source)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
					Book a demo
				</a>
			</div>
		</div>
	);
}

/**
 * The other way in, for someone who would rather be shown than sign up. Sits
 * where the self-hosted panel argues for Cloud: both are the secondary ask.
 */
function DemoOffer({ source }: { source: ReferralSource }) {
	return (
		<div className="rounded-lg border bg-card p-5">
			<h3 className="text-sm font-semibold">Rather see it before you sign up?</h3>
			<p className="mt-2 text-sm text-muted-foreground">
				Thirty minutes with the team that builds Elmo, to talk through what you want to track and whether we are the
				right fit for it.
			</p>
			<div className="mt-4">
				<a href={bookDemoUrl(source)} className={buttonVariants({ variant: "outline", size: "sm" })}>
					Book a demo
				</a>
			</div>
		</div>
	);
}

function Proof({ quote }: { quote: (typeof CUSTOMER_QUOTES)[keyof typeof CUSTOMER_QUOTES] }) {
	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center gap-x-5 gap-y-3">
				<p className="flex h-5 items-center font-mono text-[10px] uppercase leading-none tracking-[0.2em] text-muted-foreground">
					Trusted by
				</p>
				<ul className="flex flex-wrap items-center gap-x-5 gap-y-3">
					{VECTOR_CUSTOMERS.map((customer) => (
						<li key={customer.name} className="flex h-5 items-center">
							<a
								href={customer.url}
								target="_blank"
								rel={customer.nofollow ? "nofollow noopener noreferrer" : "noopener noreferrer"}
								aria-label={customer.name}
								className="flex h-5 items-center text-muted-foreground transition-colors hover:text-foreground"
							>
								{customer.mark}
							</a>
						</li>
					))}
				</ul>
			</div>

			<figure className="rounded-lg border bg-card p-5">
				<blockquote className="text-pretty text-sm font-medium leading-relaxed">“{quote.quote}”</blockquote>
				<figcaption className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					<span className="font-semibold text-foreground">{quote.author}</span>
					<span>at</span>
					<a
						href={quote.companyUrl}
						target="_blank"
						rel="noopener noreferrer"
						aria-label={quote.company}
						className="inline-flex items-center text-foreground transition-opacity hover:opacity-80"
					>
						{quote.mark}
					</a>
				</figcaption>
			</figure>
		</div>
	);
}

/** Small print under the form: where to read more before committing. */
export function SalesFooterLinks({ source }: { source: ReferralSource }): ReactNode {
	const linkClass = "hover:text-foreground";
	return (
		<p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
			<a href={marketingUrl("/docs", source)} className={linkClass}>
				Docs
			</a>
			<a href={cloudPricingUrl(source)} className={linkClass}>
				Pricing
			</a>
			<a href="https://github.com/elmohq/elmo" target="_blank" rel="noopener noreferrer" className={linkClass}>
				GitHub
			</a>
		</p>
	);
}
