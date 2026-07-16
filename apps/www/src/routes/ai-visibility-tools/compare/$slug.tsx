import { createFileRoute, notFound } from "@tanstack/react-router";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Faq } from "@/components/faq";
import { PairComparison } from "@/components/pair-comparison";
import { MultiComparison } from "@/components/multi-comparison";
import {
	DirectoryBackLink,
	DirectoryHero,
	ElmoCta,
} from "@/components/directory-shell";
import {
	ogMeta,
	canonicalUrl,
	breadcrumbJsonLd,
	faqJsonLd,
	comparisonJsonLd,
	softwareApplicationJsonLd,
	ELMO_LISTING,
} from "@/lib/seo";
import {
	getCompareEntry,
	getCompareVerdict,
	getCompareFaqs,
	type Competitor,
} from "@/lib/competitors";

export const Route = createFileRoute("/ai-visibility-tools/compare/$slug")({
	head: ({ params }) => {
		const tools = getCompareEntry(params.slug);
		if (!tools) return {};
		const names = tools.map((t) => t.name).join(" vs ");
		const isPair = tools.length === 2;
		const title = isPair
			? `${names} | AI Visibility Tool Comparison · Elmo`
			: `${names} · Elmo`;
		const description = isPair
			? `Compare ${names} for AI visibility tracking — feature by feature, with Elmo as the open-source alternative.`
			: `Compare ${names} for AI visibility and answer engine monitoring, feature by feature, with Elmo as the free, open-source alternative.`;
		const path = `/ai-visibility-tools/compare/${params.slug}`;
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
					{ name: names, path },
				]),
				faqJsonLd(getCompareFaqs(tools)),
				comparisonJsonLd([
					...tools.map((t) => ({ name: t.name, url: t.url })),
					ELMO_LISTING,
				]),
				softwareApplicationJsonLd(),
			],
		};
	},
	loader: ({ params }) => {
		const tools = getCompareEntry(params.slug);
		if (!tools) throw notFound();
		return { tools };
	},
	component: ComparePage,
});

function ComparePage() {
	const { tools } = Route.useLoaderData() as { tools: Competitor[] };
	const names = tools.map((t) => t.name).join(" vs ");
	const [a, b] = tools;
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero
					eyebrow="Comparison"
					title={names}
					lead={getCompareVerdict(tools)}
				/>
				{a && b && tools.length === 2 ? (
					<PairComparison a={a} b={b} />
				) : (
					<MultiComparison tools={tools} />
				)}
				<Faq items={getCompareFaqs(tools)} eyebrow="/ FAQ" />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
