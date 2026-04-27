---
"@workspace/lib": patch
"@workspace/web": patch
"@workspace/worker": patch
---

Provider-agnostic brand onboarding. The wizard, admin tools, and report worker now use whichever LLM the deployment has configured (Anthropic / OpenAI / OpenRouter / Olostep / BrightData) instead of requiring Anthropic + DataForSEO + Jina. One round-trip returns the brand name, additional domains, aliases, products, competitors (with their own domains/aliases), and tagged starter prompts; direct-API providers use AI SDK `generateObject` for native structured outputs and only screen-scraper providers fall back to text + JSON extraction. The in-app wizard collapses to "analyze → review → save". New `POST /api/v1/onboarding/analyze` and `POST /api/v1/onboarding/brands` endpoints expose the same pipeline for white-label deployments — both support skipping competitor or prompt generation per request.
