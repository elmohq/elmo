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
			"Elmo is an open-source AI visibility platform for Answer Engine Optimization (AEO). It tracks how AI answer engines — including ChatGPT, Google AI Overviews, Perplexity, Gemini, Copilot, and Grok — mention your brand, which competitors appear alongside you, and which sources each model cites.",
	},
	{
		question: "What is Answer Engine Optimization (AEO)?",
		answer:
			"Answer Engine Optimization (AEO), also called generative engine optimization (GEO), is the practice of measuring and improving how often AI answer engines mention and cite your brand. Instead of ranking in a list of blue links, the goal is to be the source an AI quotes in its answer.",
	},
	{
		question: "Which AI models does Elmo track?",
		answer:
			"Elmo runs your prompts across every major AI answer engine, including ChatGPT, Google AI Overviews, Perplexity, Gemini, Copilot, and Grok. It records how often your brand appears, which competitors show up alongside it, and which sources the models cite.",
	},
	{
		question: "Is Elmo really open source?",
		answer:
			"Yes. Every line of Elmo is open source and available on GitHub. You can read the code, self-host the platform on your own infrastructure for free, and verify exactly how each visibility metric is collected and calculated.",
	},
	{
		question: "Is Elmo free?",
		answer:
			"Elmo is free and open source to self-host — there is no license fee and no per-seat pricing. You only pay for your own infrastructure and any AI provider API keys you choose to use. Managed cloud hosting and white-label plans are also available.",
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
			"Managed cloud hosting is coming soon for teams that would rather not run their own infrastructure. Until then, you can self-host Elmo for free or get in touch about early access and managed deployments.",
	},
	{
		question: "Can agencies white-label Elmo?",
		answer:
			"White-label deployments are available for agencies that want to offer AI visibility tracking under their own brand, with multi-client dashboards and custom branding. Get in touch about setting up a white-label instance for your agency.",
	},
	{
		question: "What do I need to run Elmo myself?",
		answer:
			"Elmo runs as a Docker Compose stack, all managed with a simple CLI — install it, run the interactive init, and bring everything up in a couple of commands. You can use the bundled database or connect Elmo to your own PostgreSQL database.",
	},
	{
		question: "Do I need a credit card to get started?",
		answer:
			"No. Self-hosting Elmo does not require an account or a credit card. Clone the open-source repository, deploy with the CLI, and start tracking your AI visibility.",
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
];
