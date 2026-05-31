import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CompetitorDirectory } from "@/components/competitor-directory";
import { Faq } from "@/components/faq";
import { DIRECTORY_FAQS } from "@/lib/faqs";
import {
	ogMeta,
	canonicalUrl,
	breadcrumbJsonLd,
	faqJsonLd,
	itemListJsonLd,
} from "@/lib/seo";
import { competitors, getComparisonSlug, isLowDR } from "@/lib/competitors";

const title = "AI Visibility Tool Directory | Compare AI Search Tools · Elmo";
const description =
	"Compare 100+ AI visibility and Answer Engine Optimization tools. Feature matrix, pricing, and head-to-head comparisons with Elmo.";

// Indexed comparison pages (mirrors the sitemap filter), surfaced as ItemList
// structured data so AI engines can extract the full directory of tools.
const directoryItems = competitors
	.filter(
		(c) =>
			c.status !== "shutting-down" && c.category !== "other" && !isLowDR(c),
	)
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
		links: [
			{ rel: "canonical", href: canonicalUrl("/ai-visibility-tools") },
		],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
			]),
			faqJsonLd(DIRECTORY_FAQS),
			itemListJsonLd(directoryItems),
		],
	}),
	component: AeoToolsPage,
});

function AeoToolsPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<CompetitorDirectory />
				<Faq items={DIRECTORY_FAQS} eyebrow="/ FAQ" />
			</main>
			<Footer />
		</div>
	);
}
