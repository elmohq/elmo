---
"@workspace/lib": patch
"@elmohq/cli": patch
---

Perplexity and Copilot are no longer scraped through any provider now that both require a sign-in; existing scrape targets for them are skipped with a warning, and Perplexity can still be tracked through its Sonar model.
