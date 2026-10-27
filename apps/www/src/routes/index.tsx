import { createFileRoute, useLoaderData } from "@tanstack/react-router";
import { isConsentRequired, onAnalyticsConsent } from "@workspace/ui/lib/cookie-consent";
import { useEffect, useState } from "react";
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
import { getHeroVariant, heroVariants } from "@/data/hero-variants";
import { HOME_FAQS } from "@/lib/faqs";
import {
	HEADLINE_ARMS,
	type HeadlineArm,
	type HeadlineTestConfig,
	headlineTestScript,
	pickHeadline,
	rememberHeadline,
	startHeadlineTest,
} from "@/lib/headline-test";
import { canonicalUrl, faqJsonLd, ogMeta, SITE_NAME, softwareApplicationJsonLd } from "@/lib/seo";

const title = `${SITE_NAME} · Open Source AEO & AI Visibility Tracker`;
// The shared SITE_DESCRIPTION is a terse fallback for pages without their own
// copy. The homepage takes the largest share of search clicks and is the page
// answer engines cite most, so it gets a full-width description of its own.
const description =
	"Elmo is open-source answer engine optimization (AEO): track your brand's AI visibility in ChatGPT, Perplexity, and Gemini. Cloud from $29/mo or self-host free.";

const HEADLINE_TEST: HeadlineTestConfig = {
	arms: HEADLINE_ARMS,
	explicitKeys: Object.keys(heroVariants),
	storageKey: "elmo.headline-test",
	attribute: "data-headline",
	botPattern: "bot|crawl|spider|slurp|preview|lighthouse|headless|facebookexternalhit",
};

const HEADLINE_SCRIPT = headlineTestScript(HEADLINE_TEST);

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

function useHeadlineArm(enabled: boolean): HeadlineArm | null {
	const { consentRegion } = useLoaderData({ from: "__root__" });
	const [arm, setArm] = useState<HeadlineArm | null>(null);
	useEffect(() => {
		if (!enabled) return;
		const drawn = startHeadlineTest(HEADLINE_TEST, pickHeadline);
		setArm(drawn);
		if (!drawn) return;
		// Remembering the arm is analytics storage, so it follows the analytics
		// answer; without it the arm still holds for this page view.
		return onAnalyticsConsent(isConsentRequired(consentRegion), (allowed) =>
			rememberHeadline(HEADLINE_TEST.storageKey, allowed ? drawn : null),
		);
	}, [enabled, consentRegion]);
	return arm;
}

function HomePage() {
	const explicit = getHeroVariant(Route.useSearch().v);
	const arm = useHeadlineArm(!explicit);
	const variant = explicit ?? (arm === "win-ai-search" ? heroVariants[arm] : undefined);
	const headlineTest = explicit ? undefined : { arm, pendingTitle: heroVariants["win-ai-search"].title };
	return (
		<div className={`${HOME_FONT_CLASS} min-h-screen bg-white antialiased`}>
			<HomeStyles />
			{/* Runs during the initial parse, ahead of the hero, so the arm is set before the headline first paints. The client bundle stringifies a minified copy, hence the suppressed mismatch. */}
			{explicit ? null : <script suppressHydrationWarning>{HEADLINE_SCRIPT}</script>}
			<Navbar />
			<main>
				<Hero {...variant} headlineTest={headlineTest} />
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
