import { createFileRoute } from "@tanstack/react-router";
import { CTA } from "@/components/cta";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { Pricing } from "@/components/pricing";
import { PRICING_FAQS } from "@/lib/faqs";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";
import { getPublicCloudCatalog } from "@/server/cloud-plans";

const title = "Elmo Cloud Pricing — AI Visibility Plans from $29";
const description =
	"Compare Elmo Cloud plans from $29/month, self-host Elmo for free, or choose a custom white-label deployment.";

export const Route = createFileRoute("/pricing")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/pricing" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/pricing") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Pricing", path: "/pricing" },
			]),
			faqJsonLd(PRICING_FAQS),
		],
	}),
	loader: () => getPublicCloudCatalog(),
	component: PricingPage,
});

function PricingPage() {
	const catalog = Route.useLoaderData();
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<Pricing catalog={catalog} />
				<Faq items={PRICING_FAQS} eyebrow="/ FAQ" />
				<CTA />
			</main>
			<Footer />
		</div>
	);
}
