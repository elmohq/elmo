---
"@workspace/web": patch
"@workspace/api-spec": patch
---

The published OpenAPI document is now OpenAPI 3.1, so nullable fields are typed as a union (`"type": ["string", "null"]`) rather than with `nullable: true`. The API itself is unchanged; regenerate any client built from the spec with a 3.1-capable generator.
