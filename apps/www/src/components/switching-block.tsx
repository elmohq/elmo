import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD, PLANS, platformTierMembers } from "@workspace/config/plans";
import { cloudSignupUrl, demoSiteUrl, type ReferralSource } from "@workspace/config/referrals";
import { buttonVariants } from "@workspace/ui/components/button";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { ELMO_VALUE_ROWS, type PlanValueRow, valueRowsForCompetitor } from "@/data/plan-value";
import type { Competitor } from "@/lib/competitors";
import { externalRel } from "@/lib/external-link";
import { PlanValueChart } from "./plan-value-chart";

const PLATFORM_NAMES = new Intl.ListFormat("en", { type: "conjunction" }).format(
	[...platformTierMembers("scraped"), ...platformTierMembers("api")].map((member) => member.label),
);

const HEADLINE_PLANS = new Set([PLANS.basic.name, PLANS.pro.name]);

function switchingPoints(name: string) {
	return [
		{
			title: "Bring your prompts",
			detail: `Paste your ${name} prompt list in at once, then let Elmo suggest the ones you are missing.`,
		},
		{ title: "Unlimited seats", detail: "Your whole team on every plan, with API and MCP access included." },
		{
			title: "Every major engine",
			detail: `Pick any ${PLANS.basic.platformPicks} of ${PLATFORM_NAMES}, each sampled ${PLANS.basic.standardRunsPerDay}× a day.`,
		},
		{
			title: "Open source, no lock-in",
			detail: "MIT-licensed. Self-host it for free whenever you like and keep every answer in your own database.",
		},
	];
}

export function SwitchingBlock({ competitor, from }: { competitor: Competitor; from: ReferralSource }) {
	const competitorRows = valueRowsForCompetitor(competitor.slug);
	const headingId = `switching-${from}`;
	return (
		<section aria-labelledby={headingId} className="border-b border-zinc-200 bg-zinc-50 py-12 lg:py-16">
			<div className="mx-auto grid max-w-6xl gap-10 px-4 md:px-6 lg:grid-cols-[1fr_1.1fr]">
				<div>
					<h2 id={headingId} className="font-heading text-3xl text-zinc-950">
						Switching from {competitor.name}?
					</h2>
					<ul className="mt-6 space-y-4">
						{switchingPoints(competitor.name).map((point) => (
							<li key={point.title} className="flex gap-3">
								<Check className="mt-1 size-4 shrink-0 text-blue-600" aria-hidden="true" />
								<p className="text-sm leading-relaxed text-zinc-600">
									<span className="font-medium text-zinc-950">{point.title}.</span> {point.detail}
								</p>
							</li>
						))}
					</ul>
					<div className="mt-8 flex flex-wrap gap-3">
						<a href={cloudSignupUrl(from)} className={buttonVariants({ size: "sm" })}>
							Start with Elmo Cloud
							<ArrowRight className="size-3.5" aria-hidden="true" />
						</a>
						<a
							href={demoSiteUrl(from)}
							target="_blank"
							rel={externalRel(demoSiteUrl(from))}
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Try the live demo
							<ArrowUpRight className="size-3.5" aria-hidden="true" />
						</a>
					</div>
				</div>

				<div className="self-start rounded-md border border-zinc-200 bg-white p-6">
					{competitorRows.length > 0 ? (
						<ValueComparison competitor={competitor} competitorRows={competitorRows} />
					) : (
						<GenericValue competitor={competitor} />
					)}
				</div>
			</div>
		</section>
	);
}

function ValueComparison({ competitor, competitorRows }: { competitor: Competitor; competitorRows: PlanValueRow[] }) {
	const elmoRows = ELMO_VALUE_ROWS.filter((row) => HEADLINE_PLANS.has(row.plan));
	const rows = [...elmoRows, ...competitorRows].sort((a, b) => a.costPer1kUsd - b.costPer1kUsd);
	return (
		<>
			<h3 className="font-heading mb-4 text-lg text-zinc-950">Cost per 1,000 answers</h3>
			<PlanValueChart rows={rows} caption={`${competitor.name} plans compared with Elmo Basic and Pro`} />
			<Link
				to="/pricing"
				hash="value"
				className="mt-4 inline-flex items-center gap-1 text-sm text-zinc-700 hover:text-zinc-950"
			>
				See every tool we priced
				<ArrowRight className="size-3.5" aria-hidden="true" />
			</Link>
		</>
	);
}

function GenericValue({ competitor }: { competitor: Competitor }) {
	const startingPrice = competitor.pricing?.startingPrice;
	return (
		<>
			<h3 className="font-heading text-lg text-zinc-950">What Elmo costs</h3>
			<dl className="mt-4 divide-y divide-zinc-100 text-sm">
				<div className="flex justify-between gap-4 py-3">
					<dt className="text-zinc-600">Elmo Cloud</dt>
					<dd className="font-medium text-zinc-950">From ${CLOUD_ENTRY_PRICE_USD}/mo</dd>
				</div>
				{startingPrice ? (
					<div className="flex justify-between gap-4 py-3">
						<dt className="text-zinc-600">{competitor.name}</dt>
						<dd className="font-medium text-zinc-950">From {startingPrice}</dd>
					</div>
				) : null}
				<div className="flex justify-between gap-4 py-3">
					<dt className="text-zinc-600">Seats</dt>
					<dd className="font-medium text-zinc-950">Unlimited on every plan</dd>
				</div>
				<div className="flex justify-between gap-4 py-3">
					<dt className="text-zinc-600">Self-hosted</dt>
					<dd className="font-medium text-zinc-950">Free and open source</dd>
				</div>
			</dl>
		</>
	);
}
