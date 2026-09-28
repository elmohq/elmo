import { createFileRoute } from "@tanstack/react-router";
import { DirectoryHero, ElmoCta } from "@/components/directory-shell";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { PillarBody } from "@/components/pillar";
import { getPillar } from "@/data/pillars";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

const pillar = getPillar("answer-engine-optimization");

export const Route = createFileRoute("/answer-engine-optimization")({
	loader: () => {
		if (!pillar) return;
		const { slug, metaTitle, description, h1, faqs } = pillar;
		return { seo: { slug, metaTitle, description, h1, faqs } };
	},
	head: ({ loaderData }) => {
		const pillar = loaderData?.seo;
		if (!pillar) return {};
		const path = `/${pillar.slug}`;
		return {
			meta: [
				{ title: pillar.metaTitle },
				{ name: "description", content: pillar.description },
				...ogMeta({ title: pillar.metaTitle, description: pillar.description, path }),
			],
			links: [{ rel: "canonical", href: canonicalUrl(path) }],
			scripts: [
				breadcrumbJsonLd([
					{ name: "Home", path: "/" },
					{ name: pillar.h1, path },
				]),
				faqJsonLd(pillar.faqs),
			],
		};
	},
	component: PillarPage,
});

function PillarPage() {
	if (!pillar) return null;
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<DirectoryHero eyebrow={pillar.eyebrow} title={pillar.h1} lead={pillar.lead} />
				<PillarBody pillar={pillar} />
				<Faq items={pillar.faqs} eyebrow="/ FAQ" />
				<ElmoCta />
			</main>
			<Footer />
		</div>
	);
}
