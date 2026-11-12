---
"@workspace/lib": patch
"@elmohq/cli": patch
"@workspace/web": patch
---

Perplexity now requires a sign-in, so no scraping provider can reach it and Elmo no longer scrapes it. On Elmo Cloud, Perplexity is no longer a scraped engine: brands that picked it have an open slot to fill under Settings → LLMs, and Perplexity is tracked through Sonar as a premium model instead. For self-hosted users, every scraped `perplexity` target is skipped after upgrading, so replace it in `SCRAPE_TARGETS` with `perplexity:openrouter:perplexity/sonar:online` or `perplexity:dataforseo:online` to keep collecting. The LLMs settings page lists any skipped scrape target with its replacement until you do. Sonar API runs cost 2-5x what a scrape did, and Sonar Pro and Sonar Reasoning Pro cost more still. Past Perplexity runs are kept.
