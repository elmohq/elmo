import type { FaqItem } from "@/lib/faqs";

export interface PricingPlan {
	name: string;
	price: string;
	billedAnnually?: string;
	includes: string;
}

export interface Source {
	label: string;
	url: string;
}

export interface CompetitorPricing {
	verified: string;
	summary: string;
	plans: PricingPlan[];
	extraCosts?: string[];
	costPerAnswer?: string;
	sources: Source[];
}

export interface ProfileSection {
	title: string;
	paragraphs: string[];
	table?: { columns: string[]; rows: string[][]; caption?: string };
	links?: { text: string; href: string }[];
}

export interface AlternativesContent {
	title?: string;
	description?: string;
	sections?: ProfileSection[];
	faqs?: FaqItem[];
}

export interface CompetitorProfile {
	pricing?: CompetitorPricing;
	alternatives?: AlternativesContent;
}

const VERIFIED = "2026-10-27";

export const competitorProfiles: Record<string, CompetitorProfile> = {
	profound: {
		pricing: {
			verified: VERIFIED,
			summary:
				"Profound has no published paid price for brands. Its pricing page offers a free 7-day trial, then a custom-quoted Enterprise plan through sales.",
			plans: [
				{
					name: "Trial",
					price: "Free for 7 days",
					includes:
						"50 prompts from a recommended industry set (not editable), run daily on ChatGPT, Gemini, and Google AI Overviews. One language and region, no history, no exports, no API.",
				},
				{
					name: "Enterprise",
					price: "Custom quote",
					includes:
						"Custom prompt volume, up to 9 answer engines, daily runs, all-time history, CSV and JSON exports, API, SSO/SAML, and custom languages and regions.",
				},
			],
			extraCosts: [
				"Prompts, engines, regions, and languages are set by your contract and changed through Profound.",
				"AI work such as agent runs and the AI Marketer draws on a separate credit allotment, and usage past it runs as overage or pauses.",
				"API access and data exports are Enterprise-only.",
			],
			sources: [
				{ label: "Profound pricing", url: "https://www.tryprofound.com/pricing" },
				{ label: "Profound docs: credits", url: "https://docs.tryprofound.com/getting-started/credits" },
				{ label: "Profound docs: REST API", url: "https://docs.tryprofound.com/rest-api/introduction" },
			],
		},
	},
	"peec-ai": {
		pricing: {
			verified: VERIFIED,
			summary:
				"Peec AI sells self-serve plans from $95/mo (€85 in Europe), priced by prompts and capped at three models per plan, with Enterprise on an annual contract.",
			plans: [
				{
					name: "Starter",
					price: "$95/mo",
					billedAnnually: "$80/mo",
					includes: "50 prompts, 3 models, daily runs, 4,500 AI answers a month, 1 country, 1 project.",
				},
				{
					name: "Pro",
					price: "$245/mo",
					billedAnnually: "$205/mo",
					includes: "150 prompts, 3 models, daily runs, 13,500 answers a month, 3 countries, 2 projects, API.",
				},
				{
					name: "Advanced",
					price: "$495/mo",
					billedAnnually: "$420/mo",
					includes:
						"350 prompts, 3 models, daily runs, 31,500 answers a month, 3 countries, 5 projects, API, Looker Studio connector.",
				},
				{
					name: "Enterprise",
					price: "Custom, annual",
					includes: "Unlimited prompts, all models including Perplexity, Claude, and Grok, SSO.",
				},
			],
			extraCosts: [
				"Each model beyond the three included costs extra: $35/mo on Starter, $85/mo on Pro, $165/mo on Advanced.",
				"Perplexity and the API-based models (Claude, Grok, DeepSeek, and others) are add-ons or Enterprise-only.",
				"European visitors see separate euro prices, which are not a straight conversion.",
				"Peec's pricing table lists the API from Pro up, while its API docs describe it as Enterprise-only.",
			],
			costPerAnswer:
				"About $0.016 to $0.021 per AI answer on monthly billing, from the answer allowances Peec publishes.",
			sources: [
				{ label: "Peec AI pricing", url: "https://peec.ai/pricing" },
				{ label: "Peec AI agency pricing", url: "https://peec.ai/pricing-agencies" },
			],
		},
	},
	"otterly-ai": {
		pricing: {
			verified: VERIFIED,
			summary:
				"OtterlyAI is the cheapest of the well-known trackers to start, at $29/mo, but its base price covers four engines and the rest are paid add-ons.",
			plans: [
				{
					name: "Lite",
					price: "$29/mo",
					billedAnnually: "$25/mo",
					includes: "15 prompts, daily tracking on ChatGPT, Google AI Overviews, Perplexity, and Copilot, 1 workspace.",
				},
				{
					name: "Standard",
					price: "$189/mo",
					billedAnnually: "$160/mo",
					includes: "100 prompts, unlimited workspaces, Looker Studio connector, 2,000 API and MCP requests a month.",
				},
				{
					name: "Premium",
					price: "$489/mo",
					billedAnnually: "$422/mo",
					includes: "400 prompts, 5,000 API and MCP requests a month, personal onboarding.",
				},
				{ name: "Enterprise", price: "Custom", includes: "From 1,000 prompts, SSO, dedicated customer success." },
			],
			extraCosts: [
				"Google AI Mode and Gemini cost $9, $59, or $149/mo each depending on plan; Claude costs $29, $109, or $439/mo.",
				"Extra prompts are $99/mo per 100 on Standard and Premium; Lite cannot add prompts.",
			],
			costPerAnswer:
				"About $0.016 per answer on Lite and Standard and $0.010 on Premium, assuming one run per prompt per engine per day on the four base engines.",
			sources: [
				{ label: "OtterlyAI pricing", url: "https://otterly.ai/pricing" },
				{
					label: "OtterlyAI help: supported AI searches",
					url: "https://help.otterly.ai/which-ai-searches-does-otterlyai-support",
				},
			],
		},
	},
	athenahq: {
		pricing: {
			verified: VERIFIED,
			summary:
				"AthenaHQ meters usage in credits, where one credit is one AI response, with a free tier and a $295/mo self-serve plan.",
			plans: [
				{
					name: "Essential",
					price: "Free",
					includes: "300 credits, unlimited users, 5 engines: ChatGPT, Perplexity, AI Overviews, Gemini, Copilot.",
				},
				{
					name: "Starter",
					price: "$295/mo",
					includes:
						"3,600 credits a month, unlimited prompts and seats, 11 engines including AI Mode, Claude, and Grok.",
				},
				{ name: "Enterprise", price: "Custom", includes: "SSO, audit logs, multiple regions and languages, API." },
			],
			extraCosts: ["API access and extra credits are paid add-ons on Starter, priced on request."],
			costPerAnswer: "About $0.082 per AI response on Starter ($295 for 3,600 credits).",
			sources: [{ label: "AthenaHQ pricing", url: "https://www.athenahq.ai/pricing" }],
		},
	},
	"ahrefs-brand-radar": {
		pricing: {
			verified: VERIFIED,
			summary:
				"Brand Radar is part of Ahrefs. Paid Ahrefs plans include a small number of custom-prompt checks, and more come in add-on packs.",
			plans: [
				{
					name: "Included with Ahrefs Lite ($129/mo)",
					price: "Included",
					includes: "150 custom-prompt checks a month, about 5 prompts on daily refresh.",
				},
				{ name: "Included with Ahrefs Standard ($249/mo)", price: "Included", includes: "300 checks a month." },
				{ name: "Included with Ahrefs Advanced ($449/mo)", price: "Included", includes: "600 checks a month." },
				{
					name: "Custom-prompt packs",
					price: "$50, $100, or $250/mo",
					includes: "2,500, 7,000, or 25,000 checks, then $0.010 to $0.020 per extra check.",
				},
			],
			extraCosts: [
				"A check is one prompt on one model in one location, so tracking more engines multiplies usage.",
				"Ahrefs' own pages quote the AI index differently ('from $199/mo' on the pricing page, $699/mo for all platforms on the Brand Radar page), so confirm the current figure with Ahrefs.",
			],
			sources: [
				{ label: "Ahrefs Brand Radar", url: "https://ahrefs.com/brand-radar" },
				{ label: "Ahrefs pricing", url: "https://ahrefs.com/pricing" },
			],
		},
	},
	airops: {
		pricing: {
			verified: VERIFIED,
			summary:
				"AirOps prices by task volume and does not publish dollar figures beyond a free Solo plan; paid tiers go through sales.",
			plans: [
				{
					name: "Solo",
					price: "Free",
					includes: "35,000 tasks a month, 1 brand kit, 1 user, AI visibility insights for ChatGPT only.",
				},
				{
					name: "Pro",
					price: "Not published",
					includes: "100,000 tasks a month, unlimited seats, insights across 7+ answer engines.",
				},
				{ name: "Enterprise", price: "Custom", includes: "Custom task, prompt, and page limits." },
			],
			extraCosts: ["Tasks over the Solo allowance cost $0.025 each."],
			sources: [{ label: "AirOps pricing", url: "https://www.airops.com/pricing" }],
		},
	},
	scrunch: {
		pricing: {
			verified: VERIFIED,
			summary:
				"Scrunch publishes two self-serve plans from $300/mo month to month ($250/mo billed annually). Sitecore acquired it in June 2026.",
			plans: [
				{
					name: "Starter",
					price: "$300/mo",
					billedAnnually: "$250/mo",
					includes: "350 custom prompts, 1,000 industry prompts, 3 seats, 3 personas, 5 page audits.",
				},
				{
					name: "Growth",
					price: "$500/mo",
					billedAnnually: "$417/mo",
					includes: "700 custom prompts, 2,500 industry prompts, 5 seats, 5 personas, 10 page audits.",
				},
				{ name: "Enterprise", price: "Custom", includes: "SSO and the Enterprise Data API." },
			],
			extraCosts: ["Extra seats are $25/mo each."],
			sources: [
				{ label: "Scrunch pricing", url: "https://scrunch.com/pricing" },
				{
					label: "Sitecore acquisition announcement",
					url: "https://www.sitecore.com/de-de/company/newsroom/press-releases/2026/06/sitecore-acquires-scrunch-to-help-brands-influence-discovery--and-buying-decisions",
				},
			],
		},
	},
	dataforseo: {
		pricing: {
			verified: VERIFIED,
			summary:
				"DataForSEO is pay-as-you-go with no subscription: you top up a balance (minimum $50) and each API call is charged per request.",
			plans: [
				{
					name: "LLM Scraper",
					price: "$0.0012 to $0.004 per page",
					includes: "ChatGPT and Gemini answers scraped from the real interface; price depends on queue speed.",
				},
				{
					name: "Google AI Mode SERP",
					price: "$0.0012 to $0.004 per SERP",
					includes: "AI Mode results; AI Overviews come inside regular Google SERPs from $0.0006.",
				},
				{
					name: "LLM Responses",
					price: "From $0.0006 per task",
					includes: "Direct model calls to ChatGPT, Claude, Gemini, and Perplexity, plus the provider's token costs.",
				},
				{
					name: "LLM Mentions",
					price: "$0.10 per request + $0.001 per row",
					includes: "Brand and keyword mentions from DataForSEO's own database of AI answers.",
				},
			],
			extraCosts: [
				"$50 minimum top-up and a $1 trial credit.",
				"You build the tracking: scheduling, parsing, storage, and dashboards are not included.",
			],
			sources: [
				{ label: "DataForSEO pricing", url: "https://dataforseo.com/pricing" },
				{ label: "DataForSEO AI Optimization API", url: "https://dataforseo.com/apis/ai-optimization-api" },
				{ label: "LLM Mentions pricing", url: "https://dataforseo.com/pricing/ai-optimization/llm-mentions" },
			],
		},
		alternatives: {
			title: "DataForSEO Alternatives: Free & Open-Source Options (2026) · Elmo",
			description:
				"The best DataForSEO alternatives for AI search data: LLM scraping APIs compared on coverage, cost, and reliability, plus Elmo, the free open-source tracker that can run on DataForSEO or replace it.",
			sections: [
				{
					title: "DataForSEO competitors for AI search data",
					paragraphs: [
						"If you use DataForSEO to pull ChatGPT, Google AI Mode, or AI Overview answers, the direct competitors are the other LLM scraping APIs. We run all five below in production behind Elmo, so the coverage and cost figures come from our own usage. The full breakdown, including reliability by engine, is in our guide to the best LLM scraping APIs.",
					],
					table: {
						columns: ["Provider", "Engines scraped", "Cost per prompt a month", "Minimum spend"],
						rows: [
							["Cloro", "ChatGPT, AI Mode, AI Overview, Gemini, Perplexity, Copilot", "~$0.65", "$30/mo plan"],
							[
								"BrightData",
								"ChatGPT, AI Mode, AI Overview, Gemini, Perplexity, Copilot",
								"~$0.45",
								"$10, pay as you go",
							],
							["Oxylabs", "ChatGPT, AI Mode, AI Overview, Perplexity", "~$0.15", "$49/mo plan"],
							["Olostep", "ChatGPT, AI Mode, AI Overview, Gemini, Perplexity, Copilot", "~$2.25", "Pay as you go"],
							["DataForSEO", "ChatGPT, AI Mode, AI Overview, Gemini (Perplexity via API)", "~$1.20", "$50 top-up"],
						],
						caption: "Cost per prompt assumes five runs a day across ChatGPT and Google AI Mode.",
					},
					links: [{ text: "The best LLM scraping APIs, compared", href: "/blog/best-llm-scraping-apis" }],
				},
				{
					title: "When you want a tracker, not an API",
					paragraphs: [
						"DataForSEO sells raw responses. To turn them into AI visibility tracking you still have to schedule prompts, parse brand mentions and citations, store the history, and build reporting. Elmo is that layer, open source. Self-host it for free and point it at DataForSEO, or at any of the providers above, and you get mention rates, share of voice, citations, and sentiment without writing the pipeline yourself.",
						"If you would rather not run anything, Elmo Cloud includes the scraping, starting at $29/mo.",
					],
					links: [
						{ text: "Elmo pricing", href: "/pricing" },
						{ text: "Open-source AI visibility tools", href: "/ai-visibility-tools/category/open-source" },
					],
				},
			],
			faqs: [
				{
					question: "What is the best free alternative to DataForSEO for AI search tracking?",
					answer:
						"Elmo is free and open source to self-host. It does the tracking, reporting, and analysis that DataForSEO leaves to you, and it can use DataForSEO, BrightData, Oxylabs, Olostep, or Cloro as its data source, so you only pay your scraping provider.",
				},
				{
					question: "Who are DataForSEO's main competitors for LLM and AI Overview data?",
					answer:
						"For scraped AI answers, the main alternatives are Cloro, BrightData, Oxylabs, and Olostep. They differ most on which engines they cover (only some reach Copilot and Perplexity), price per result, and how often runs fail.",
				},
			],
		},
	},
	promptwatch: {
		pricing: {
			verified: VERIFIED,
			summary:
				"Promptwatch has three self-serve plans from $95/mo, priced by projects and prompts, and custom Enterprise.",
			plans: [
				{ name: "Essential", price: "$95/mo", includes: "1 project, 50 prompts, 6,000 responses, daily tracking." },
				{
					name: "Professional",
					price: "$245/mo",
					includes: "2 projects, 150 prompts, 18,000 responses, content writing and refresh.",
				},
				{
					name: "Business",
					price: "$579/mo",
					includes: "5 projects, 350 prompts, 42,000 responses, state and city tracking, Shopping Insights.",
				},
				{ name: "Enterprise", price: "Custom", includes: "Custom prompt and crawler volume." },
			],
			extraCosts: ["Essential and Professional have a 7-day free trial; Business starts with a demo."],
			costPerAnswer: "About $0.016 per response on Essential ($95 for 6,000).",
			sources: [{ label: "Promptwatch pricing", url: "https://www.promptwatch.com/pricing" }],
		},
		alternatives: {
			title: "Promptwatch Alternatives: Cheaper & Open-Source Options (2026) · Elmo",
			description:
				"The best Promptwatch alternatives for AI visibility tracking, with current pricing, what you get per plan, and Elmo, the open-source option from free to $29/mo.",
			sections: [
				{
					title: "Promptwatch vs the alternatives",
					paragraphs: [
						"Promptwatch collects answers from the real AI interfaces rather than model APIs, tracks a long list of engines on every paid plan, and adds content writing from its Professional plan and shopping insights on Business. If you want tracking and content production in one subscription, that bundle is its strength.",
						"The usual reasons to compare alternatives are price and scope. The entry plan is $95/mo for 50 prompts and one project, and much of the higher tiers' value is in content and commerce features that a team focused on measurement may not use. Elmo also scrapes the real ChatGPT, Google AI Mode, AI Overviews, Copilot, Perplexity, and Gemini interfaces, starts at $29/mo, and is free to self-host.",
					],
					links: [
						{ text: "Elmo pricing", href: "/pricing" },
						{ text: "Tools that capture real UI answers", href: "/ai-visibility-tools/features/real-ui-answers" },
					],
				},
			],
			faqs: [
				{
					question: "Is there a cheaper alternative to Promptwatch?",
					answer:
						"Yes. Promptwatch starts at $95/mo for 50 prompts. Elmo Cloud starts at $29/mo, its $99/mo Basic plan runs 50 prompts on four platforms up to four times a day, and self-hosting Elmo is free.",
				},
			],
		},
	},
	nightwatch: {
		pricing: {
			verified: VERIFIED,
			summary:
				"Nightwatch bundles AI tracking into its rank-tracking plans, priced in euros, from €79/mo billed yearly.",
			plans: [
				{
					name: "Starter",
					price: "€79/mo, billed yearly",
					includes: "50 AI prompts, 1,500 AI answers a month, 500 keywords.",
				},
				{
					name: "Professional",
					price: "€159/mo, billed yearly",
					includes: "150 AI prompts, 4,500 AI answers a month, 2,500 keywords.",
				},
				{
					name: "Agency",
					price: "€399/mo, billed yearly",
					includes: "500 AI prompts, 15,000 AI answers a month, 7,500 keywords.",
				},
				{ name: "Enterprise", price: "Custom", includes: "Unlimited prompts, 20,000+ keywords." },
			],
			extraCosts: ["Every plan includes unlimited seats and no add-ons; there is a 14-day trial with no card."],
			costPerAnswer: "About €0.053 per AI answer on Starter (€79 for 1,500), with keyword tracking included.",
			sources: [
				{ label: "Nightwatch pricing", url: "https://nightwatch.io/pricing/" },
				{ label: "Nightwatch AI tracking", url: "https://nightwatch.io/ai-tracking/" },
			],
		},
		alternatives: {
			title: "Nightwatch Alternatives for AI & LLM Tracking (2026) · Elmo",
			description:
				"Nightwatch alternatives for tracking your brand in ChatGPT, Gemini, Perplexity, and Google AI Overviews, with Nightwatch's current pricing and Elmo, the open-source option.",
			sections: [
				{
					title: "What Nightwatch is, and when to look elsewhere",
					paragraphs: [
						"Nightwatch is an SEO rank tracker that added AI visibility tracking: you get keyword rankings and AI answers from ChatGPT, Claude, Gemini, Perplexity, and Google AI Mode and AI Overviews in one tool. If you need both and like having one bill, it is a reasonable fit.",
						"Teams look for alternatives when AI answers become the main thing they report on. Nightwatch's AI allowance is sized next to its keyword plans (1,500 AI answers a month on Starter), so tracking more prompts more often means moving up a rank-tracking tier. A dedicated AI visibility tool puts the budget into answers instead.",
					],
					links: [
						{ text: "SEO platforms with AI search tracking", href: "/ai-visibility-tools/category/seo" },
						{ text: "Elmo pricing", href: "/pricing" },
					],
				},
			],
		},
	},
	"local-falcon": {
		pricing: {
			verified: VERIFIED,
			summary:
				"Local Falcon sells credits, where one credit is one point on a geo-grid scan, from $24.99/mo. AI visibility scans use the same grid.",
			plans: [
				{
					name: "Starter",
					price: "$24.99/mo",
					billedAnnually: "$299.88/yr",
					includes: "7,500 credits a month, unlimited keywords and locations.",
				},
				{ name: "Basic", price: "$49.99/mo", billedAnnually: "$599.88/yr", includes: "15,150 credits a month." },
				{ name: "Pro", price: "$99.99/mo", billedAnnually: "$1,199.88/yr", includes: "31,250 credits a month." },
				{ name: "Premium", price: "$199.99/mo", billedAnnually: "$2,399.88/yr", includes: "63,150 credits a month." },
				{ name: "Enterprise", price: "$499 to $4,999/mo", includes: "Higher credit volumes." },
			],
			extraCosts: [
				"A 5x5 grid scan costs 25 credits, so bigger grids and more platforms use credits fast.",
				"Monthly credits expire each month; pay-as-you-go credits are $0.05 each and do not expire.",
			],
			sources: [
				{ label: "Local Falcon pricing", url: "https://www.localfalcon.com/pricing" },
				{
					label: "Local Falcon: AI visibility scans",
					url: "https://www.localfalcon.com/knowledge-base/kb95-how-to-run-ai-visibility-scans",
				},
			],
		},
		alternatives: {
			title: "Local Falcon Alternatives: Free & Open-Source Options (2026) · Elmo",
			description:
				"Local Falcon alternatives for AI visibility tracking, with Local Falcon's credit pricing explained and Elmo, the free open-source option for brands that don't need geo-grids.",
			sections: [
				{
					title: "Local Falcon alternatives depend on what you track",
					paragraphs: [
						"Local Falcon is built for local SEO. It runs geo-grid scans that show how a business ranks point by point across a map, and it applies the same grid to AI answers from ChatGPT, Gemini, Google AI Overviews, AI Mode, and Grok, reported as Share of AI Visibility (SAIV).",
						"If you run a multi-location business and need that map view, the closest alternatives are other local rank trackers. If what you need is how AI engines describe your brand and its competitors for the questions buyers ask, a dedicated AI visibility tracker fits better, and the alternatives below are the ones to compare. Elmo does not run geo-grids; it tracks prompts across engines, and it is free to self-host.",
					],
					links: [
						{
							text: "AI visibility tools with geographic tracking",
							href: "/ai-visibility-tools/features/geographic-tracking",
						},
						{ text: "Open-source AI visibility tools", href: "/ai-visibility-tools/category/open-source" },
					],
				},
			],
			faqs: [
				{
					question: "Does Elmo do geo-grid tracking like Local Falcon?",
					answer:
						"No. Elmo tracks how AI engines answer a set of prompts and does not run map-based geo-grid scans. If point-by-point local rankings are what you need, Local Falcon or another local rank tracker is the better fit.",
				},
			],
		},
	},
};

export function getCompetitorProfile(slug: string): CompetitorProfile | undefined {
	return competitorProfiles[slug];
}
