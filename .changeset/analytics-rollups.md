---
"@workspace/web": patch
"@workspace/worker": patch
"@workspace/lib": patch
"@workspace/api-spec": patch
---

Analytics pages now read from precomputed rollups, so long lookbacks load in a fraction of the time. Editing a brand's name, aliases, domains, or competitors re-derives its historical mentions instead of leaving old data frozen. "All time" covers the brand's whole history on every page, and `/api/v1` analytics windows are aligned down to the half hour.
