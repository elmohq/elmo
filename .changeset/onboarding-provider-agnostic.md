---
"@elmohq/cli": patch
"@workspace/lib": patch
"@workspace/web": patch
"@workspace/worker": patch
---

Onboarding + low-latency LLM tasks (sentiment scoring, ad-hoc analysis) now run against a direct API provider via AI SDK `generateObject` with web search baked in where the provider supports it. Onboarding returns the canonical brand name, additional brand domains, aliases, products, competitors (each with their own domains/aliases) and tagged starter prompts in a single structured call — no JSON parsing on our side.

The CLI's `elmo init` adds a "Recommended" path (4 prompts: pick scraper, scraper key, pick direct API, direct API key) and a "Custom" path that requires at least one direct API before scrapers/extras can be configured. Each direct API provider declares its own default research model and `runStructuredResearch` impl: Anthropic and OpenAI use `generateText` + native web-search tools + `experimental_output: Output.object(schema)`, OpenRouter uses `generateObject` against a `:online`-suffixed slug, Mistral uses an OpenAI-compat shim. The in-app wizard simplifies to "analyze → review → save", and `POST /api/v1/onboarding/analyze` + `POST /api/v1/onboarding/brands` expose the same pipeline for white-label deployments. Two-pass scrape, regex extraction, and the screen-scraper fallback path are gone.
