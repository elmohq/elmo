import { Link } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { cloudSignupUrl, type ReferralSource } from "@workspace/config/referrals";
import { ArrowRight, Check, Minus } from "lucide-react";
import { OverviewPageGraphic } from "@/components/feature-graphics";
import { CARD } from "@/components/home/ui";
import { type Competitor, type CompetitorReview, getComparisonSlug } from "@/lib/competitors";
import { SELF_HOST_LINK } from "@/lib/self-host-link";

const LINK =
	"inline-flex items-center rounded-full bg-white px-3 py-1 font-medium text-blue-700 ring-1 ring-zinc-200 transition hover:text-blue-900 hover:ring-zinc-300";

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
		<div className="grid gap-5 md:grid-cols-2">
			<div className={`p-6 md:p-7 ${CARD}`}>
				<h3 className="mb-5 text-lg font-semibold tracking-[-0.02em] text-zinc-950">Strengths</h3>
				<BulletList items={review.pros} kind="pro" />
			</div>
			<div className={`p-6 md:p-7 ${CARD}`}>
				<h3 className="mb-5 text-lg font-semibold tracking-[-0.02em] text-zinc-950">Limitations</h3>
				<BulletList items={review.cons} kind="con" />
			</div>
		</div>
	);
}

/** Stacks each row into label-over-two-cells on phones, where a three-column table would scroll. */
export function ElmoComparisonTable({ competitor, review }: { competitor: Competitor; review: CompetitorReview }) {
	const head = "px-4 py-3 text-left font-mono text-[10px] font-medium uppercase tracking-[0.18em]";
	return (
		<div className={`overflow-hidden ${CARD}`}>
			<table className="w-full text-sm">
				<thead>
					<tr className="border-b border-zinc-200 max-sm:grid max-sm:grid-cols-2">
						<th className={`${head} w-1/4 bg-zinc-50/80 text-zinc-500 max-sm:hidden`}>
							<span className="sr-only">Compared on</span>
						</th>
						<th className={`${head} bg-zinc-50/80 text-zinc-500`}>{competitor.name}</th>
						<th className={`${head} bg-blue-600 text-white`}>Elmo</th>
					</tr>
				</thead>
				<tbody>
					{review.elmoComparison.map((row) => (
						<tr
							key={row.label}
							className="border-b border-dashed border-zinc-200 last:border-0 max-sm:grid max-sm:grid-cols-2"
						>
							<th
								scope="row"
								className="px-4 py-3.5 text-left align-top font-medium text-zinc-950 max-sm:col-span-2 max-sm:pb-1"
							>
								{row.label}
							</th>
							<td className="px-4 py-3.5 align-top text-zinc-600 max-sm:pt-2">{row.competitor}</td>
							<td className="bg-blue-50/70 px-4 py-3.5 align-top font-medium text-zinc-800 max-sm:pt-2">{row.elmo}</td>
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
		<ul className="flex flex-wrap gap-2 text-sm">
			{current !== "pricing" && (
				<li>
					<Link to="/ai-visibility-tools/pricing/$slug" params={{ slug: competitor.slug }} className={LINK}>
						{name} Pricing
					</Link>
				</li>
			)}
			{current !== "review" && (
				<li>
					<Link to="/ai-visibility-tools/reviews/$slug" params={{ slug: competitor.slug }} className={LINK}>
						{name} Review
					</Link>
				</li>
			)}
			{current !== "alternatives" && (
				<li>
					<Link to="/ai-visibility-tools/alternatives/$slug" params={{ slug: competitor.slug }} className={LINK}>
						{name} Alternatives
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
		<section className="border-b border-zinc-200 bg-zinc-50/70 py-12 lg:py-16">
			<div className="mx-auto max-w-6xl px-4 md:px-6">
				<div className="grid gap-8 overflow-hidden rounded-2xl bg-zinc-950 p-6 md:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
					<div>
						<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-blue-300">Elmo Cloud</p>
						<h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-balance text-white md:text-3xl">
							{title}
						</h2>
						<p className="mt-4 text-pretty text-sm/6 text-zinc-300">
							Elmo tracks how ChatGPT, Google AI Mode, AI Overviews, Perplexity, Gemini, and Claude mention and cite
							your brand, with public prices from ${CLOUD_ENTRY_PRICE_USD}/mo, API and MCP access on every plan, and no
							sales call. It is open source, so you can also self-host it for free and read how every number is made.
							Compare it with {competitor.name} before you commit.
						</p>
						<div className="mt-6 flex flex-wrap gap-3">
							<a
								href={cloudSignupUrl(from)}
								className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500"
							>
								Start With Elmo Cloud
								<ArrowRight className="size-4" aria-hidden="true" />
							</a>
							<Link
								to="/pricing"
								className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/10"
							>
								Elmo Pricing
							</Link>
							<Link
								{...SELF_HOST_LINK}
								className="inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/10"
							>
								Self-Host for Free
							</Link>
						</div>
					</div>
					<OverviewPageGraphic />
				</div>
			</div>
		</section>
	);
}

const PAGE_CARDS: Record<CompetitorPage, { label: (name: string) => string; body: (name: string) => string }> = {
	pricing: {
		label: (name) => `${name} Pricing`,
		body: (name) => `Every ${name} plan, the add-ons, and the cost per AI answer.`,
	},
	review: {
		label: (name) => `${name} Review`,
		body: (name) => `What ${name} does, where it falls short, and who it suits.`,
	},
	alternatives: {
		label: (name) => `${name} Alternatives`,
		body: (name) => `The tools most often compared with ${name}, side by side.`,
	},
	comparison: {
		label: (name) => `Elmo vs ${name}`,
		body: (name) => `A feature-by-feature comparison of Elmo and ${name}.`,
	},
};

export function CompetitorPageCards({ competitor, current }: { competitor: Competitor; current: CompetitorPage }) {
	const name = competitor.name;
	const pages = (Object.keys(PAGE_CARDS) as CompetitorPage[]).filter((page) => page !== current);
	return (
		<ul className="grid gap-4 sm:grid-cols-3">
			{pages.map((page) => (
				<li key={page}>
					<Link
						{...pageLink(competitor, page)}
						className="group flex h-full flex-col rounded-2xl bg-white p-5 ring-1 ring-zinc-200 transition hover:ring-blue-300"
					>
						<span className="flex items-center justify-between font-semibold text-zinc-950">
							{PAGE_CARDS[page].label(name)}
							<ArrowRight className="size-4 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
						</span>
						<span className="mt-1.5 text-sm/6 text-zinc-600">{PAGE_CARDS[page].body(name)}</span>
					</Link>
				</li>
			))}
		</ul>
	);
}

function pageLink(competitor: Competitor, page: CompetitorPage) {
	switch (page) {
		case "pricing":
			return { to: "/ai-visibility-tools/pricing/$slug", params: { slug: competitor.slug } } as const;
		case "review":
			return { to: "/ai-visibility-tools/reviews/$slug", params: { slug: competitor.slug } } as const;
		case "alternatives":
			return { to: "/ai-visibility-tools/alternatives/$slug", params: { slug: competitor.slug } } as const;
		case "comparison":
			return { to: "/ai-visibility-tools/$slug", params: { slug: getComparisonSlug(competitor) } } as const;
	}
}
