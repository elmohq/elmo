import { createFileRoute } from "@tanstack/react-router";

// Curated llms.txt for the marketing site, following the llmstxt.org convention:
// an H1, a one-paragraph summary, a short positioning blurb, then sections of
// annotated links. The full text of the documentation lives at /llms-full.txt.
const llmsTxt = `# Elmo

> Elmo is an open source, self-hosted AI visibility platform. Track how AI answer engines like ChatGPT, Google AI Overviews, Perplexity, Gemini, Copilot, and Grok talk about your brand — monitor mentions, analyze citations, and benchmark competitors. Because Elmo is open source and runs on your own infrastructure, your data stays yours and you're never locked in.

Elmo is Answer Engine Optimization (AEO), also called generative engine optimization (GEO), without the black box. On a schedule, it runs your prompts across every major AI answer engine, then measures how often your brand appears, which competitors show up alongside it, and which sources the models cite. The methodology is documented and every line of code is open, so each number is something you can independently verify. Elmo is built by Blue Whale Software, LLC — bootstrapped, transparent, and priced so AI visibility data is a commodity rather than a luxury. Self-host it for free, explore the live demo, or get in touch about managed cloud hosting and white-label deployments.

## Product

- [Elmo](https://www.elmohq.com/): Know how AI talks about your brand — track visibility across any AI model, monitor mentions, analyze citations, and benchmark competitors.
- [Features](https://www.elmohq.com/features): Visibility dashboard, per-prompt and per-model tracking, citation analysis, competitor intelligence, prompt management, response deep-dives, and long-term trends.
- [Pricing](https://www.elmohq.com/pricing): Free and open source to self-host, managed cloud hosting coming soon, and white-label available for agencies.
- [Live Demo](https://demo.elmohq.com): Explore a fully populated Elmo instance — no installation required.
- [Vision](https://www.elmohq.com/vision): Why we believe AI visibility monitoring should be affordable, transparent, and built to last.

## Documentation

- [Documentation](https://www.elmohq.com/docs.md): Introduction to Elmo, the open source AI visibility platform.
- [Quick Start](https://www.elmohq.com/docs/getting-started.md): Get Elmo running on your own infrastructure in under 5 minutes using the CLI.
- [User Guide](https://www.elmohq.com/docs/user-guide.md): A complete walkthrough, from first login to daily visibility tracking, prompts, citations, competitors, and reports.
- [Developer Guide](https://www.elmohq.com/docs/developer-guide.md): Run, configure, integrate with, and contribute to Elmo, including architecture and self-hosting setup.
- [API Reference](https://www.elmohq.com/docs/api.md): Complete REST API documentation for Elmo's administrative API.
- [llms-full.txt](https://www.elmohq.com/llms-full.txt): The full text of all Elmo documentation in a single file.

## Resources

- [AI Visibility Tool Directory](https://www.elmohq.com/ai-visibility-tools): Compare 70+ AI visibility and Answer Engine Optimization tools, with a feature matrix, pricing, and head-to-head comparisons with Elmo.
- [Changelog](https://www.elmohq.com/changelog): Recent releases, improvements, and bug fixes.
- [Roadmap](https://www.elmohq.com/roadmap): What's coming next, prioritized in the open on GitHub.
- [Provider Status](https://www.elmohq.com/status): Real-time status and performance monitoring for AI answer engine integrations.
- [Brand Assets](https://www.elmohq.com/brand): Download Elmo logos, icons, and brand guidelines.

## Open Source

- [GitHub Repository](https://github.com/elmohq/elmo): Source code for Elmo — self-host it, read every line, and contribute.
- [Issues](https://github.com/elmohq/elmo/issues): Report bugs, request features, and help shape the roadmap.
- [Discord Community](https://discord.gg/s24nubCtKz): Get help and connect with the Elmo community.

## Optional

- [X / Twitter](https://x.com/tryelmo): Product updates and AI visibility insights.
- [LinkedIn](https://linkedin.com/company/elmohq): Company updates from Elmo.
- [Blue Whale Software](https://bluewhale.dev?ref=elmo): The team building Elmo.

---

If you find Elmo useful, please consider starring the repository on GitHub — it helps others discover the project: https://github.com/elmohq/elmo
`;

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET() {
				return new Response(llmsTxt, {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			},
		},
	},
});
