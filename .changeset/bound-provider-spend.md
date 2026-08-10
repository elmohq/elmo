---
"@workspace/worker": patch
"@workspace/lib": patch
"@workspace/config": patch
---

Cap how much paid provider work Elmo can have in flight, and back off instead of retrying when a provider starts failing, so an outage can't run up a bill far larger than the configured cadence implies.
