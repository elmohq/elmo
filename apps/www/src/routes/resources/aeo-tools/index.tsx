import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { CompetitorDirectory } from "@/components/competitor-directory";
import { ogMeta, canonicalUrl, breadcrumbJsonLd } from "@/lib/seo";

const title = "AEO Tool Directory — Compare AI Visibility Tools | Elmo";
const description =
	"Compare 70+ AI visibility and Answer Engine Optimization tools. Feature matrix, pricing, and head-to-head comparisons with Elmo.";

export const Route = createFileRoute("/resources/aeo-tools/")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({
				title,
				description,
				path: "/resources/aeo-tools",
			}),
		],
		links: [
			{ rel: "canonical", href: canonicalUrl("/resources/aeo-tools") },
		],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Resources", path: "/resources" },
				{ name: "AEO Tool Directory", path: "/resources/aeo-tools" },
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
