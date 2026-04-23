---
"@workspace/web": patch
---

Remove `DEFAULT_ORG_ID`/`DEFAULT_ORG_NAME` env vars; `/app` now redirects to the user's first org, and demo seed hardcodes `demo-org`.
