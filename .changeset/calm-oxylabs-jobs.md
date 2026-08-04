---
"@elmohq/cli": patch
---

Oxylabs requests now use the asynchronous Push-Pull API instead of the Realtime API, which Oxylabs is deprecating. If you have any `:oxylabs` targets in `SCRAPE_TARGETS`, upgrade before August 31, 2026 to avoid losing those runs.
