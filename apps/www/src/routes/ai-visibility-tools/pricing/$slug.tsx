import { createFileRoute, notFound } from "@tanstack/react-router";
import { PLANS } from "@workspace/config/plans";
import { CompetitorHero, competitorGlance, SourceCards } from "@/components/competitor-page";
import {
	CostPerAnswerChart,
	ELMO_PLAN_ROWS,
	elmoCostPerAnswer,
	HiddenCosts,
	hasCostChart,
	PlanCards,
	PreviousPlans,
} from "@/components/competitor-pricing";
import {
	CompetitorPageCards,
	CompetitorPageLinks,
	CompetitorSignupCta,
	ElmoComparisonTable,
} from "@/components/competitor-review";
import { DirectoryBackLink, DirectorySection } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { Navbar } from "@/components/navbar";
import {
	type Competitor,
	type CompetitorPricing,
	type CompetitorReview,
	getCompetitorBySlug,
	getCompetitorProfile,
	reviewedSlugs,
} from "@/lib/competitors";
import { formatPostDate } from "@/lib/format";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

export const Route = createFileRoute("/ai-visibility-tools/pricing/$slug")({
	loader: ({ params }) => {
		const competitor = getCompetitorBySlug(params.slug);
		const profile = getCompetitorProfile(params.slug);
		if (!competitor || !reviewedSlugs.includes(params.slug) || !profile?.pricing || !profile.review) {
			throw notFound();
		}
		return { competitor, pricing: profile.pricing, review: profile.review };
	},
	head: ({ params, loaderData }) => {
		if (!loaderData) return {};
		const { competitor: c, pricing, review } = loaderData;
		const title = `${c.name} Pricing (2026): Plans, Limits & Hidden Costs · Elmo`;
		const description = `${c.name} pricing explained: every plan with its price and limits, add-ons and hidden costs, cost per AI answer, and how it compares with Elmo. Verified ${formatPostDate(pricing.verified)}.`;
		const path = `/ai-visibility-tools/pricing/${params.slug}`;
		return {
			meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
					{ name: `${c.name} Pricing`, path },
				]),
				faqJsonLd(review.pricingFaqs),
			],
		};
	},
	component: PricingPage,
});

const JUMP_LINKS = [
	{ id: "plans", label: "Plans" },
	{ id: "hidden-costs", label: "Hidden Costs" },
	{ id: "cost-per-answer", label: "Cost per Answer" },
	{ id: "vs-elmo", label: "vs Elmo" },
	{ id: "faq", label: "FAQ" },
	{ id: "sources", label: "Sources" },
];

function PricingPage() {
	const { competitor, pricing, review } = Route.useLoaderData() as {
		competitor: Competitor;
		pricing: CompetitorPricing;
		review: CompetitorReview;
	};
	const name = competitor.name;
	const basic = PLANS.basic;
	const verified = formatPostDate(pricing.verified);
	const jumpLinks = JUMP_LINKS.filter((link) => link.id !== "hidden-costs" || pricing.extraCosts?.length);
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen`}>
			<HomeStyles />
			<Navbar />
			<main>
				<DirectoryBackLink />
				<CompetitorHero
					competitor={competitor}
					eyebrow={`Pricing · Verified ${verified}`}
					title={`${name} Pricing`}
					lead={pricing.summary}
					note={`Prices last verified on ${verified} from ${name}'s own pages. Every source is linked at the bottom.`}
					tiles={competitorGlance(competitor, review)}
					jumpLinks={jumpLinks}
				>
					<CompetitorPageLinks competitor={competitor} current="pricing" />
				</CompetitorHero>

				<DirectorySection
					id="plans"
					eyebrow="Plans"
					title={pricing.previous ? `Current ${name} Plans` : `${name} Plans and Prices`}
				>
					<PlanCards plans={pricing.plans} />
					<PreviousPlans pricing={pricing} />
				</DirectorySection>

				{pricing.extraCosts?.length ? (
					<DirectorySection id="hidden-costs" eyebrow="Watch For" title="Add-Ons and Hidden Costs" tone="muted">
						<HiddenCosts items={pricing.extraCosts} />
					</DirectorySection>
				) : null}

				<DirectorySection
					id="cost-per-answer"
					eyebrow="Value"
					title="Cost per AI Answer"
					lede="Plan prices are hard to compare because tools meter different things: prompts, models, credits, or runs per day. Dividing the price by the AI answers a plan can collect in a month puts them on one scale."
				>
					{hasCostChart(pricing) ? <CostPerAnswerChart competitor={competitor} pricing={pricing} /> : null}
					<dl className="mt-8 grid gap-6 text-sm/6 md:grid-cols-2">
						<div>
							<dt className="font-semibold text-zinc-950">How {name} Works Out</dt>
							<dd className="mt-1 text-zinc-600">
								{pricing.costPerAnswer ?? "Not derivable from the published plans."}
							</dd>
						</div>
						<div>
							<dt className="font-semibold text-zinc-950">How Elmo Works Out</dt>
							<dd className="mt-1 text-zinc-600">
								About {elmoCostPerAnswer(basic)} per answer on the ${basic.monthlyPriceUsd}/mo {basic.name} plan (
								{basic.maxPrompts} prompts on {basic.platformPicks} platforms, up to {basic.standardRunsPerDay}× a day),
								and free to self-host. Elmo figures assume every prompt runs on every platform at the plan's full rate.
							</dd>
						</div>
					</dl>
				</DirectorySection>

				<DirectorySection id="vs-elmo" eyebrow="Side by Side" title={`${name} vs Elmo Pricing`} tone="muted">
					<ElmoComparisonTable competitor={competitor} review={review} />
					<h3 className="mt-12 mb-5 text-lg font-semibold tracking-[-0.02em] text-zinc-950">Elmo Plans</h3>
					<PlanCards plans={ELMO_PLAN_ROWS} variant="elmo" />
				</DirectorySection>

				<CompetitorSignupCta
					competitor={competitor}
					from="marketing-competitor-pricing"
					title={`A Self-Serve Alternative to ${name}`}
				/>

				<div id="faq" className="scroll-mt-16">
					<Faq items={review.pricingFaqs} />
				</div>

				<DirectorySection id="sources" eyebrow="Sources" title="Where These Numbers Come From">
					<SourceCards
						sources={pricing.sources}
						note={`Checked ${verified}. Vendors change plans often, so check the source before you buy.`}
					/>
				</DirectorySection>

				<DirectorySection title={`More on ${name}`} tone="muted">
					<CompetitorPageCards competitor={competitor} current="pricing" />
				</DirectorySection>
			</main>
			<Footer />
		</div>
	);
}
