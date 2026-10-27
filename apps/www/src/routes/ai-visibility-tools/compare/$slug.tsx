import { createFileRoute, notFound } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { ComparePricing } from "@/components/competitor-pricing";
import { DirectoryBackLink, DirectoryElmoBanner, DirectoryHero, ElmoCta } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { MultiComparison } from "@/components/multi-comparison";
import { Navbar } from "@/components/navbar";
import { PairComparison } from "@/components/pair-comparison";
import {
	type Competitor,
	getCompareEntry,
	getCompareFaqs,
	getCompareVerdict,
	getCompetitorProfile,
} from "@/lib/competitors";
import {
	breadcrumbJsonLd,
	canonicalUrl,
	comparisonJsonLd,
	ELMO_LISTING,
	faqJsonLd,
	ogMeta,
	softwareApplicationJsonLd,
} from "@/lib/seo";

export const Route = createFileRoute("/ai-visibility-tools/compare/$slug")({
	loader: ({ params }) => {
		const tools = getCompareEntry(params.slug);
		if (!tools) throw notFound();
		return { tools, faqs: getCompareFaqs(tools) };
	},
	head: ({ params, loaderData }) => {
		if (!loaderData) return {};
		const { tools, faqs } = loaderData;
		const names = tools.map((t) => t.name).join(" vs ");
		const isPair = tools.length === 2;
		const priced = tools.every((t) => getCompetitorProfile(t.slug)?.pricing);
		const title = isPair
			? priced
				? `${names} (2026): Pricing, Features & Verdict · Elmo`
				: `${names} | AI Visibility Tool Comparison · Elmo`
			: `${names} · Elmo`;
		const description = isPair
			? priced
				? `${names} compared on pricing, plan limits, engines, and features, with a clear verdict on which to pick and Elmo as the open-source alternative.`
				: `Compare ${names} for AI visibility tracking — feature by feature, with Elmo as the open-source alternative.`
			: `Compare ${names} for AI visibility and answer engine monitoring, feature by feature, with Elmo as the free, open-source alternative.`;
		const path = `/ai-visibility-tools/compare/${params.slug}`;
		return {
			meta: [{ title }, { name: "description", content: description }, ...ogMeta({ title, description, path })],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: "AI Visibility Tool Directory", path: "/ai-visibility-tools" },
					{ name: names, path },
				]),
				faqJsonLd(faqs),
				comparisonJsonLd([...tools.map((t) => ({ name: t.name, url: t.url })), ELMO_LISTING]),
				softwareApplicationJsonLd(),
			],
		};
	},
	component: ComparePage,
});

function ComparePage() {
	const { tools } = Route.useLoaderData() as { tools: Competitor[] };
	const names = tools.map((t) => t.name).join(" vs ");
	const [a, b] = tools;
	const priced = tools.flatMap((competitor) => {
		const pricing = getCompetitorProfile(competitor.slug)?.pricing;
		return pricing ? [{ competitor, pricing }] : [];
	});
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryBackLink />
				<DirectoryHero title={names} lead={getCompareVerdict(tools)} />
				<DirectoryElmoBanner
					title={`Elmo: the open-source alternative, from $${CLOUD_ENTRY_PRICE_USD}/mo`}
					pitch={`Elmo tracks the same answer engines as ${new Intl.ListFormat("en", { type: "conjunction" }).format(tools.map((t) => t.name))} as open-source software. Self-host it for free, or use Elmo Cloud with public, self-serve plans: no sales call, API and MCP access on every plan, and the code behind every number is yours to read.`}
				/>
				{a && b && tools.length === 2 ? <PairComparison a={a} b={b} /> : <MultiComparison tools={tools} />}
				{priced.length === tools.length ? <ComparePricing tools={priced} /> : null}
				<Faq items={getCompareFaqs(tools)} />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
