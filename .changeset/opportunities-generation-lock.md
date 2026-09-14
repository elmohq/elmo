---
"@workspace/web": patch
"@workspace/api-spec": patch
---

Fixed opportunities reports being generated many times over for the same brand: generation now happens one caller at a time, and `GET /brands/{brandId}/opportunities` and the `get_opportunities` MCP tool only ever read the stored report, answering `not-generated` when there isn't one yet.
