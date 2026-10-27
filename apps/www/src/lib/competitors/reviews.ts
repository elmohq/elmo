import type { CompetitorReview } from "./profiles";

const VERIFIED = "2026-10-27";

export const competitorReviews: Record<string, CompetitorReview> = {
	profound: {
		verified: VERIFIED,
		verdict:
			"Profound is the most complete enterprise AEO suite we track: daily answers from the real interfaces of up to nine answer engines, prompt-volume estimates, AI crawler analytics, content agents, and ChatGPT Shopping, backed by a $180M Series D in September 2026. The trade-off is how you buy it. There is no published paid plan for brands, the trial is a fixed prompt set for seven days, and the API, exports, and history are Enterprise-only. It suits large marketing teams with a budget and a procurement process; smaller teams usually get more from a self-serve tool.",
		bestFor:
			"Enterprise marketing teams that want AI visibility, crawler analytics, and content agents in one contract.",
		engines:
			"Up to nine on Enterprise: ChatGPT, Perplexity, Google AI Mode, Google AI Overviews, Gemini, Microsoft Copilot, Claude, DeepSeek, and either Exa Search or Grok (Profound's own pages list one or the other). The trial covers ChatGPT, Gemini, and Google AI Overviews.",
		collection:
			"Profound says it queries the front-end experiences people use rather than model APIs, and runs each prompt once a day, in 30+ languages and 150+ regions.",
		features: [
			{
				name: "Answer Engine Insights",
				detail:
					"Visibility score, share of voice, sentiment, citations, average position, query fan-out, and FactCheck, which flags inaccurate claims about you and the sources behind them.",
			},
			{
				name: "Agent Analytics",
				detail:
					"Reads server and CDN logs to show AI crawler visits and AI-referred traffic. Profound's FAQ says managed platforms such as Shopify and Squarespace can't be connected.",
			},
			{
				name: "Prompt Volumes",
				detail:
					"Estimated demand for AI prompts, built from licensed consumer panels and refreshed weekly, covering ChatGPT, Gemini, and Perplexity.",
			},
			{
				name: "Shopping",
				detail: "Product and merchant visibility in ChatGPT Shopping, down to the SKU.",
			},
			{
				name: "Agents and AI Marketer",
				detail:
					"No-code content workflows that can publish to a CMS, plus a background agent that ranks opportunities each week. Both draw on a credit allotment.",
			},
			{
				name: "API and integrations",
				detail:
					"REST API with Python and JavaScript SDKs, an MCP server, and Tableau and Looker connectors on Enterprise, plus GA4, Search Console, CDN, and CMS integrations.",
			},
		],
		pros: [
			"The broadest enterprise feature set in the category, from tracking to content agents and crawler analytics.",
			"Answers collected from the engines' real interfaces, in many languages and regions.",
			"Prompt-volume estimates from consumer panels, which few trackers offer.",
			"Well funded, with a long list of enterprise customers including MongoDB, Ramp, Figma, and Plaid.",
		],
		cons: [
			"No self-serve paid plan for brands: after a 7-day trial, Enterprise is quoted by sales.",
			"The trial uses a fixed industry prompt set you can't edit, with no history or export.",
			"API access, exports, and data history are Enterprise-only.",
			"Two meters to manage: prompts set by contract, and credits for AI work that can run into overage.",
			"Each prompt runs once a day, so day-to-day noise in AI answers isn't averaged out.",
			"Closed source, so you can't check how scores are calculated.",
		],
		pickIf: [
			"You are an enterprise team that buys through procurement and wants one vendor for tracking, crawler analytics, and content production.",
			"You need ChatGPT Shopping tracking or panel-based prompt volumes.",
			"You are an agency that wants Profound's per-client agency plan.",
		],
		lookElsewhereIf: [
			"You want to see a price and start without a sales call.",
			"You track a few dozen prompts and don't need content agents or crawler analytics.",
			"You want more than one sample a day per prompt, or to own and audit the data.",
		],
		migration: [
			"Export what you can first. On Enterprise you can download prompts and topics as CSV or JSON, and the API returns raw answers with mentions, citations, and search queries for each run. The trial has no export, so trial users start fresh.",
			"Paste your prompt list into Elmo's bulk prompt box, or let the Prompt Wizard generate a starting set from your site, then add the competitors you tracked in Profound.",
			"Run both tools side by side for a couple of weeks. The methods differ (Elmo samples up to four times a day on paid plans), so compare trends rather than expecting identical numbers.",
			"Keep your exported history as a baseline. It won't import into Elmo's charts, but Elmo's API and database make it easy to join for your own reporting.",
		],
		elmoComparison: [
			{ label: "Getting started", competitor: "7-day trial, then a sales call", elmo: "Self-serve signup from $29/mo" },
			{
				label: "Published pricing",
				competitor: "Enterprise is custom-quoted",
				elmo: "Every plan, on the pricing page",
			},
			{ label: "Sampling", competitor: "Once a day", elmo: "Up to 4× a day from the $99/mo Basic plan" },
			{ label: "API and MCP", competitor: "Enterprise only", elmo: "Every plan" },
			{ label: "Content agents and crawler analytics", competitor: "Included", elmo: "Not offered" },
			{ label: "Open source", competitor: "No", elmo: "Yes, MIT-licensed and free to self-host" },
		],
		reviewFaqs: [
			{
				question: "Is Profound worth it?",
				answer:
					"For an enterprise team that will use its crawler analytics, prompt volumes, and content agents, Profound is the most complete suite on the market. If you mainly need to know how often AI engines mention and cite you, you will pay for a lot you don't use, and a self-serve tracker will cost far less.",
			},
			{
				question: "Which AI engines does Profound track?",
				answer:
					"Up to nine on Enterprise: ChatGPT, Perplexity, Google AI Mode, Google AI Overviews, Gemini, Microsoft Copilot, Claude, DeepSeek, and Exa Search or Grok, depending on which of Profound's pages you read. The free trial covers ChatGPT, Gemini, and Google AI Overviews.",
			},
			{
				question: "Is Profound open source?",
				answer:
					"No. Profound is a closed, hosted product. Elmo is an open-source alternative you can self-host for free or run on Elmo Cloud from $29/mo.",
			},
		],
		pricingFaqs: [
			{
				question: "How much does Profound cost?",
				answer:
					"Profound doesn't publish a paid price for brands. Its pricing page lists a free 7-day trial and an Enterprise plan quoted by sales. Agencies have a separate plan, launched in November 2025 at $399/mo per client workspace.",
			},
			{
				question: "Does Profound have a free plan?",
				answer:
					"No. It has a free 7-day trial with 50 prompts chosen for your industry, run daily on ChatGPT, Gemini, and Google AI Overviews, without history, exports, or API access.",
			},
			{
				question: "Is there a cheaper alternative to Profound?",
				answer:
					"Yes. Elmo Cloud starts at $29/mo with public, self-serve pricing, and its $99/mo Basic plan runs 50 prompts on four platforms up to four times a day. Self-hosting Elmo is free.",
			},
		],
		sources: [
			{ label: "Profound pricing", url: "https://www.tryprofound.com/pricing" },
			{ label: "Answer Engine Insights", url: "https://www.tryprofound.com/features/answer-engine-insights" },
			{ label: "Profound docs: REST API", url: "https://docs.tryprofound.com/rest-api/introduction" },
			{
				label: "Profound docs: exporting prompts",
				url: "https://docs.tryprofound.com/answer-engine-insights/export-prompts-and-topics",
			},
			{
				label: "Profound Series D announcement",
				url: "https://www.tryprofound.com/newsroom/profound-raises-usd180m-series-d-at-usd1-8b-valuation-to-build-the-ai-platform-for-marketing-teams",
			},
		],
	},
	"peec-ai": {
		verified: VERIFIED,
		verdict:
			"Peec AI is a polished, self-serve AI search analytics tool for marketing teams and agencies. It collects answers from the engines' real interfaces once a day, reports visibility, position, sentiment, and sources clearly, and includes CSV export and an MCP server on every plan. Its limits are in the packaging: each plan includes three models and more cost extra, Perplexity and the API-based models such as Claude are add-ons or Enterprise-only, and every prompt runs once a day. A strong pick for teams that want hosted dashboards for a few dozen to a few hundred prompts.",
		bestFor: "Marketing teams and agencies that want a hosted, self-serve tracker with clear dashboards.",
		engines:
			"Pick three on Starter, Pro, and Advanced from ChatGPT, Google AI Mode, Google AI Overviews, Microsoft Copilot, Gemini, and Naver AI. Perplexity is an add-on or Enterprise model, and Enterprise adds API-based models including Claude, GPT-5 Search, Grok, DeepSeek, Qwen, and Mistral.",
		collection:
			"Peec scrapes the engines' web interfaces as a logged-out user with browser automation, and runs each prompt once every 24 hours.",
		features: [
			{
				name: "Visibility overview",
				detail: "Visibility, position, sentiment, and share of voice, tracked daily against your competitors.",
			},
			{
				name: "Sources",
				detail:
					"Cited domains and URLs, query fan-outs, citation share, and a classification of each source as competitor, editorial, reference, or user-generated.",
			},
			{
				name: "Brand perception",
				detail: "Attribute scoring, recurring objections, and fact-checking against facts you set.",
			},
			{
				name: "Actions",
				detail: "Gap analysis, recommended owned and earned actions, and a content optimizer.",
			},
			{ name: "Prompt volume", detail: "A relative 1 to 5 demand score for each prompt." },
			{
				name: "Agent analytics",
				detail: "A crawlability audit, AI referral tracking, and crawler insights from CDN and log integrations.",
			},
			{
				name: "Integrations",
				detail:
					"CSV export and MCP on every plan, an API from Pro up according to the pricing table, and a Looker Studio connector from Advanced.",
			},
		],
		pros: [
			"Answers collected from the real interfaces people use.",
			"Clear, public self-serve pricing, with separate credit-based plans and free pitch workspaces for agencies.",
			"CSV export and an MCP server on every plan.",
			"Funded and growing: a $21M Series A in November 2025 and 3,500+ brands and agencies, by its own count.",
		],
		cons: [
			"Three models per plan; each extra model costs $35 to $165 a month depending on plan.",
			"Perplexity isn't in the base model menu, and Claude and other API models are Enterprise-only.",
			"Each prompt runs once a day.",
			"Peec's help center notes that logged-out ChatGPT answers often come without sources.",
			"Peec's own pages disagree on details such as which plans include the API and how many models Enterprise covers.",
			"Closed source and hosted only.",
		],
		pickIf: [
			"You want a hosted tool your marketing team can use without setup.",
			"You are an agency that wants credit-based plans and free pitch workspaces.",
			"Three engines per brand are enough for you.",
		],
		lookElsewhereIf: [
			"You need more than three engines without paying per model.",
			"You want several samples a day to smooth out noisy AI answers.",
			"You want to self-host or audit how the numbers are produced.",
		],
		migration: [
			"Export your data from Peec: every plan can download a full chat export as CSV per project, and on API plans you can pull prompts, chats, and sources as JSON.",
			"Paste your prompt list into Elmo's bulk prompt box and add the same competitors, so your share of voice is measured against the same field.",
			"Pick your platforms. Elmo's paid plans let each brand track four platforms, including Perplexity, without per-model add-ons.",
			"Run both for a couple of weeks and compare trends, not single days. Elmo samples up to four times a day, so its numbers move more smoothly than a once-a-day series.",
		],
		elmoComparison: [
			{ label: "Entry price", competitor: "$95/mo (€85 in Europe)", elmo: "$29/mo, or free to self-host" },
			{
				label: "Around $100/mo",
				competitor: "Starter: 50 prompts, 3 models, once a day",
				elmo: "Basic ($99): 50 prompts, 4 platforms, up to 4× a day",
			},
			{ label: "Extra engines", competitor: "$35 to $165/mo per model", elmo: "No per-model fees" },
			{ label: "API", competitor: "From Pro ($245/mo)", elmo: "Every plan" },
			{ label: "Cost per AI answer", competitor: "About $0.021 on Starter", elmo: "About $0.004 on Basic" },
			{ label: "Open source", competitor: "No", elmo: "Yes, MIT-licensed" },
		],
		reviewFaqs: [
			{
				question: "Is Peec AI good?",
				answer:
					"Yes, for what it is: a well-designed hosted tracker with real-interface data, clear reporting, and fair self-serve pricing. Its main limits are three models per plan, once-a-day sampling, and extra cost for more engines.",
			},
			{
				question: "Which AI engines does Peec AI track?",
				answer:
					"On self-serve plans you choose three from ChatGPT, Google AI Mode, Google AI Overviews, Microsoft Copilot, Gemini, and Naver AI, and can buy more. Perplexity is an add-on, and Enterprise adds API-based models such as Claude, Grok, and DeepSeek.",
			},
			{
				question: "Is Peec AI open source?",
				answer:
					"No. Peec AI is a closed, hosted product based in Berlin. Elmo is an open-source alternative you can self-host for free or run on Elmo Cloud from $29/mo.",
			},
		],
		pricingFaqs: [
			{
				question: "How much does Peec AI cost?",
				answer:
					"Peec AI's self-serve plans are Starter at $95/mo, Pro at $245/mo, and Advanced at $495/mo, or $80, $205, and $420 a month billed annually. European visitors see euro prices from €85/mo. Enterprise is custom and annual.",
			},
			{
				question: "Does Peec AI have a free plan?",
				answer:
					"No. Peec AI offers a free trial on its plans, and agencies get free 7-day pitch workspaces, but there is no free tier.",
			},
			{
				question: "Is there a cheaper alternative to Peec AI?",
				answer:
					"Yes. Elmo Cloud starts at $29/mo, and its $99/mo Basic plan covers 50 prompts on four platforms up to four times a day, with no per-model add-ons. Self-hosting Elmo is free.",
			},
		],
		sources: [
			{ label: "Peec AI pricing", url: "https://peec.ai/pricing" },
			{ label: "Peec AI agency pricing", url: "https://peec.ai/pricing-agencies" },
			{ label: "Peec AI docs: how Peec works", url: "https://docs.peec.ai/intro-to-peec-ai" },
			{
				label: "Peec AI help: exporting data",
				url: "https://help.peec.ai/article/decision-lab-where-can-i-export-my-data-and-can-i-get-full-urls-5",
			},
			{
				label: "Tech.eu: Peec AI Series A",
				url: "https://tech.eu/2025/11/18/peec-ai-raises-21m-series-a-to-help-brands-win-in-ai-search/",
			},
		],
	},
	"otterly-ai": {
		verified: VERIFIED,
		verdict:
			"OtterlyAI is the most affordable established AI search monitoring tool. $29/mo gets you started, it checks four engines through their websites every day, and it adds practical extras like a GEO audit, prompt research, and Looker Studio reporting. The catch is that the entry price buys 15 prompts, Gemini, Google AI Mode, and Claude cost extra on every plan, and API and MCP access start on the $189/mo Standard plan. A good place for solo marketers and small teams to start; costs climb quickly once you want more prompts and all seven engines.",
		bestFor: "Solo marketers and small teams that want to start monitoring AI search cheaply.",
		engines:
			"ChatGPT, Google AI Overviews, Perplexity, and Microsoft Copilot on every plan. Google AI Mode, Gemini, and Claude are paid add-ons.",
		collection:
			"OtterlyAI sends prompts through each AI search's website rather than an API, except Claude, which it queries through the API using Haiku with web search. Prompts are tracked daily, each in one country.",
		features: [
			{
				name: "Brand visibility and share of voice",
				detail: "A Brand Visibility Index, share of voice, and competitor comparison across your prompts.",
			},
			{
				name: "Prompt monitoring",
				detail: "Per-prompt brand coverage, sentiment, estimated intent volume, mentions, and citations.",
			},
			{ name: "Citation tracking", detail: "Which domains and URLs AI answers cite, and how often." },
			{
				name: "GEO Audit",
				detail: "Checks one URL at a time for crawlability, AI readiness, and structured data.",
			},
			{
				name: "Prompt research and query fan-out",
				detail: "Tools for finding prompts to track and the searches behind an answer.",
			},
			{
				name: "Agent Analytics",
				detail: "AI crawler and agent traffic from server logs, on Standard and above.",
			},
			{
				name: "Integrations",
				detail:
					"CSV and JSON export of prompts, citations, and raw answers on every plan; Looker Studio, API, and MCP from Standard.",
			},
		],
		pros: [
			"The lowest entry price among the established trackers.",
			"Raw AI responses and citations export on every plan.",
			"Unlimited team members, countries, and languages.",
			"Recognized as a Gartner Cool Vendor (2025) and a European Search Awards winner (2026).",
		],
		cons: [
			"Lite includes 15 prompts and can't add more.",
			"Three of the seven engines are add-ons, priced up to $149/mo each for AI Mode and Gemini and $439/mo for Claude on Premium.",
			"Claude data comes from an API model, unlike the other six engines.",
			"API and MCP access start at $189/mo.",
			"No SOC 2 report yet; OtterlyAI lists it as on the roadmap without a date.",
			"Closed source and hosted only.",
		],
		pickIf: [
			"You want to start monitoring for under $30 a month.",
			"The four base engines cover where your buyers search.",
			"You'd use the GEO audit and prompt research tools alongside tracking.",
		],
		lookElsewhereIf: [
			"You need Gemini, Google AI Mode, or Claude without paying per engine.",
			"You need more than 15 prompts but not the $189/mo Standard plan.",
			"You need SOC 2, or want to self-host and own the data.",
		],
		migration: [
			"Export your prompts, citations, and raw AI responses from OtterlyAI as CSV or JSON; every plan includes this.",
			"Paste the prompt list into Elmo's bulk prompt box, add your competitors, and choose the four platforms you want per brand.",
			"Run both tools for a couple of weeks and compare trends. Elmo samples up to four times a day on paid plans, so expect smoother day-to-day numbers.",
		],
		elmoComparison: [
			{ label: "Entry price", competitor: "$29/mo for 15 prompts", elmo: "$29/mo for 50 prompts on ChatGPT" },
			{
				label: "Around $100 to $200/mo",
				competitor: "Standard ($189): 100 prompts, 4 base engines",
				elmo: "Basic ($99): 50 prompts, 4 platforms, up to 4× a day",
			},
			{ label: "Gemini, AI Mode, Claude", competitor: "Paid add-ons", elmo: "No per-engine fees" },
			{ label: "API and MCP", competitor: "From Standard ($189/mo)", elmo: "Every plan" },
			{ label: "Open source", competitor: "No", elmo: "Yes, MIT-licensed" },
		],
		reviewFaqs: [
			{
				question: "Is OtterlyAI any good?",
				answer:
					"It is a capable, inexpensive way to start monitoring AI search, with useful audit and research tools. The limits show as you grow: 15 prompts on Lite, paid add-ons for three of its seven engines, and API access from $189/mo.",
			},
			{
				question: "Which AI engines does OtterlyAI track?",
				answer:
					"ChatGPT, Google AI Overviews, Perplexity, and Microsoft Copilot on every plan, with Google AI Mode, Gemini, and Claude as paid add-ons.",
			},
			{
				question: "Is OtterlyAI open source?",
				answer:
					"No. OtterlyAI is a closed, hosted product from Austria. Elmo is an open-source alternative you can self-host for free or run on Elmo Cloud from $29/mo.",
			},
		],
		pricingFaqs: [
			{
				question: "How much does OtterlyAI cost?",
				answer:
					"OtterlyAI's plans are Lite at $29/mo, Standard at $189/mo, and Premium at $489/mo, with about 15% off billed annually. Enterprise is custom from 1,000 prompts. Google AI Mode, Gemini, and Claude cost extra on every plan.",
			},
			{
				question: "Does OtterlyAI have a free plan?",
				answer: "No. OtterlyAI offers a free trial with no credit card required, but no free tier.",
			},
			{
				question: "Is there a cheaper alternative to OtterlyAI?",
				answer:
					"Elmo starts at the same $29/mo but includes 50 prompts instead of 15, and its $99/mo Basic plan covers four platforms of your choice with no per-engine add-ons. Self-hosting Elmo is free.",
			},
		],
		sources: [
			{ label: "OtterlyAI pricing", url: "https://otterly.ai/pricing" },
			{ label: "OtterlyAI help: how data is collected", url: "https://help.otterly.ai/how-otterlyai-collects-data" },
			{ label: "OtterlyAI help: exporting data", url: "https://help.otterly.ai/can-i-export-my-data-and-reports" },
			{ label: "OtterlyAI help: compliance", url: "https://help.otterly.ai/compliance" },
			{
				label: "OtterlyAI: European Search Awards",
				url: "https://otterly.ai/blog/otterlyai-wins-european-search-awards/",
			},
		],
	},
};
