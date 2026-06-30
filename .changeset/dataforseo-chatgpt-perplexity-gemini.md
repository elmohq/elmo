---
"@elmohq/cli": patch
---

Add ChatGPT, Perplexity, and Gemini support to the DataForSEO provider. `elmo init` now offers them when you enable DataForSEO, and `SCRAPE_TARGETS` accepts `chatgpt:dataforseo:online`, `perplexity:dataforseo:online`, and `gemini:dataforseo:online` (override the underlying model via the version slug, e.g. `chatgpt:dataforseo:gpt-5-mini:online`). Configure via `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`.
