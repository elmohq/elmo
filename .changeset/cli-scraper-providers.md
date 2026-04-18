---
"@elmohq/cli": minor
"@workspace/lib": patch
"@workspace/docs": patch
---

CLI `elmo init` now walks through each provider one at a time. BrightData and Olostep lead with affiliate sign-up links and offer the recommended ChatGPT + Google AI Mode starter targets (with an opt-out to pick from the full supported list). OpenAI, Anthropic, and OpenRouter prompt for model slug + web-search toggle. DataForSEO is clearly labeled optional — it unlocks Google AI Mode scraping and the onboarding wizard's keyword/persona suggestions, which now skip cleanly when DataForSEO isn't configured. CI mode (`ELMO_CI=1`) no longer reads provider keys from env vars; it produces a skeleton `.env` and callers append what they need.
