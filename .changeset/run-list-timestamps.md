---
"@workspace/web": patch
---

Fixed run lists in the API and the `list_runs` MCP tool, which now give each run's `createdAt` as an RFC 3339 timestamp, matching the run detail.
