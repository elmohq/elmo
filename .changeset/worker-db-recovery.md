---
"@workspace/worker": patch
"@workspace/lib": patch
"@elmohq/cli": patch
---

The worker now recovers on its own after a database connection disruption instead of stalling until restarted.
