import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { ArrowRight } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Faq } from "@/components/faq";
import { ToolGrid } from "@/components/tool-list";
import {
	DirectoryBackLink,
	DirectoryHero,
	DirectorySection,
	ElmoCta,
} from "@/components/directory-shell";
import { ogMeta, canonicalUrl, breadcrumbJsonLd, faqJsonLd } from "@/lib/seo";
import {
	getCompetitorBySlug,
	isIndexed,
	getAlternatives,
	getAlternativesVerdict,
	getAlternativesFaqs,
	type Competitor,
} from "@/lib/competitors";

export const Route = createFileRoute("/ai-visibility-tools/alternatives/$slug")({
	head: ({ params }) => {
		const c = getCompetitorBySlug(params.slug);
		if (!c || !isIndexed(c)) return {};
		const title = `${c.name} Alternatives | Open-Source AI Visibility · Elmo`;
		const description = `The best ${c.name} alternatives for AI visibility tracking, including Elmo — the open-source, self-hosted option you can run for free.`;
		const path = `/ai-visibility-tools/alternatives/${params.slug}`;
		return {
			meta: [
				{ title },
				{ name: "description", content: description },
				...ogMeta({ title, description, path }),
			],
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

				{/* Elmo: the open-source pick */}
				<section className="border-b border-zinc-200 bg-zinc-50 py-10">
					<div className="mx-auto max-w-6xl px-4 md:px-6">
						<div className="rounded-md border border-blue-200 bg-blue-50/40 p-6">
							<h2 className="font-heading text-xl text-zinc-950">
								Elmo: the open-source alternative
							</h2>
							<p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-600">
								Elmo tracks how ChatGPT, Claude, Perplexity, Gemini, and Google
								AI Overviews mention and cite your brand. It is open source, so
								you self-host it for free, keep your data in-house, and verify
								exactly how each metric is calculated. No per-seat pricing, no
								black-box scores, no lock-in.
							</p>
							<div className="mt-4 flex flex-wrap gap-3">
								<Button asChild size="sm">
									<Link to="/docs">Deploy Elmo</Link>
								</Button>
								<Button asChild variant="outline" size="sm">
									<Link
										to="/ai-visibility-tools/$slug"
										params={{ slug: `elmo-vs-${competitor.slug}` }}
									>
										Elmo vs {competitor.name}
										<ArrowRight className="h-3.5 w-3.5" />
									</Link>
								</Button>
							</div>
						</div>
					</div>
				</section>

				<DirectorySection title={`Other ${competitor.name} alternatives`}>
					<ToolGrid competitors={alternatives} />
				</DirectorySection>

				<Faq
					items={getAlternativesFaqs(competitor, alternatives)}
					eyebrow="/ FAQ"
				/>
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
