---
"@workspace/web": patch
---

Fix a crash in the onboarding wizard and competitor/prompt editors on deployments served over plain HTTP, where `crypto.randomUUID` is unavailable.
