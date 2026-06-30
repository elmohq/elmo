---
"@workspace/web": patch
"@workspace/lib": patch
---

The maximum number of prompts per brand is now enforced server-side (in the dashboard save path and the public `/api/v1/prompts` endpoint), not just in the editor UI, and is configurable via the `MAX_PROMPTS_PER_BRAND` environment variable (defaults to 100).
