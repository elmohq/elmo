---
"@workspace/web": patch
---

Fix the visibility page failing to load for brands with many active prompts. The chart and visibility data now resolve from the active filters server-side instead of sending the full prompt-id list in the request, which previously overflowed the request URL (414 on Vercel / 431 in local dev) once a brand had a few hundred prompts.
