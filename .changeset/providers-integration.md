---
"@workspace/lib": minor
"@workspace/worker": minor
"@workspace/web": minor
"@elmohq/cli": minor
---

Add multi-provider AI engine scraping with Olostep, BrightData, and OpenRouter support.

Configure which AI engines to track via the `SCRAPE_TARGETS` environment variable using the `engine:provider[:model][:online]` format. Supports ChatGPT, Google AI Mode, Google AI Overview, Gemini, Copilot, Perplexity, Grok, and any custom engine via OpenRouter.

Existing deployments continue working without changes — if `SCRAPE_TARGETS` is not set, the system derives equivalent configuration from legacy API key environment variables.
