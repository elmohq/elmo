import { createFileRoute } from "@tanstack/react-router";
import { ElmoCta } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { LlmsTxtGenerator } from "@/components/tools/llms-txt-generator";
import { RelatedReading, ToolHero, ToolPanel, ToolSection } from "@/components/tools/tool-shell";
import { requireFreeTool } from "@/data/tools";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, freeToolJsonLd, howToJsonLd, ogMeta } from "@/lib/seo";

const tool = requireFreeTool("llms-txt-generator");
const path = `/tools/${tool.slug}`;

const steps = [
	{
		name: "Enter your domain",
		text: "Paste a domain such as example.com, or a full sitemap URL if your sitemap lives somewhere unconventional.",
	},
	{
		name: "The generator finds your sitemap",
		text: "It reads your robots.txt for a Sitemap line, then falls back to /sitemap.xml and the other conventional paths, following a sitemap index into its children.",
	},
	{
		name: "It reads your pages",
		text: "Up to 60 same-origin URLs are fetched for their title and meta description, so the link list is written in your own words rather than guessed from slugs.",
	},
	{
		name: "Review and edit the result",
		text: "Sections come from your URL structure, so reorder them, drop anything low-value, and sharpen the one-line summary at the top.",
	},
	{
		name: "Publish it at /llms.txt",
		text: "Serve the file at the root of your domain as text/plain, and link to it from your pages so an agent browsing your site can find it.",
	},
];

export const Route = createFileRoute("/tools/llms-txt-generator")({
	head: () => ({
		meta: [
			{ title: tool.metaTitle },
			{ name: "description", content: tool.description },
			...ogMeta({ title: tool.metaTitle, description: tool.description, path }),
		],
		links: [{ rel: "canonical", href: canonicalUrl(path) }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Free tools", path: "/tools" },
				{ name: tool.name, path },
			]),
			freeToolJsonLd({ name: tool.name, description: tool.description, path }),
			howToJsonLd({
				name: "How to generate an llms.txt file",
				description: "Build an llms.txt from a site's sitemap and page metadata, then publish it at the domain root.",
				steps,
			}),
			faqJsonLd(tool.faqs),
		],
	}),
	component: LlmsTxtGeneratorPage,
});

function LlmsTxtGeneratorPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<ToolHero
					eyebrow="/ Free tools"
					title="llms.txt generator"
					lead="Paste a domain and get an llms.txt built from its sitemap, with real page titles and descriptions rather than guesses from slugs. Free, no signup, copy or download in one click."
				/>

				<ToolPanel>
					<LlmsTxtGenerator />
				</ToolPanel>

				<ToolSection title="How it builds the file">
					<ol className="max-w-3xl space-y-4">
						{steps.map((step, index) => (
							<li key={step.name} className="flex gap-4">
								<span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-mono text-[11px] text-zinc-600">
									{index + 1}
								</span>
								<div>
									<p className="font-semibold text-zinc-950">{step.name}</p>
									<p className="mt-1 leading-relaxed text-zinc-600">{step.text}</p>
								</div>
							</li>
						))}
					</ol>
				</ToolSection>

				<ToolSection title="What llms.txt is, and what it is not">
					<div className="max-w-3xl space-y-5 leading-relaxed text-zinc-600">
						<p>
							An llms.txt is a Markdown file at the root of your site that gives an AI agent a map of your contents: an
							H1 with the site name, a one-line summary, and sections of annotated links. It is a convention proposed at{" "}
							<a
								href="https://llmstxt.org/"
								target="_blank"
								rel="noopener noreferrer"
								className="text-blue-700 hover:text-blue-900"
							>
								llmstxt.org
							</a>
							, not a standard any engine is obliged to follow.
						</p>
						<p>
							Being straight about the value: models are not trained to look for llms.txt, it appears in no major
							assistant's system prompt, and most agent harnesses never request it. The realistic path to it being read
							is an agent already on your site that follows a link to a file it knows is meant for agents. That is why
							the file matters less than linking to it, and why a plain-text version of your important pages is usually
							the higher-leverage change.
						</p>
						<p>
							The downside, though, is close to zero: one static file, generated in seconds. Publish it, link it, and
							spend the rest of your effort on making the pages themselves easy for a model to read and quote.
						</p>
					</div>
				</ToolSection>

				<Faq items={tool.faqs} eyebrow="/ FAQ" />

				<RelatedReading
					links={[
						{
							label: "Do llms.txt files matter for AEO?",
							href: "/blog/do-llms-txt-files-matter-for-aeo",
							blurb: "The five ways an AI agent could encounter your llms.txt, and which one actually happens.",
						},
						{
							label: "AI crawler checker",
							href: "/tools/ai-crawler-checker",
							blurb: "A map is no use to a crawler your robots.txt turns away. Check which bots can read your site.",
						},
					]}
				/>

				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
