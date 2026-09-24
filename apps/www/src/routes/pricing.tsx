import { createFileRoute } from "@tanstack/react-router";
import { Footer } from "@/components/footer";
import { Closing } from "@/components/home/closing";
import { Faq } from "@/components/home/faq";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { Navbar } from "@/components/navbar";
import { Pricing } from "@/components/pricing";
import { PRICING_FAQS } from "@/lib/faqs";
import { breadcrumbJsonLd, canonicalUrl, faqJsonLd, ogMeta } from "@/lib/seo";

const title = "Pricing — Free, Cloud & White-Label AI Visibility · Elmo";
const description =
	"Elmo is free and open source to self-host, available as managed cloud from $29/mo, and white-label for agencies.";

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
	component: PricingPage,
});

function PricingPage() {
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen`}>
			<HomeStyles />
			<Navbar />
			<main>
				<Pricing as="h1" />
				<Faq items={PRICING_FAQS} />
				<Closing from="marketing-pricing-closing" />
			</main>
			<Footer />
		</div>
	);
}
