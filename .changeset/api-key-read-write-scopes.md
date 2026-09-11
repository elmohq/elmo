---
"@workspace/web": patch
"@workspace/api-spec": patch
"@workspace/lib": patch
---

API keys are now issued read-only or read-write instead of ten per-resource scopes. Existing keys keep working and are migrated in place — a key that could write anything becomes read-write, everything else becomes read-only.
