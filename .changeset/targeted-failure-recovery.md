---
"@workspace/worker": patch
"@workspace/lib": patch
---

Recovering from a provider failure now re-runs only the models that missed their sample instead of re-sampling every model.
