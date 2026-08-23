import { createFileRoute } from "@tanstack/react-router";
import { ElmoCta } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { AiCrawlerChecker } from "@/components/tools/ai-crawler-checker";
import { RelatedReading, ToolHero, ToolPanel, ToolSection } from "@/components/tools/tool-shell";
import { requireFreeTool } from "@/data/tools";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, freeToolJsonLd, ogMeta } from "@/lib/seo";
import { AI_CRAWLERS, CRAWLER_ROLE_LABELS } from "@/lib/tools/ai-crawlers";

const tool = requireFreeTool("ai-crawler-checker");
const path = `/tools/${tool.slug}`;

export const Route = createFileRoute("/tools/ai-crawler-checker")({
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
			faqJsonLd(tool.faqs),
		],
	}),
	component: AiCrawlerCheckerPage,
});

function AiCrawlerCheckerPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<ToolHero
					eyebrow="/ Free tools"
					title="AI crawler checker"
					lead="Paste a domain to see which AI crawlers your robots.txt allows and which it blocks — GPTBot, ClaudeBot, PerplexityBot, Googlebot, and ten more. Free, no signup, nothing stored."
				/>

				<ToolPanel>
					<AiCrawlerChecker />
				</ToolPanel>

				<ToolSection title="How the check works">
					<div className="max-w-3xl space-y-5 leading-relaxed text-zinc-600">
						<p>
							The checker fetches <code className="font-mono text-xs">/robots.txt</code> and evaluates it the way a
							compliant crawler does, following RFC 9309. Three rules decide every verdict on this page, and all three
							are places people guess wrong.
						</p>
						<ul className="list-disc space-y-3 pl-5">
							<li>
								<strong className="text-zinc-950">The most specific user-agent group wins, and it wins alone.</strong> A
								bot that has its own named group ignores <code className="font-mono text-xs">User-agent: *</code>{" "}
								entirely — a global <code className="font-mono text-xs">Allow: /</code> does not rescue a crawler that
								is disallowed in its own block.
							</li>
							<li>
								<strong className="text-zinc-950">The longest matching path pattern wins.</strong>{" "}
								<code className="font-mono text-xs">Disallow: /</code> loses to{" "}
								<code className="font-mono text-xs">Allow: /blog/</code> for a URL under /blog/, because the more
								specific rule is the one that applies.
							</li>
							<li>
								<strong className="text-zinc-950">On a tie, Allow beats Disallow.</strong> Two rules of equal length
								matching the same path resolve in favor of crawling.
							</li>
						</ul>
						<p>
							Paste a bare domain to check the site root, or a full URL to check one page. Nothing is executed and
							nothing is saved — the check is a single request to a file that is already public.
						</p>
					</div>
				</ToolSection>

				<ToolSection title="The crawlers it checks">
					<div className="overflow-x-auto">
						<table className="w-full min-w-[720px] text-sm">
							<thead>
								<tr className="border-b border-zinc-200 text-left">
									<th className="py-3 pr-4 font-semibold text-zinc-950">Crawler</th>
									<th className="py-3 pr-4 font-semibold text-zinc-950">Run by</th>
									<th className="py-3 pr-4 font-semibold text-zinc-950">Job</th>
									<th className="py-3 font-semibold text-zinc-950">Blocking it costs you</th>
								</tr>
							</thead>
							<tbody>
								{AI_CRAWLERS.map((crawler) => (
									<tr key={crawler.token} className="border-b border-zinc-200 align-top">
										<td className="py-3 pr-4 font-mono text-xs text-zinc-950">{crawler.token}</td>
										<td className="py-3 pr-4 text-zinc-600">{crawler.operator}</td>
										<td className="py-3 pr-4 text-zinc-600">{CRAWLER_ROLE_LABELS[crawler.role]}</td>
										<td className="py-3 text-zinc-600">{crawler.blockingCosts}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<p className="mt-5 max-w-3xl leading-relaxed text-zinc-600">
						User-agent names change. Treat this as a starting map and check each company's published crawler docs before
						writing strict rules.
					</p>
				</ToolSection>

				<ToolSection title="What a block actually costs">
					<div className="max-w-3xl space-y-5 leading-relaxed text-zinc-600">
						<p>
							The crawlers above do three different jobs, and blocking the wrong one has consequences people rarely
							intend. Training crawlers decide whether your writing feeds a model. Search crawlers decide whether an
							assistant can cite you. Live-fetch crawlers decide whether a page can be read at the moment a user asks
							about it.
						</p>
						<p>
							The most expensive single mistake involves Google. There is no separate AI Overviews bot to block: AI
							Overviews and AI Mode are features of Google Search and run on{" "}
							<code className="font-mono text-xs">Googlebot</code>, so disallowing it removes you from AI answers and
							classic search at once. <code className="font-mono text-xs">Google-Extended</code> is narrower than its
							name suggests — it governs Gemini training and Vertex grounding only, and blocking it does not affect AI
							Overviews.
						</p>
						<p>
							A robots.txt that returns a 5xx is worse than one that returns a 404. A missing file means everything is
							allowed; a file that keeps erroring is treated as a site-wide disallow by major crawlers. The checker
							calls that out separately for exactly this reason.
						</p>
					</div>
				</ToolSection>

				<Faq items={tool.faqs} eyebrow="/ FAQ" />

				<RelatedReading
					links={[
						{
							label: "Robots.txt and AI crawlers",
							href: "/blog/robots-txt-ai-crawlers",
							blurb: "Which crawlers to allow, which to block, and two copy-paste robots.txt configurations.",
						},
						{
							label: "llms.txt generator",
							href: "/tools/llms-txt-generator",
							blurb: "Once crawlers are in, give them a map: build an llms.txt from your sitemap.",
						},
					]}
				/>

				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
