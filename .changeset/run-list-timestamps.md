---
"@workspace/web": patch
---

Fixed a bug in `/api/v1/prompts/{promptId}/runs` and the `list_runs` MCP tool, where `createdAt` values were Postgres-formatted strings instead of valid RFC 3339 timestamps.
