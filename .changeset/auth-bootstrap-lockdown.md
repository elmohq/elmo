---
"@workspace/web": patch
"@workspace/lib": patch
"@workspace/config": patch
"@workspace/local": patch
"@workspace/whitelabel": patch
"@elmohq/cli": patch
---

Fix local-mode registration end-to-end and lock down the auth surface. The first `/auth/register` submission in local mode now atomically creates the default org + admin membership, so register → brand onboarding works in one pass; any subsequent signup is rejected. Demo mode narrows writable `/api/auth/**` endpoints to a whitelist of just sign-in and sign-out — signup, change-password, change-email, update-user, delete-user, forget-password, and every organization-mutation endpoint are all rejected. Drops the unused `DEFAULT_ORG_ID` and `DEFAULT_ORG_NAME` env vars.
