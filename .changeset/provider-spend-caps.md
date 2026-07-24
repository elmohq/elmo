---
"@workspace/lib": patch
---

Cap per-request spend on the direct API providers: output tokens on Anthropic, OpenAI, OpenRouter, and Mistral, plus web-search budget (Anthropic `max_uses`, OpenAI `maxToolCalls`), so no single tracked run can spend unboundedly.
