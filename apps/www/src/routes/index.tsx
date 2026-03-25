import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/navbar";
import { Hero } from "@/components/hero";
import { Features } from "@/components/features";
import { Stats } from "@/components/stats";
import { Pricing } from "@/components/pricing";
import { CTA } from "@/components/cta";
import { Footer } from "@/components/footer";
import {
	SITE_NAME,
	SITE_DESCRIPTION,
	ogMeta,
	softwareApplicationJsonLd,
	canonicalUrl,
} from "@/lib/seo";

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: `${SITE_NAME} — Open Source AI Visibility Platform` },
			{ name: "description", content: SITE_DESCRIPTION },
			...ogMeta({
				title: `${SITE_NAME} — Open Source AI Visibility Platform`,
				description: SITE_DESCRIPTION,
				path: "/",
			}),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/") }],
		scripts: [softwareApplicationJsonLd()],
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
				<Features />
				<Pricing />
				<CTA />
			</main>
			<Footer />
		</div>
	);
}
