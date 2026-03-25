import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CompetitorDirectory } from "@/components/competitor-directory";
import { ogMeta, canonicalUrl, breadcrumbJsonLd } from "@/lib/seo";

const title = "AI Visibility Tool Directory — Compare AI Search Tools | Elmo";
const description =
	"Compare 70+ AI visibility and Answer Engine Optimization tools. Feature matrix, pricing, and head-to-head comparisons with Elmo.";

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
			</main>
			<Footer />
		</div>
	);
}
