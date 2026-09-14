import { createFileRoute } from "@tanstack/react-router";
import { Community } from "@/components/community";
import { CTA } from "@/components/cta";
import { Faq } from "@/components/faq";
import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Navbar } from "@/components/navbar";
import { Pricing } from "@/components/pricing";
import { Stats } from "@/components/stats";
import { SpeakeasyTestimonial, TradeSitesTestimonial } from "@/components/testimonial";
import { HOME_FAQS } from "@/lib/faqs";
import { canonicalUrl, faqJsonLd, ogMeta, SITE_NAME, softwareApplicationJsonLd } from "@/lib/seo";

const title = `${SITE_NAME} · Open Source AEO & AI Visibility Tracker`;
// The shared SITE_DESCRIPTION is a terse fallback for pages without their own
// copy. The homepage takes the largest share of search clicks and is the page
// answer engines cite most, so it gets a full-width description of its own.
const description =
	"Elmo is open-source answer engine optimization (AEO): track your brand's AI visibility in ChatGPT, Perplexity, and Gemini. Cloud from $29/mo or self-host free.";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({
				title,
				description,
				path: "/",
			}),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/") }],
		scripts: [softwareApplicationJsonLd(), faqJsonLd(HOME_FAQS)],
	}),
	component: HomePage,
});

function HomePage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<Hero />
				<Stats />
				<SpeakeasyTestimonial />
				<Features />
				<TradeSitesTestimonial />
				<Community />
				<Pricing />
				<Faq items={HOME_FAQS} eyebrow="/ FAQ" />
				<CTA />
			</main>
			<Footer />
		</div>
	);
}
