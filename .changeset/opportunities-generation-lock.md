---
"@workspace/web": patch
"@workspace/worker": patch
"@workspace/api-spec": patch
---

Opportunities reports are now generated in the background, one at a time per brand, and the opportunities API and MCP tool only read the stored report, returning `not-generated` when there isn't one yet.
