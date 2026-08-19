import { createFileRoute, notFound } from "@tanstack/react-router";
import {
	DirectoryBackLink,
	DirectoryElmoBanner,
	DirectoryHero,
	DirectorySection,
	ElmoCta,
} from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ToolGrid } from "@/components/tool-list";
import {
	type Competitor,
	getAlternatives,
	getAlternativesFaqs,
	getAlternativesVerdict,
	getComparisonSlug,
	getCompetitorBySlug,
	isIndexed,
} from "@/lib/competitors";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

export const Route = createFileRoute("/ai-visibility-tools/alternatives/$slug")({
	head: ({ params }) => {
		const c = getCompetitorBySlug(params.slug);
		if (!c || !isIndexed(c)) return {};
		const title = `${c.name} Alternatives | Open-Source AI Visibility · Elmo`;
		const description = `The best ${c.name} alternatives for AI visibility tracking, including Elmo — the open-source, self-hosted option you can run for free.`;
		const path = `/ai-visibility-tools/alternatives/${params.slug}`;
		return {
			meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
					{ name: `${c.name} alternatives`, path },
				]),
				faqJsonLd(getAlternativesFaqs(c, getAlternatives(c))),
			],
		};
	},
	loader: ({ params }) => {
		const c = getCompetitorBySlug(params.slug);
		if (!c || !isIndexed(c)) throw notFound();
		return { competitor: c, alternatives: getAlternatives(c) };
	},
	component: AlternativesPage,
});

function AlternativesPage() {
	const { competitor, alternatives } = Route.useLoaderData() as {
		competitor: Competitor;
		alternatives: Competitor[];
	};
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero
					eyebrow="Alternatives"
					title={`${competitor.name} alternatives`}
					lead={getAlternativesVerdict(competitor)}
				/>

				<DirectoryElmoBanner
					pitch="Elmo tracks how ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews mention and cite your brand. It is open source, so you self-host it for free, keep your data in-house, and verify exactly how each metric is calculated. No per-seat pricing, no black-box scores, no lock-in."
					comparison={{
						slug: getComparisonSlug(competitor),
						name: competitor.name,
					}}
				/>

				{competitor.switching ? (
					<DirectorySection title={`Why teams leave ${competitor.name}`}>
						<p className="mb-8 max-w-3xl leading-relaxed text-zinc-600">
							What people tell us when they move to Elmo, and what we do differently. {competitor.name} is a capable
							product with real customers, so take this as the case for a different set of tradeoffs rather than a
							verdict on the tool.
						</p>
						<div className="max-w-3xl space-y-8">
							{competitor.switching.reasons.map((reason) => (
								<div key={reason.headline}>
									<h3 className="font-heading mb-2 text-lg text-zinc-950">{reason.headline}</h3>
									<p className="leading-relaxed text-zinc-600">{reason.detail}</p>
									<p className="mt-3 border-l-2 border-zinc-200 pl-4 leading-relaxed text-zinc-700">{reason.elmo}</p>
								</div>
							))}
						</div>
					</DirectorySection>
				) : null}

				<DirectorySection title={`Other ${competitor.name} alternatives`}>
					<ToolGrid competitors={alternatives} />
				</DirectorySection>

				<Faq items={getAlternativesFaqs(competitor, alternatives)} eyebrow="/ FAQ" />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
