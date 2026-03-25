import { createFileRoute, notFound } from "@tanstack/react-router";
import { Navbar } from "@/components/navbar";
import { CompetitorComparison } from "@/components/competitor-comparison";
import { Footer } from "@/components/footer";
import { ogMeta, canonicalUrl, breadcrumbJsonLd } from "@/lib/seo";
import { competitors, getComparisonSlug, isLowDR, type Competitor } from "@/lib/competitors";

export const Route = createFileRoute("/resources/aeo-tools/$slug")({
	head: ({ params }) => {
		const competitor = competitors.find(
			(c) => getComparisonSlug(c) === params.slug,
		);
		if (!competitor) return {};
		const title = `Elmo vs ${competitor.name} — AEO Tool Comparison | Elmo`;
		const description = `Compare Elmo and ${competitor.name} for AI visibility tracking. Feature-by-feature breakdown, pricing, and key differences.`;
		const path = `/resources/aeo-tools/${params.slug}`;
		const meta = [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path }),
		];
		if (isLowDR(competitor)) {
			meta.push({ name: "robots", content: "noindex, follow" });
		}
		return {
			meta,
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "AEO Tool Directory", path: "/resources/aeo-tools" },
					{ name: `Elmo vs ${competitor.name}`, path },
				]),
			],
		};
	},
	component: ComparisonPage,
	loader: ({ params }) => {
		const competitor = competitors.find(
			(c) => getComparisonSlug(c) === params.slug,
		);
		if (!competitor) throw notFound();
		return { competitor };
	},
});

function ComparisonPage() {
	const { competitor } = Route.useLoaderData() as { competitor: Competitor };
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<CompetitorComparison competitor={competitor} />
			</main>
			<Footer />
		</div>
	);
}
