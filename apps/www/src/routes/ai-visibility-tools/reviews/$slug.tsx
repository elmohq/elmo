import { createFileRoute, notFound } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import {
	BulletList,
	CompetitorPageLinks,
	CompetitorSignupCta,
	ElmoComparisonTable,
	ProsCons,
} from "@/components/competitor-review";
import { DirectoryBackLink, DirectoryHero, DirectorySection } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ToolGrid } from "@/components/tool-list";
import {
	type Competitor,
	type CompetitorPricing,
	type CompetitorReview,
	getAlternatives,
	getCompetitorBySlug,
	getCompetitorProfile,
	getScreenshotUrl,
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
		<div className="py-4">
			<dt className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</dt>
			<dd className="mt-1 leading-relaxed text-zinc-700">{children}</dd>
		</div>
	);
}

function ReviewPage() {
	const { competitor, pricing, review, alternatives } = Route.useLoaderData() as {
		competitor: Competitor;
		pricing: CompetitorPricing;
		review: CompetitorReview;
		alternatives: Competitor[];
	};
	const name = competitor.name;
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero title={`${name} review`} lead={review.verdict}>
					<p className="mb-4 text-sm text-zinc-500">
						Based on {name}'s own pricing, product pages, and docs, checked {formatPostDate(review.verified)}. Elmo is a
						competitor, so we stick to what can be verified and link every source.
					</p>
					<CompetitorPageLinks competitor={competitor} current="review" />
				</DirectoryHero>

				<DirectorySection title={`${name} at a glance`}>
					<dl className="max-w-3xl divide-y divide-zinc-200 border-y border-zinc-200">
						<Fact label="Best for">{review.bestFor}</Fact>
						<Fact label="Pricing">{pricing.summary}</Fact>
						<Fact label="AI engines">{review.engines}</Fact>
						<Fact label="How answers are collected">{review.collection}</Fact>
					</dl>
					{!competitor.noScreenshot && (
						<div className="mt-10 overflow-hidden rounded-md border border-zinc-200 shadow-sm">
							<img
								src={getScreenshotUrl(competitor.slug)}
								alt={`Screenshot of ${name} homepage`}
								width={1920}
								height={1080}
								className="aspect-video w-full object-cover object-top"
								loading="lazy"
							/>
						</div>
					)}
				</DirectorySection>

				<DirectorySection title={`${name} features`}>
					<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
						{review.features.map((feature) => (
							<div key={feature.name} className="rounded-md border border-zinc-200 bg-white p-5">
								<h3 className="font-semibold text-zinc-950">{feature.name}</h3>
								<p className="mt-2 text-sm leading-relaxed text-zinc-600">{feature.detail}</p>
							</div>
						))}
					</div>
				</DirectorySection>

				<DirectorySection title={`${name} pros and cons`}>
					<ProsCons review={review} />
				</DirectorySection>

				<DirectorySection title={`Who should use ${name}`}>
					<div className="grid gap-8 md:grid-cols-2">
						<div>
							<h3 className="font-heading mb-4 text-lg text-zinc-950">Pick {name} if</h3>
							<BulletList items={review.pickIf} kind="pro" />
						</div>
						<div>
							<h3 className="font-heading mb-4 text-lg text-zinc-950">Look elsewhere if</h3>
							<BulletList items={review.lookElsewhereIf} kind="con" />
						</div>
					</div>
				</DirectorySection>

				<DirectorySection title={`${name} vs Elmo`}>
					<ElmoComparisonTable competitor={competitor} review={review} />
				</DirectorySection>

				<CompetitorSignupCta
					competitor={competitor}
					from="marketing-competitor-review"
					title={`Considering ${name}? Try Elmo too`}
				/>

				<DirectorySection title={`${name} alternatives`}>
					<p className="mb-8 max-w-3xl leading-relaxed text-zinc-600">
						Elmo is the open-source option. These are the other tools most often compared with {name}.
					</p>
					<ToolGrid competitors={alternatives} />
				</DirectorySection>

				<Faq items={review.reviewFaqs} />

				<DirectorySection title="Sources">
					<ul className="space-y-2 text-sm">
						{review.sources.map((source) => (
							<li key={source.url}>
								<a
									href={source.url}
									target="_blank"
									rel="noopener noreferrer nofollow"
									className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900"
								>
									{source.label}
									<ExternalLink className="h-3 w-3" />
								</a>
							</li>
						))}
					</ul>
				</DirectorySection>
			</main>
			<Footer />
		</div>
	);
}
