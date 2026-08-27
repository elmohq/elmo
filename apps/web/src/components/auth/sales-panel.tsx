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

import { IconCheck, IconCloud, IconEye } from "@tabler/icons-react";
import { PLANS, platformTierMembers } from "@workspace/config/plans";
import {
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

const GITHUB_URL = "https://github.com/elmohq/elmo";

/** The comparison the pricing rests on, kept in step with what a plan actually samples. */
const RUNS_PER_DAY = PLANS.basic.standardRunsPerDay;

interface Bullet {
	/** Doubles as the list key. */
	text: string;
	/** Set where the bullet is an invitation rather than a statement. */
	href?: string;
}

interface Pitch {
	headline: string;
	bullets: Bullet[];
}

const CLOUD_PITCH: Pitch = {
	headline: "Be the brand AI recommends.",
	bullets: [
		{ text: "Track your AI visibility on any model" },
		{ text: "Benchmark against your competitors" },
		{ text: "Analyze citations to find opportunities" },
		{ text: `${RUNS_PER_DAY}× Profound's daily runs, same price` },
	],
};

const SELF_HOSTED_PITCH: Pitch = {
	headline: "Self-host your AEO.",
	bullets: [
		{ text: "Track your AI visibility on any model" },
		{ text: "Unlimited prompts, brands, and seats" },
		{ text: "Bring your own model and scraper keys" },
		{ text: "Please star us on GitHub!", href: GITHUB_URL },
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
					<li key={bullet.text} className="flex items-start gap-2.5 text-sm">
						<IconCheck className="mt-0.5 size-4 shrink-0 text-primary" />
						{bullet.href ? (
							<a
								href={bullet.href}
								target="_blank"
								rel="noopener noreferrer"
								className="underline underline-offset-2 hover:opacity-80"
							>
								{bullet.text}
							</a>
						) : (
							<span>{bullet.text}</span>
						)}
					</li>
				))}
			</ul>

			{/* After our own claims, not before: a customer backing them up reads as
			    corroboration, where opening with it reads as decoration. */}
			<Quote />

			<EngineStrip />

			<OfferCard
				question={variant === "self-hosted" ? "Don't want to self-host?" : "Try before you buy?"}
				offer={variant === "self-hosted" ? cloudOffer(source) : demoOffer(source)}
			/>
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

interface Offer {
	label: string;
	href: string;
	icon: typeof IconEye;
	/** Somewhere to look around rather than a conversion — worth keeping this page open for. */
	newTab?: boolean;
}

const demoOffer = (source: ReferralSource): Offer => ({
	label: "View Demo",
	href: demoSiteUrl(source),
	icon: IconEye,
	newTab: true,
});

const cloudOffer = (source: ReferralSource): Offer => ({
	label: "Try Elmo Cloud",
	href: cloudSignupUrl(source),
	icon: IconCloud,
});

/**
 * The secondary ask, in whichever form the deployment calls for: a way to see
 * Elmo before signing up, or the managed option for someone already running it.
 *
 * One way out, not a menu. The question and its answer are a single exchange,
 * so they share a line — the question anchored left, the answer right — and
 * wrap together when the panel is too narrow to hold both.
 */
function OfferCard({ question, offer }: { question: string; offer: Offer }) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border bg-card p-5">
			<h3 className="text-sm font-semibold">{question}</h3>
			<a
				href={offer.href}
				className={buttonVariants({ variant: "ghost", size: "sm" })}
				{...(offer.newTab ? { target: "_blank", rel: "noopener" } : {})}
			>
				<offer.icon className="size-4" />
				{offer.label}
			</a>
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
				<a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
					GitHub
				</a>
			</p>
			<G2Stars />
		</div>
	);
}
