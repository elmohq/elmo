import { createFileRoute } from "@tanstack/react-router";
import { Community } from "@/components/community";
import { Footer } from "@/components/footer";
import { Citations } from "@/components/home/citations";
import { Closing } from "@/components/home/closing";
import { Faq } from "@/components/home/faq";
import { Hero } from "@/components/home/hero";
import { LogoStrip } from "@/components/home/logos";
import { ModelCoverage } from "@/components/home/models";
import { Pricing } from "@/components/home/pricing";
import { Reviews } from "@/components/home/reviews";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { ProductTour } from "@/components/home/tour";
import { Updates } from "@/components/home/updates";
import { Navbar } from "@/components/navbar";
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
		<div className={`${HOME_FONT_CLASS} min-h-screen bg-white antialiased`}>
			<HomeStyles />
			<Navbar />
			<main>
				<Hero />
				<LogoStrip />
				<Reviews />
				<ModelCoverage />
				<ProductTour />
				<Citations />
				<Pricing />
				<Faq items={HOME_FAQS} />
				<Community />
				<Closing />
				<Updates />
			</main>
			<Footer />
		</div>
	);
}
