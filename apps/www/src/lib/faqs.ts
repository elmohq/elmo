export interface FaqItem {
	question: string;
	answer: string;
}

// Homepage FAQ. Rendered visibly on "/" and emitted as FAQPage JSON-LD from the
// same route, so the structured data always matches what a reader (or an AI
// crawler) sees on the page.
export const HOME_FAQS: FaqItem[] = [
	{
		question: "What is Elmo?",
		answer:
			"Elmo is an open-source AI visibility platform for Answer Engine Optimization (AEO) — an alternative to tools like Profound, Peec, and Otterly that you can self-host for free or run on Elmo Cloud. It tracks how AI answer engines — including ChatGPT, Google AI Overviews, Perplexity, Gemini, Claude, and Copilot — mention your brand, which competitors appear alongside you, and which sources each model cites.",
	},
	{
		question: "What is Answer Engine Optimization (AEO)?",
		answer:
			"Answer Engine Optimization (AEO) — also called Generative Engine Optimization (GEO) or LLM Optimization (LLMO) — is the practice of measuring and improving how often AI answer engines mention and cite your brand. Instead of ranking in a list of blue links, the goal is to be the source an AI quotes in its answer. (LLMO is also where Elmo gets its name.)",
	},
	{
		question: "What is the difference between AEO, GEO, and SEO?",
		answer:
			"SEO is about ranking pages in traditional search results, while AEO and GEO are two names for the same newer discipline: getting mentioned and cited inside AI-generated answers from tools like ChatGPT, Perplexity, and Google AI Overviews. The two overlap, because AI engines run web searches and cite the pages they find, but success is measured differently — by how often and how favorably an AI names your brand, not by your position on a results page. Elmo measures the AEO side, including the web searches AI engines fan a prompt out into and the sources they cite.",
	},
	{
		question: "Which AI models does Elmo track?",
		answer:
			"Elmo tracks ChatGPT, Google AI Mode, Google AI Overviews, Gemini, Perplexity, Copilot, and Claude, plus models like Grok, Mistral, DeepSeek, and Qwen. Consumer products like ChatGPT and Google AI Mode are scraped from the real interface your customers see, not approximated through an API. For each answer, Elmo records whether your brand appears, which competitors show up alongside it, and which sources the model cites.",
	},
	{
		question: "How is AI visibility measured?",
		answer:
			"Elmo runs a fixed set of prompts across AI engines on a schedule and scores each prompt by how often your brand appears in the answers, from 0 to 100%. It also calculates share of voice — your share of brand mentions versus your competitors — and breaks down which domains and URLs the models cite. Because AI answers vary from run to run, Elmo samples repeatedly and reports trends, not single results.",
	},
	{
		question: "How do I track my brand in ChatGPT?",
		answer:
			"Add your website to Elmo and its Prompt Wizard generates the questions your buyers are likely to ask ChatGPT, based on your products, competitors, and personas. Elmo then runs those prompts in ChatGPT on a schedule and records every answer: whether your brand was mentioned, which competitors were named, and which sources were cited. Every Elmo Cloud plan includes ChatGPT, starting with the $29/mo Starter plan.",
	},
	{
		question: "How much does Elmo cost compared to Profound?",
		answer:
			"Elmo Cloud starts at $29/mo for the Starter plan, which is 1/3 the price of Profound's equivalent plan. The $99/mo Basic plan gives you 4× the data of Profound's equivalent plan. Pro ($299/mo) and Business ($649/mo) add more brands, more prompts, and premium grounded models, and self-hosting Elmo is free.",
	},
	{
		question: "Is Elmo free?",
		answer:
			"Elmo is free and open source to self-host — there is no license fee and no per-seat pricing. You only pay for your own infrastructure and any AI provider API keys you choose to use. If you'd rather not run it yourself, managed Elmo Cloud starts at $29/mo, and white-label plans are available for agencies.",
	},
];

