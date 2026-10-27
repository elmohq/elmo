import { createFileRoute } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { Community } from "@/components/community";
import { Footer } from "@/components/footer";
import { Closing } from "@/components/home/closing";
import { Faq } from "@/components/home/faq";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { LogoStrip } from "@/components/home/logos";
import { ModelCoverage } from "@/components/home/models";
import { Pricing } from "@/components/home/pricing";
import { Reviews } from "@/components/home/reviews";
import { SelfHost } from "@/components/home/self-host";
import { HOME_FONT_CLASS, HomeStyles } from "@/components/home/styles";
import { WhySwitch } from "@/components/home/why-switch";
import { Navbar } from "@/components/navbar";
import { getHeroVariant } from "@/data/hero-variants";
import { useAiReferral } from "@/lib/ai-referral";
import { HOME_FAQS } from "@/lib/faqs";
import { canonicalUrl, faqJsonLd, ogMeta, SITE_NAME, softwareApplicationJsonLd } from "@/lib/seo";

const title = `${SITE_NAME} · Open Source AEO & AI Visibility Tracker`;
// The shared SITE_DESCRIPTION is a terse fallback for pages without their own
// copy. The homepage takes the largest share of search clicks and is the page
// answer engines cite most, so it gets a full-width description of its own.
const description =
	"Elmo is open-source answer engine optimization (AEO): track your brand's AI visibility in ChatGPT, Perplexity, and Gemini. Cloud from $29/mo or self-host free.";

export const Route = createFileRoute("/")({
	// Passes every other param through untouched: ad clicks carry gclid and UTM
	// tags that the conversion tags read from the landing URL.
	validateSearch: (search: Record<string, unknown>): { v?: unknown } => search,
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

function aiReferralHero(assistant: string): ComponentProps<typeof Hero> {
	return {
		title: `Get Customers from ${assistant}`,
		lede: `You found us through ${assistant}. That's Elmo at work. See how AI search engines talk about your brand, which sources they trust, and what to change so they recommend you too.`,
		from: "marketing-ai-referral",
	};
}

function HomePage() {
	const explicit = getHeroVariant(Route.useSearch().v);
	const [referral] = useAiReferral();
	const variant = explicit ?? (referral ? aiReferralHero(referral.assistant) : undefined);
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen bg-white antialiased`}>
			<HomeStyles />
			<Navbar />
			<main>
				<Hero {...variant} />
				<LogoStrip />
				<ModelCoverage />
				<Reviews />
				<HowItWorks />
				<WhySwitch />
				<Pricing />
				<Faq items={HOME_FAQS} />
				<SelfHost />
				<Community />
				<Closing />
			</main>
			<Footer />
		</div>
	);
}
