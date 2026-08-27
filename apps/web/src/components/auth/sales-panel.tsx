/**
 * The pitch shown beside the sign-in and sign-up forms in local and cloud mode.
 *
 * Sign-in is the highest-intent page either deployment has, so it carries the
 * argument for the product rather than just a card on an empty background: what
 * Elmo does, which engines it reaches, and — for a self-hosted instance — that
 * a managed option exists.
 *
 * Demo and whitelabel deliberately never see this. A demo visitor has already
 * decided to look, and a whitelabel tenant is not ours to sell to.
 */

import { IconCheck } from "@tabler/icons-react";
import { CLOUD_ENTRY_PRICE_USD, PLANS, platformTierMembers } from "@workspace/config/plans";
import {
	bookDemoUrl,
	cloudPricingUrl,
	cloudSignupUrl,
	demoSiteUrl,
	marketingUrl,
	type ReferralSource,
} from "@workspace/config/referrals";
import { CUSTOMER_QUOTES } from "@workspace/ui/brand/customers";
import { G2Stars } from "@workspace/ui/brand/g2-rating";
import { ModelIcon } from "@workspace/ui/brand/model-icon";
import { buttonVariants } from "@workspace/ui/components/button";
import type { ReactNode } from "react";

/** Everything Elmo reaches, named — the coverage claim is the product. */
const ENGINES = [...platformTierMembers("scraped"), ...platformTierMembers("api")];

/** The comparison the pricing rests on, kept in step with what a plan actually samples. */
const RUNS_PER_DAY = PLANS.basic.standardRunsPerDay;

interface Pitch {
	headline: string;
	bullets: string[];
}

const CLOUD_PITCH: Pitch = {
	headline: "Know how AI talks about your brand.",
	bullets: [
		"Track your AI visibility on any model",
		"Benchmark against your competitors",
		"Analyze citations to find opportunities",
		`${RUNS_PER_DAY}× Profound's daily runs, same price`,
	],
};

const SELF_HOSTED_PITCH: Pitch = {
	headline: "Your AI visibility, on your own infrastructure.",
	bullets: [
		"Track your AI visibility on any model",
		"Unlimited prompts, brands, and seats",
		"Bring your own model and scraper keys",
		"MIT licensed — read it, change it, fork it",
	],
};

type SalesPanelVariant = "cloud" | "self-hosted";

export function SalesPanel({ variant, source }: { variant: SalesPanelVariant; source: ReferralSource }) {
	const pitch = variant === "cloud" ? CLOUD_PITCH : SELF_HOSTED_PITCH;

	return (
		<div className="mx-auto flex w-full max-w-lg flex-col gap-8">
			<h2 className="text-3xl font-semibold leading-[1.1] tracking-tight text-balance">{pitch.headline}</h2>

			<ul className="space-y-2.5">
				{pitch.bullets.map((bullet) => (
					<li key={bullet} className="flex items-start gap-2.5 text-sm">
						<IconCheck className="mt-0.5 size-4 shrink-0 text-primary" />
						<span>{bullet}</span>
					</li>
				))}
			</ul>

			{/* After our own claims, not before: a customer backing them up reads as
			    corroboration, where opening with it reads as decoration. */}
			<Quote />

			<EngineStrip />

			{variant === "self-hosted" ? <CloudOffer source={source} /> : <TryBeforeYouBuy source={source} />}
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
			<h3 className="text-sm font-semibold">Same Elmo, managed for you.</h3>
			<p className="mt-2 text-sm text-muted-foreground">
				Don't worry about API keys, spend tracking, infrastructure, and updates. Plans start from $
				{CLOUD_ENTRY_PRICE_USD}/mo.
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
 * The two ways to see Elmo without an account, offered as a genuine either/or —
 * poke at it alone, or have someone walk you through it.
 *
 * The question and its two answers read as one sentence, so they share a line
 * wherever the panel is wide enough to hold them, and wrap together when not.
 */
function TryBeforeYouBuy({ source }: { source: ReferralSource }) {
	return (
		<div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-card p-5">
			<h3 className="text-sm font-semibold">Try before you buy?</h3>
			<div className="flex flex-wrap items-center gap-3">
				<a
					href={demoSiteUrl(source)}
					target="_blank"
					rel="noopener"
					className={buttonVariants({ variant: "outline", size: "sm" })}
				>
					Live Demo
				</a>
				<span className="text-xs text-muted-foreground">or</span>
				<a href={bookDemoUrl(source)} className={buttonVariants({ variant: "outline", size: "sm" })}>
					Talk to Us
				</a>
			</div>
		</div>
	);
}

function Quote() {
	const quote = CUSTOMER_QUOTES.speakeasy;
	return (
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
	);
}

/**
 * The bottom of the form column: where to read more on the left, and the G2
 * rating in the corner. The rating doesn't link out — this is the one page
 * where sending someone away costs a signup.
 */
export function SalesFooterLinks({ source }: { source: ReferralSource }): ReactNode {
	const linkClass = "hover:text-foreground";
	return (
		<div className="flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-2">
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
			<G2Stars />
		</div>
	);
}
