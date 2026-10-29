import { PLANS } from "@workspace/config/plans";

export interface HeroVariant {
	title: string;
	/** Omit to keep the homepage's default lede. */
	lede?: string;
}

/**
 * Homepage hero copy selectable with `/?v=<key>`, so paid-search ads can land
 * on a headline that matches their keywords without a separate page. Only
 * these keys render: free text from the URL would let anyone put their own
 * words on our domain.
 */
export const heroVariants: Record<string, HeroVariant> = {
	"ai-visibility": {
		title: "Track Your Brand's AI Visibility",
		lede: "See how often ChatGPT, Claude, Gemini, Perplexity, and Google AI Overviews mention your brand, how they describe it, and which competitors they recommend instead.",
	},
	chatgpt: {
		title: "Is ChatGPT Mentioning You?",
		lede: "Elmo asks ChatGPT and every other major AI model the questions your buyers ask, then shows whether you're in the answer, who's there instead, and what to fix.",
	},
	"see-what-ai-says": {
		title: "See What AI Says About Your Brand",
		lede: "Track every answer ChatGPT, Claude, Gemini, and Perplexity give about your brand: whether you're mentioned, how you're described, and which sources they cite.",
	},
	"stop-checking": {
		title: "Stop Checking ChatGPT by Hand",
		lede: "Elmo runs your buyers' prompts across AI models on a schedule and tracks every answer, so you see trends instead of one-off screenshots.",
	},
	"aeo-tool": {
		title: "The AEO Tool That Tells You What to Fix",
		lede: "Elmo tracks your visibility across AI answer engines and turns it into a ranked list of fixes, from the pages to update to the sources AI trusts.",
	},
	geo: {
		title: "Generative Engine Optimization, Measured",
		lede: "Track how generative AI engines mention and cite your brand, benchmark against competitors, and see which changes actually move your visibility.",
	},
	"share-of-voice": {
		title: "Own Your AI Share of Voice",
		lede: "See how often AI models recommend you versus your competitors, prompt by prompt and model by model, and track it as it changes.",
	},
	citations: {
		title: "Know Which Sources AI Cites",
		lede: "Elmo shows which pages and domains ChatGPT, Perplexity, and Google AI Overviews cite when they answer your buyers, so you know where to show up.",
	},
	"ai-overviews": {
		title: "Track Your Brand in AI Overviews",
		lede: "See when Google AI Overviews, AI Mode, ChatGPT, and Perplexity mention your brand, and which sources they pull from when they don't.",
	},
	price: {
		title: `AI Visibility Tracking From $${PLANS.starter.monthlyPriceUsd}/mo`,
		lede: "Track how AI models talk about your brand without an enterprise contract. Unlimited seats on every plan, no sales call, and you can start in minutes.",
	},
	"win-ai-search": {
		title: "Win AI Search",
	},
	"open-source-tracker": {
		title: "The Open-Source AI Visibility Tracker",
	},
	"open-source": {
		title: "Open-Source AI Visibility Tracking",
		lede: "Elmo is MIT-licensed AEO software. Track your brand across ChatGPT, Claude, Gemini, and more on Elmo Cloud, or self-host it for free.",
	},
};

export function getHeroVariant(key: unknown): HeroVariant | undefined {
	return typeof key === "string" && Object.hasOwn(heroVariants, key) ? heroVariants[key] : undefined;
}
