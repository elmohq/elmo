---
"@workspace/worker": patch
"@workspace/lib": patch
---

Recovering from a provider outage now re-runs only the stale models instead of re-sampling every model, and per-run spend is recorded in a new usage_events table.
