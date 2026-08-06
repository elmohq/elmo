---
"@workspace/lib": patch
"@elmohq/cli": patch
---

DataForSEO now scrapes the real ChatGPT and Gemini interfaces instead of calling their model APIs, with no change needed to existing `SCRAPE_TARGETS`. Pin a model (`chatgpt:dataforseo:gpt-5-mini:online`) to keep using the LLM Responses API.
