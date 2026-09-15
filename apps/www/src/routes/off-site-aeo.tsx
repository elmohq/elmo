import { createFileRoute } from "@tanstack/react-router";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { OffSiteCTA, OffSiteHero, OffSitePricing, OffSiteProcess, OffSiteValue } from "@/components/off-site-aeo";
import { OFFSITE_FAQS } from "@/lib/faqs";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

const title = "Off-Site AEO — Get Cited by AI on High-Authority Sites · Elmo";
const description =
	"Managed off-site AEO: we place human-edited guest articles on high-authority (DR20–60+) sites so AI answer engines cite your brand. Placements target your gaps, refresh monthly, and come with a report — plus the backlinks.";

export const Route = createFileRoute("/off-site-aeo")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/off-site-aeo" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/off-site-aeo") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Off-Site AEO", path: "/off-site-aeo" },
			]),
			faqJsonLd(OFFSITE_FAQS),
		],
	}),
	component: OffSiteAeoPage,
});

function OffSiteAeoPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<OffSiteHero />
				<OffSiteValue />
				<OffSiteProcess />
				<OffSitePricing />
				<Faq items={OFFSITE_FAQS} eyebrow="/ FAQ" />
				<OffSiteCTA />
			</main>
			<Footer />
		</div>
	);
}
