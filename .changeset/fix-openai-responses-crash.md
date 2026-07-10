---
"@workspace/lib": patch
---

Fixed OpenAI tracking that broke in v0.2.15, where every OpenAI Responses API call crashed after being billed, so runs were charged but never recorded.
