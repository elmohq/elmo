import { createFileRoute } from "@tanstack/react-router";
import { Community } from "@/components/community";
import { CTA } from "@/components/cta";
import { Faq } from "@/components/faq";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Navbar } from "@/components/navbar";
import { OffSiteAeoPromo } from "@/components/off-site-aeo";
import { Pricing } from "@/components/pricing";
import { Stats } from "@/components/stats";
import { Testimonial } from "@/components/testimonial";
import { HOME_FAQS } from "@/lib/faqs";
import { canonicalUrl, faqJsonLd, ogMeta, SITE_DESCRIPTION, SITE_NAME, softwareApplicationJsonLd } from "@/lib/seo";
import { getPublicCloudCatalog } from "@/server/cloud-plans";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: `${SITE_NAME} · Open Source AI Visibility` },
			{ name: "description", content: SITE_DESCRIPTION },
			...ogMeta({
				title: `${SITE_NAME} · Open Source AI Visibility`,
				description: SITE_DESCRIPTION,
				path: "/",
			}),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/") }],
		scripts: [softwareApplicationJsonLd(), faqJsonLd(HOME_FAQS)],
	}),
	loader: () => getPublicCloudCatalog(),
	component: HomePage,
});

function HomePage() {
	const catalog = Route.useLoaderData();
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<Hero />
				<Stats />
				<Features />
				<Testimonial />
				<Community />
				<Pricing catalog={catalog} />
				<OffSiteAeoPromo />
				<Faq items={HOME_FAQS} eyebrow="/ FAQ" />
				<CTA />
			</main>
			<Footer />
		</div>
	);
}
