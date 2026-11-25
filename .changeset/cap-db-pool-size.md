---
"@workspace/web": patch
"@workspace/worker": patch
---

Set `DATABASE_POOL_MAX` to cap how many database connections the web app and worker each keep open; serverless hosts default to 5.
