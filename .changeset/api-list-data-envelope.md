---
"@workspace/web": patch
"@workspace/api-spec": patch
---

Every `/api/v1` list response now includes a `data` array. The `brands`, `prompts`, `competitors`, and `reports` keys still carry the same array and will be removed in a future release.
