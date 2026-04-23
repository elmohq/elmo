---
"@workspace/web": patch
---

Make default brand cadence configurable via `DEFAULT_DELAY_HOURS` env var. `brand.delayOverrideHours` still takes precedence. The default changed from the hard-coded 72h to 24h.
