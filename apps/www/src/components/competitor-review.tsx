import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { cloudSignupUrl, type ReferralSource } from "@workspace/config/referrals";
import { buttonVariants } from "@workspace/ui/components/button";
import { ArrowRight, Check, Minus } from "lucide-react";
import { type Competitor, type CompetitorReview, getComparisonSlug } from "@/lib/competitors";
import { SELF_HOST_LINK } from "@/lib/self-host-link";

const LINK = "font-medium text-blue-700 hover:text-blue-900";

export function BulletList({ items, kind }: { items: string[]; kind?: "pro" | "con" }) {
	return (
		<ul className="space-y-3">
			{items.map((item) => (
				<li key={item} className="flex items-start gap-2 leading-relaxed text-zinc-600">
					{kind === "con" ? (
						<Minus className="mt-1 h-4 w-4 shrink-0 text-zinc-400" />
					) : (
						<Check className="mt-1 h-4 w-4 shrink-0 text-blue-600" />
					)}
					<span>{item}</span>
				</li>
			))}
		</ul>
	);
}

export function ProsCons({ review }: { review: CompetitorReview }) {
	return (
		<div className="grid gap-8 md:grid-cols-2">
			<div>
				<h3 className="font-heading mb-4 text-lg text-zinc-950">Strengths</h3>
				<BulletList items={review.pros} kind="pro" />
			</div>
			<div>
				<h3 className="font-heading mb-4 text-lg text-zinc-950">Limitations</h3>
				<BulletList items={review.cons} kind="con" />
			</div>
		</div>
	);
}

export function ElmoComparisonTable({ competitor, review }: { competitor: Competitor; review: CompetitorReview }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-zinc-200 text-left">
						<th className="py-3 pr-4 font-semibold text-zinc-950" />
						<th className="py-3 pr-4 font-semibold text-zinc-950">{competitor.name}</th>
						<th className="bg-blue-50 px-3 py-3 font-semibold text-zinc-950">Elmo</th>
					</tr>
				</thead>
				<tbody>
					{review.elmoComparison.map((row) => (
						<tr key={row.label} className="border-b border-dashed border-zinc-200">
							<td className="py-3 pr-4 align-top font-medium text-zinc-950">{row.label}</td>
							<td className="py-3 pr-4 align-top text-zinc-600">{row.competitor}</td>
							<td className="bg-blue-50 px-3 py-3 align-top text-zinc-700">{row.elmo}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export type CompetitorPage = "pricing" | "review" | "alternatives" | "comparison";

export function CompetitorPageLinks({ competitor, current }: { competitor: Competitor; current?: CompetitorPage }) {
	const name = competitor.name;
	return (
		<ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
			{current !== "pricing" && (
				<li>
					<Link to="/ai-visibility-tools/pricing/$slug" params={{ slug: competitor.slug }} className={LINK}>
						{name} pricing
					</Link>
				</li>
			)}
			{current !== "review" && (
				<li>
					<Link to="/ai-visibility-tools/reviews/$slug" params={{ slug: competitor.slug }} className={LINK}>
						{name} review
					</Link>
				</li>
			)}
			{current !== "alternatives" && (
				<li>
					<Link to="/ai-visibility-tools/alternatives/$slug" params={{ slug: competitor.slug }} className={LINK}>
						{name} alternatives
					</Link>
				</li>
			)}
			{current !== "comparison" && (
				<li>
					<Link to="/ai-visibility-tools/$slug" params={{ slug: getComparisonSlug(competitor) }} className={LINK}>
						Elmo vs {name}
					</Link>
				</li>
			)}
		</ul>
	);
}

export function CompetitorSignupCta({
	competitor,
	from,
	title,
}: {
	competitor: Competitor;
	from: ReferralSource;
	title: string;
}) {
	return (
		<section className="border-b border-zinc-200 bg-zinc-50 py-12">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<div className="rounded-md border border-blue-200 bg-blue-50/40 p-6">
					<h2 className="font-heading text-xl text-zinc-950">{title}</h2>
					<p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
						Elmo tracks how ChatGPT, Google AI Mode, AI Overviews, Perplexity, Gemini, and Claude mention and cite your
						brand, with public prices from ${CLOUD_ENTRY_PRICE_USD}/mo, API and MCP access on every plan, and no sales
						call. It is open source, so you can also self-host it for free and read how every number is made. Compare it
						with {competitor.name} before you commit.
					</p>
					<div className="mt-4 flex flex-wrap gap-3">
						<a href={cloudSignupUrl(from)} className={buttonVariants({ size: "sm" })}>
							Start with Elmo Cloud
							<ArrowRight className="h-3.5 w-3.5" />
						</a>
						<Link to="/pricing" className={buttonVariants({ variant: "outline", size: "sm" })}>
							Elmo pricing
						</Link>
						<Link {...SELF_HOST_LINK} className={buttonVariants({ variant: "outline", size: "sm" })}>
							Self-host for free
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}
