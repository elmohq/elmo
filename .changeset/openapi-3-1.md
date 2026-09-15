---
"@workspace/web": patch
"@workspace/api-spec": patch
---

The published OpenAPI document is now 3.1, which types nullable fields as a union (`"type": ["string", "null"]`). The API is unchanged; regenerate any client from the spec with a 3.1-capable generator.