// Pricing page FAQ.
export const PRICING_FAQS: FaqItem[] = [
	{
		question: "Is Elmo free?",
		answer:
			"Yes. Elmo is free and open source to self-host, forever. There is no license fee and no per-seat pricing — you only pay for your own infrastructure and the AI provider API keys you choose to use.",
	},
	{
		question: "Is there a hosted or cloud version of Elmo?",
		answer:
			"Yes. Elmo Cloud is managed hosting for teams that would rather not run their own infrastructure, starting at $29/mo. You can also self-host Elmo for free, or get in touch about white-label deployments.",
	},
	{
		question: "Can agencies white-label Elmo?",
		answer:
			"White-label deployments are available for agencies that want to offer AI visibility tracking under their own brand, with multi-client dashboards and custom branding. Get in touch about setting up a white-label instance for your agency.",
	},
	{
		question: "What do I need to run Elmo myself?",
		answer:
			"Elmo runs as a Docker Compose stack managed by a CLI. Install it, run the interactive init, and it's up in a couple of commands. You can use the bundled database or connect Elmo to your own PostgreSQL database.",
	},
	{
		question: "Do I need a credit card to get started?",
		answer:
			"No. Self-hosting Elmo does not require an account or a credit card. Clone the open-source repository, deploy with the CLI, and start tracking your AI visibility.",
	},
	{
		question: "Do I need to talk to sales to use Elmo Cloud?",
		answer:
			"No. Elmo Cloud is fully self-serve: you sign up, pick a plan, and start tracking without a demo or sales call. Every plan includes unlimited seats plus API and MCP access, and annual billing gets you two months free. Only custom contracts (higher sampling rates, custom limits, or white label) go through a conversation.",
	},
	{
		question: "How often does Elmo run my prompts?",
		answer:
			"On Elmo Cloud, the Starter plan runs each prompt once a day, and the Basic, Pro, and Business plans run each prompt up to 4 times a day on every platform you choose. Premium grounded models run once a day, and custom plans can sample more often. When you self-host Elmo, you set the schedule yourself.",
	},
	{
		question: "Does Elmo have an API or MCP server?",
		answer:
			"Yes. Elmo has a REST API for brands, prompts, competitors, analytics, citations, runs, and reports, and an MCP server so AI assistants like Claude Code, Codex, Cursor, and VS Code can query your visibility data and manage prompts directly. Both are included on every Elmo Cloud plan and in every self-hosted instance. API keys can be read-only or read-write and limited to specific brands.",
	},
	{
		question: "Is my data private if I self-host Elmo?",
		answer:
			"Yes. A self-hosted Elmo instance stores your brands, prompts, and AI responses in your own PostgreSQL database, and prompts are only sent to the scraping and AI providers you configure. Elmo's optional telemetry sends anonymous usage counts and never includes brand names, prompt text, responses, or API keys, and you can turn it off completely with DISABLE_TELEMETRY=1.",
	},
];

// Off-Site AEO service FAQ. Rendered on "/off-site-aeo" and emitted as FAQPage
// JSON-LD from the same route.
export const OFFSITE_FAQS: FaqItem[] = [
	{
		question: "How does the off-site AEO service work?",
		answer:
			"It starts with a call where we review how AI answer engines currently talk about you and pick the prompts and gaps to target. Within 30 days, that month's posts are planned, written, humanized, and live on high-authority sites, and you get a report tying each placement to the issue it targets. We then keep publishing for you every month, adjusting the targets as your visibility shifts.",
	},
	{
		question: "Are the articles AI-generated?",
		answer:
			"Yes, and we're upfront about it. We draft with AI, then it is reworked until it lands under a 25% AI-detection score on both ZeroGPT and Pangram before it goes live. The result reads like human writing, and it lives on sites the models cite.",
	},
	{
		question: "Do you offer refunds?",
		answer:
			"No. All plans are non-refundable. We commission and place real editorial inventory on third-party sites as soon as your month begins, so those costs are committed up front. You can cancel future months at any time before that cycle's work starts.",
	},
	{
		question: "How is this different from buying backlinks?",
		answer:
			"It's a similar process. Many backlink services offer low-quality placements with high spam scores and no traffic. They also make you write the content yourself — or generate it, which is easy to detect. We do neither: the content is useful for AEO, it only goes on high-quality sites, and it's humanized.",
	},
	{
		question: "Will this help my traditional SEO too?",
		answer:
			"These all provide dofollow links on high-DR domains with actual traffic, so your search rankings should benefit as well. But the primary goal is giving AI answer engines more reasons to mention you.",
	},
];

// AI Visibility Tool Directory FAQ.
export const DIRECTORY_FAQS: FaqItem[] = [
	{
		question: "What is an AI visibility tool?",
		answer:
			"An AI visibility tool tracks how AI answer engines like ChatGPT, Perplexity, Gemini, and Google AI Overviews mention and cite your brand. It measures how often you appear in AI answers, which competitors show up alongside you, and which sources the models reference.",
	},
	{
		question: "What is Answer Engine Optimization (AEO)?",
		answer:
			"Answer Engine Optimization (AEO), also called generative engine optimization (GEO), is the practice of improving how often AI answer engines mention and cite your brand. AI visibility tools measure that presence so you can track and improve it over time.",
	},
	{
		question: "How do I choose the best AI visibility tool?",
		answer:
			"The right tool depends on which AI engines you need to track, whether you want self-hosting and data ownership, your budget, and any agency or white-label needs. This directory compares 100+ tools feature-by-feature so you can match a tool to your requirements.",
	},
	{
		question: "Is there an open-source AI visibility tool?",
		answer:
			"Yes. Elmo is an open-source, self-hostable AI visibility platform. You can run it on your own infrastructure for free, audit exactly how each metric is calculated, and export your data at any time.",
	},
	{
		question: "How does AI visibility tracking work?",
		answer:
			"AI visibility tracking works by running a defined set of prompts across AI engines on a schedule, then recording whether each answer mentions your brand, cites your site, and how it describes you. Sampling over time reveals trends a one-off check would miss.",
	},
	{
		question: "Can you track brand mentions in ChatGPT?",
		answer:
			"Yes. AI visibility software queries ChatGPT with your prompts and records whether it mentions or cites your brand. Because answers vary between runs, tracking a consistent prompt set on a schedule gives a far more reliable read than a single manual check.",
	},
];
