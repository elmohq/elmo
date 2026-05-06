---
"@workspace/web": patch
"@workspace/api-spec": patch
---

Admin `/api/v1/brands` endpoints (POST, GET, PATCH) now accept and return a single `domains` list instead of `website` + `additionalDomains`. This future-proofs against a future db model change.
