---
"@elmohq/cli": patch
---

Default the OpenAI and Anthropic model targets to `gpt-6-luna` and `claude-haiku-5-5` (`openai/gpt-6-luna` and `anthropic/claude-haiku-5.5` on OpenRouter); existing installs keep their configured models, so consider updating `SCRAPE_TARGETS` to switch from `gpt-5-mini` and `claude-sonnet-5`.
