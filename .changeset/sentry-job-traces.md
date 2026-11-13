---
"@workspace/web": patch
"@workspace/worker": patch
---

Sentry now traces each worker job together with its database calls, leaves health checks and platform pings out of web traces, and raises an issue when the worker stops running. Set `SENTRY_TRACES_SAMPLE_RATE` to change how much is traced.
