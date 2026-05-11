---
"@workspace/worker": patch
---

Attach a `boss.on("error")` handler so transient pg-boss connection blips no longer crash the worker.
