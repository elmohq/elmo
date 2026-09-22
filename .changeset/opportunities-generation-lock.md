---
"@workspace/web": patch
"@workspace/api-spec": patch
---

Opportunities reports are generated once per brand at a time, and the opportunities API and MCP tool now only read the stored report, returning `not-generated` when there isn't one yet.
