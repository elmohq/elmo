import { createFileRoute, notFound } from "@tanstack/react-router";
import { AlternativeGrid, AudienceCards, CompetitorHero, competitorGlance } from "@/components/competitor-page";
import {
	CompetitorPageCards,
	CompetitorPageLinks,
	CompetitorSignupCta,
	ElmoComparisonTable,
	ProsCons,
} from "@/components/competitor-review";
import { DirectoryBackLink, DirectorySection } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { CARD } from "@/components/home/ui";
import { Navbar } from "@/components/navbar";
import {
	type Competitor,
	type CompetitorPricing,
	type CompetitorReview,
	getAlternatives,
	getCompetitorBySlug,
	getCompetitorProfile,
	reviewedSlugs,
} from "@/lib/competitors";
import { formatPostDate } from "@/lib/format";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

export const Route = createFileRoute("/ai-visibility-tools/reviews/$slug")({
	loader: ({ params }) => {
		const competitor = getCompetitorBySlug(params.slug);
		const profile = getCompetitorProfile(params.slug);
		if (!competitor || !reviewedSlugs.includes(params.slug) || !profile?.pricing || !profile.review) {
			throw notFound();
		}
		return {
			competitor,
			pricing: profile.pricing,
			review: profile.review,
			alternatives: getAlternatives(competitor, 6),
		};
	},
	head: ({ params, loaderData }) => {
		if (!loaderData) return {};
		const { competitor: c, review } = loaderData;
		const title = `${c.name} Review (2026): Features, Pros & Cons · Elmo`;
		const description = `An independent ${c.name} review: engines covered, how it collects answers, features, strengths and limitations, who should pick it, and the alternatives worth comparing.`;
		const path = `/ai-visibility-tools/reviews/${params.slug}`;
		return {
			meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
					{ name: `${c.name} review`, path },
				]),
				faqJsonLd(review.reviewFaqs),
			],
		};
	},
	component: ReviewPage,
});

function Fact({ label, children }: { label: string; children: string }) {
	return (
		<div className="bg-white p-5 md:p-6">
			<dt className="text-sm font-semibold text-zinc-950">{label}</dt>
			<dd className="mt-1.5 text-pretty text-sm/6 text-zinc-700">{children}</dd>
		</div>
	);
}

const JUMP_LINKS = [
	{ id: "features", label: "Features" },
	{ id: "pros-cons", label: "Pros and Cons" },
	{ id: "who-its-for", label: "Who It's For" },
	{ id: "vs-elmo", label: "Elmo Comparison" },
	{ id: "alternatives", label: "Alternatives" },
	{ id: "faq", label: "FAQ" },
];

function ReviewPage() {
	const { competitor, pricing, review, alternatives } = Route.useLoaderData() as {
		competitor: Competitor;
		pricing: CompetitorPricing;
		review: CompetitorReview;
		alternatives: Competitor[];
	};
	const name = competitor.name;
	const verified = formatPostDate(review.verified);
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen`}>
			<HomeStyles />
			<Navbar />
			<main>
				<DirectoryBackLink />
				<CompetitorHero
					competitor={competitor}
					title={`${name} Review`}
					lead={review.verdict}
					note={`Based on ${name}'s own pricing, product pages, and docs, checked ${verified}. Elmo is a competitor, so we stick to what can be verified.`}
					tiles={competitorGlance(competitor, review)}
					jumpLinks={JUMP_LINKS}
				>
					<CompetitorPageLinks competitor={competitor} current="review" />
				</CompetitorHero>

				<DirectorySection title={`${name} at a Glance`} tone="muted">
					<dl className="grid gap-px overflow-hidden rounded-2xl bg-zinc-200/80 ring-1 ring-zinc-200/80 md:grid-cols-2">
						<Fact label="Best For">{review.bestFor}</Fact>
						<Fact label="Pricing">{pricing.summary}</Fact>
						<Fact label="AI Engines">{review.engines}</Fact>
						<Fact label="How Answers Are Collected">{review.collection}</Fact>
					</dl>
				</DirectorySection>

				<DirectorySection id="features" title={`${name} Features`}>
					<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
						{review.features.map((feature) => (
							<div key={feature.name} className={`p-5 ${CARD}`}>
								<h3 className="font-semibold text-zinc-950">{feature.name}</h3>
								<p className="mt-2 text-sm/6 text-zinc-600">{feature.detail}</p>
							</div>
						))}
					</div>
				</DirectorySection>

				<DirectorySection id="pros-cons" title={`${name} Pros and Cons`} tone="muted">
					<ProsCons review={review} />
				</DirectorySection>

				<DirectorySection id="who-its-for" title={`Who Should Use ${name}`}>
					<AudienceCards
						name={name}
						stay={review.pickIf}
						leave={review.lookElsewhereIf}
						stayTitle={`Pick ${name} If`}
						leaveTitle="Look Elsewhere If"
					/>
				</DirectorySection>

				<DirectorySection id="vs-elmo" title={`${name} vs Elmo`} tone="muted">
					<ElmoComparisonTable competitor={competitor} review={review} />
				</DirectorySection>

				<CompetitorSignupCta
					competitor={competitor}
					from="marketing-competitor-review"
					title={`Considering ${name}? Try Elmo Too`}
				/>

				<DirectorySection
					id="alternatives"
					title={`${name} Alternatives`}
					lede={`Elmo is the open-source option. These are the other tools most often compared with ${name}.`}
				>
					<AlternativeGrid competitors={alternatives} />
				</DirectorySection>

				<div id="faq" className="scroll-mt-16">
					<Faq items={review.reviewFaqs} />
				</div>

				<DirectorySection title={`More on ${name}`} tone="muted">
					<CompetitorPageCards competitor={competitor} current="review" />
				</DirectorySection>
			</main>
			<Footer />
		</div>
	);
}
