import { createFileRoute, notFound } from "@tanstack/react-router";
import { DirectoryBackLink, DirectoryHero, DirectorySection, ElmoCta } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ToolGrid } from "@/components/tool-list";
import {
	type Competitor,
	type FeatureKey,
	getFeatureFaqs,
	getFeatureKeyBySlug,
	getFeatureLabel,
	getFeatureSearchTerm,
	getFeatureVerdict,
	MIN_TOOLS_FOR_FEATURE_PAGE,
	toolsWithFeature,
} from "@/lib/competitors";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

export const Route = createFileRoute("/ai-visibility-tools/features/$slug")({
	head: ({ params }) => {
		const key = getFeatureKeyBySlug(params.slug);
		if (!key) return {};
		const tools = toolsWithFeature(key);
		if (tools.length < MIN_TOOLS_FOR_FEATURE_PAGE) return {};
		const label = getFeatureLabel(key);
		const term = getFeatureSearchTerm(key);
		const title = !term
			? `AI Visibility Tools with ${label} · Elmo`
			: tools.length <= 25
				? `${tools.length} Best ${term} (2026) · Elmo`
				: `${term} Compared: ${tools.length} Tools (2026) · Elmo`;
		const description = `${tools.length} AI visibility tools with ${label.toLowerCase()}, compared on engine coverage, pricing, and export — including Elmo, the open-source option.`;
		const path = `/ai-visibility-tools/features/${params.slug}`;
		return {
			meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
					{ name: label, path },
				]),
				faqJsonLd(getFeatureFaqs(key, tools)),
			],
		};
	},
	loader: ({ params }) => {
		const key = getFeatureKeyBySlug(params.slug);
		if (!key) throw notFound();
		const tools = toolsWithFeature(key);
		if (tools.length < MIN_TOOLS_FOR_FEATURE_PAGE) throw notFound();
		return { featureKey: key, tools };
	},
	component: FeaturePage,
});

function FeaturePage() {
	const { featureKey, tools } = Route.useLoaderData() as {
		featureKey: FeatureKey;
		tools: Competitor[];
	};
	const label = getFeatureLabel(featureKey);
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero
					eyebrow="Feature"
					title={`AI visibility tools with ${label}`}
					lead={getFeatureVerdict(featureKey, tools)}
				/>
				<DirectorySection title="Tools that offer this feature">
					<ToolGrid competitors={tools} />
				</DirectorySection>
				<Faq items={getFeatureFaqs(featureKey, tools)} eyebrow="/ FAQ" />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
