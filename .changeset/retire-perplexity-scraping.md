---
"@workspace/lib": patch
"@elmohq/cli": patch
---

Perplexity is no longer scraped by any provider since it now requires a sign-in, and it is no longer available as a scraped engine on Elmo Cloud. For self-hosted users that want to track Perplexity, you will need to switch from scraping providers to API providers by using OpenRouter or DataForSEO in your `SCRAPE_TARGETS`. Please note that Sonar API costs are 2-5x higher than scraping costs. The API costs for Sonar Pro or Sonar Reasoning Pro are even higher.
