---
"@elmohq/cli": patch
---

The worker now gets time to finish in-flight jobs when a deployment stops or upgrades, instead of being killed mid-evaluation.
