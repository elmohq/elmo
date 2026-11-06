---
"@workspace/lib": patch
"@elmohq/cli": patch
---

Perplexity and Copilot are no longer scraped by any provider since they both require a sign-in. Both are no longer available as scraped engines on Elmo Cloud. For self-hosted users that want to track Perplexity, you will need to switch from scraping providers to API providers by using OpenRouter or DataForSEO in your `SCRAPE_TARGETS`. Please note that Sonar API costs are 2-5x higher than scraping costs. The API costs for Sonar Pro or Sonar Reasoning Pro are even higher. Copilot has no API-based alternative.
