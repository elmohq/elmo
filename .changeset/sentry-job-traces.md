---
"@workspace/web": patch
"@workspace/worker": patch
---

Sentry now traces each worker job with its database calls, leaves health checks out of web traces, and raises an issue when the worker stops running.
