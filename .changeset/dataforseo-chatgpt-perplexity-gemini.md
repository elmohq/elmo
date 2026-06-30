---
"@workspace/lib": patch
---

Extend the DataForSEO provider to track ChatGPT, Perplexity, and Gemini citations via DataForSEO's AI Optimization "LLM Responses" API. Previously DataForSEO only supported `google-ai-mode`, so DataForSEO-only users had to add BrightData for the other engines. You can now set targets like `chatgpt:dataforseo:online`, `perplexity:dataforseo:online`, and `gemini:dataforseo:online` (override the underlying model via the version slug, e.g. `chatgpt:dataforseo:gpt-4.1:online`). `google-ai-mode:dataforseo:online` is unchanged.
