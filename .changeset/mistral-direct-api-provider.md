---
"@workspace/lib": patch
"@workspace/config": patch
"@workspace/web": patch
"@workspace/www": patch
"@workspace/docs": patch
"@elmohq/cli": patch
---

Add Mistral as a direct API provider. Configure with `MISTRAL_API_KEY` and target it via `mistral:mistral-api:<model>` (e.g. `mistral:mistral-api:mistral-medium-latest:online`). The `:online` suffix routes through Mistral's beta Conversations API with the `web_search` tool to capture citations; without it, requests use the standard chat completions endpoint. The `elmo init` wizard now offers Mistral alongside the other direct-API options, and the dashboard renders Mistral results with the official Mistral icon.
