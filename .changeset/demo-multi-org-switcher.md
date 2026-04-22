---
"@workspace/local": patch
"@workspace/web": patch
---

Demo deployments now surface the brand switcher when the signed-in user has memberships in multiple organizations. `supportsMultiOrg` is enabled for demo mode, and `/app` always renders the switcher for users with 2+ brands (falling back to the previous single-org redirect otherwise).
