---
"@workspace/lib": minor
"@workspace/worker": minor
"@workspace/web": minor
"@elmohq/cli": minor
---

Add multi-provider AI engine scraping with Olostep, BrightData, and OpenRouter support.

Configure which AI engines to track via the `SCRAPE_TARGETS` environment variable using the `engine:provider[:model][:online]` format. Supports ChatGPT, Google AI Mode, Google AI Overview, Gemini, Copilot, Perplexity, Grok, and any custom engine via OpenRouter.

**Breaking change:** The `SCRAPE_TARGETS` environment variable is now required. See the [migration guide](https://docs.elmohq.com/docs/deployment/providers#migration-from-previous-versions) for equivalent values if upgrading from a previous version.
