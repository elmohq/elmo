import { createFileRoute } from "@tanstack/react-router";
import { AiVisibilitySoftwareHub, type HubFaqItem } from "@/components/ai-visibility-software-hub";
import { CompetitorDirectory } from "@/components/competitor-directory";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { articleJsonLd, breadcrumbJsonLd, canonicalUrl, faqPageJsonLd, ogMeta } from "@/lib/seo";

const title = "AI Visibility Software: Track Your Brand in AI · Elmo";
const description =
	"AI visibility software tracks how your brand appears in AI search — mentions, citations, and share of voice across ChatGPT, Perplexity, and Gemini.";

// Shared by the rendered FAQ (in the hub component) and the FAQPage JSON-LD below.
const FAQS: HubFaqItem[] = [
	{
		question: "What is AI visibility software?",
		answer:
			"AI visibility software tracks how a brand appears in answers from AI search engines like ChatGPT, Perplexity, and Google AI Overviews — monitoring mentions, citations, sentiment, and share of voice against competitors, usually by running prompts on a schedule.",
	},
	{
		question: "How does AI visibility tracking work?",
		answer:
			"AI visibility tracking works by running a defined set of prompts across AI engines repeatedly, then recording whether each answer mentions your brand, cites your site, and how it describes you. Sampling over time reveals trends a one-off check would miss.",
	},
	{
		question: "Can you track brand mentions in ChatGPT?",
		answer:
			"Yes. AI visibility software queries ChatGPT with your prompts and records whether it mentions or cites your brand. Because answers vary, tracking a consistent prompt set on a schedule gives a far more reliable read than a single manual check.",
	},
];

export const Route = createFileRoute("/ai-visibility-tools/")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({
				title,
				description,
				path: "/ai-visibility-tools",
			}),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/ai-visibility-tools") }],
		scripts: [
			articleJsonLd({
				title: "AI Visibility Software",
				description,
				path: "/ai-visibility-tools",
			}),
			faqPageJsonLd(FAQS),
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "AI Visibility Software", path: "/ai-visibility-tools" },
			]),
		],
	}),
	component: AiVisibilitySoftwarePage,
});

function AiVisibilitySoftwarePage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main>
				<AiVisibilitySoftwareHub faqs={FAQS} />
				<CompetitorDirectory showHero={false} />
			</main>
			<Footer />
		</div>
	);
}
