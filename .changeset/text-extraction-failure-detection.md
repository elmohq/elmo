---
"@workspace/worker": patch
"@workspace/lib": patch
---

Text-extraction failures are now detected instead of silently stored: when a provider response can't be parsed into text (e.g. after an upstream schema change), the worker logs an error and emits a telemetry event rather than recording an empty run.
