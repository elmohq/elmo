---
"@workspace/lib": patch
"@elmohq/cli": patch
---

BREAKING CHANGE: DataForSEO now scrapes the real ChatGPT and Gemini interfaces instead of calling their model APIs, with no change needed to existing `SCRAPE_TARGETS`. This is more expensive (about $0.004 instead of $0.0006 to run). This could also impact visibility/citations as it switches to better reflect what users see in the actual chat website. If you would prefer to keep the old behavior, you will need to update your `SCRAPE_TARGETS` to pin the specific version of the model (`chatgpt:dataforseo:gpt-5.5:online` or `gemini:dataforseo:gemini-2.5-flash:online`) to keep using the LLM Responses API instead of the LLM Scraper API.
