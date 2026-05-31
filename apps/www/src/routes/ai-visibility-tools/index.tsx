import { createFileRoute } from "@tanstack/react-router";
import { AiVisibilitySoftwareHub } from "@/components/ai-visibility-software-hub";
import { CompetitorDirectory } from "@/components/competitor-directory";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { competitors, getComparisonSlug, isLowDR } from "@/lib/competitors";
import { DIRECTORY_FAQS } from "@/lib/faqs";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, itemListJsonLd, ogMeta } from "@/lib/seo";

const title = "AI Visibility Tool Directory | Compare AI Search Tools · Elmo";
const description =
	"AI visibility software tracks your brand across ChatGPT, Perplexity, and Gemini. Compare 100+ AI visibility and AEO tools, head-to-head with Elmo.";

// Indexed comparison pages (mirrors the sitemap filter), surfaced as ItemList
// structured data so AI engines can extract the full directory of tools.
const directoryItems = competitors
	.filter((c) => c.status !== "shutting-down" && c.category !== "other" && !isLowDR(c))
	.map((c) => ({
		name: c.name,
		path: `/ai-visibility-tools/${getComparisonSlug(c)}`,
	}));

export const Route = createFileRoute("/ai-visibility-tools/")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({
				title,
				description,
				path: "/ai-visibility-tools",
			}),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/ai-visibility-tools") }],
		scripts: [
			faqJsonLd(DIRECTORY_FAQS),
			itemListJsonLd(directoryItems),
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
			]),
		],
	}),
	component: AiVisibilitySoftwarePage,
});

function AiVisibilitySoftwarePage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<CompetitorDirectory />
				<AiVisibilitySoftwareHub />
				<Faq items={DIRECTORY_FAQS} eyebrow="/ FAQ" />
			</main>
			<Footer />
		</div>
	);
}
