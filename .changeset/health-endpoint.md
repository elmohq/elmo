---
"@workspace/web": patch
---

Added a `/api/health` endpoint that returns 503 when the database is unreachable, for uptime monitors.
