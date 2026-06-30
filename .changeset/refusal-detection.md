---
"@workspace/worker": patch
"@workspace/lib": patch
---

Model refusals (e.g. "I can't help with that") are now detected: they no longer count as brand mentions, and each refusal is logged and reported to telemetry so declines are visible.
