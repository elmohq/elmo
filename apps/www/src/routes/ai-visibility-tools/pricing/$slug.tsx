import { createFileRoute, notFound } from "@tanstack/react-router";
import { PLANS } from "@workspace/config/plans";
import { ELMO_PLAN_ROWS, elmoCostPerAnswer, PlanTable, SourceList } from "@/components/competitor-pricing";
import { CompetitorPageLinks, CompetitorSignupCta, ElmoComparisonTable } from "@/components/competitor-review";
import { DirectoryBackLink, DirectoryHero, DirectorySection } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
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
					{ name: `${c.name} pricing`, path },
				]),
				faqJsonLd(review.pricingFaqs),
			],
		};
	},
	component: PricingPage,
});

function PricingPage() {
	const { competitor, pricing, review } = Route.useLoaderData() as {
		competitor: Competitor;
		pricing: CompetitorPricing;
		review: CompetitorReview;
	};
	const name = competitor.name;
	const basic = PLANS.basic;
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero
					title={`${name} pricing`}
					lead={`${pricing.summary} Prices last verified on ${formatPostDate(pricing.verified)}.`}
				>
					<CompetitorPageLinks competitor={competitor} current="pricing" />
				</DirectoryHero>

				<DirectorySection title={`${name} plans and prices`}>
					<PlanTable rows={pricing.plans} />
					<SourceList pricing={pricing} />
				</DirectorySection>

				{pricing.extraCosts?.length ? (
					<DirectorySection title="Add-ons and hidden costs">
						<ul className="max-w-3xl list-disc space-y-3 pl-5 leading-relaxed text-zinc-600">
							{pricing.extraCosts.map((cost) => (
								<li key={cost}>{cost}</li>
							))}
						</ul>
					</DirectorySection>
				) : null}

				<DirectorySection title="Cost per AI answer">
					<div className="max-w-3xl space-y-4 leading-relaxed text-zinc-600">
						<p>
							Plan prices are hard to compare because tools meter different things: prompts, models, credits, or runs
							per day. Dividing the price by the AI answers a plan can collect in a month puts them on one scale.
						</p>
						<p>
							<span className="font-medium text-zinc-950">{name}:</span>{" "}
							{pricing.costPerAnswer ?? "Not derivable from the published plans."}
						</p>
						<p>
							<span className="font-medium text-zinc-950">Elmo:</span> about {elmoCostPerAnswer(basic)} per answer on
							the ${basic.monthlyPriceUsd}/mo {basic.name} plan ({basic.maxPrompts} prompts on {basic.platformPicks}{" "}
							platforms, up to {basic.standardRunsPerDay}× a day), and free to self-host.
						</p>
					</div>
				</DirectorySection>

				<DirectorySection title={`${name} vs Elmo pricing`}>
					<div className="mb-10">
						<ElmoComparisonTable competitor={competitor} review={review} />
					</div>
					<h3 className="font-heading mb-4 text-lg text-zinc-950">Elmo plans</h3>
					<PlanTable rows={ELMO_PLAN_ROWS} highlight />
				</DirectorySection>

				<CompetitorSignupCta
					competitor={competitor}
					from="marketing-competitor-pricing"
					title={`A self-serve alternative to ${name}`}
				/>

				<Faq items={review.pricingFaqs} />

				<DirectorySection title={`More on ${name}`}>
					<CompetitorPageLinks competitor={competitor} current="pricing" />
				</DirectorySection>
			</main>
			<Footer />
		</div>
	);
}
