---
"@workspace/web": patch
"@workspace/api-spec": patch
---

Every `/api/v1` list response now includes a `data` array. Read `data` instead of `brands`, `prompts`, `competitors`, or `reports` — the named keys still carry the same array today and will be removed in a future release.
