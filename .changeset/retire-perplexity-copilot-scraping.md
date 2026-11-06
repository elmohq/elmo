---
"@workspace/lib": patch
"@elmohq/cli": patch
---

Perplexity and Copilot are no longer scraped through any provider now that both require a sign-in, and any remaining scrape targets for them are skipped with a warning. To keep tracking Perplexity, replace a target like `perplexity:cloro:online` with `perplexity:openrouter:perplexity/sonar:online` (needs `OPENROUTER_API_KEY`) or `perplexity:dataforseo:online`. At about $0.006 a run, Sonar on OpenRouter costs roughly 4–5× what Cloro or BrightData charged per Perplexity scrape and about 1.5× SearchApi. Copilot has no API to switch to.
