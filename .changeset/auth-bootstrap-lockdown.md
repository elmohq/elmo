---
"@workspace/web": patch
"@workspace/lib": patch
"@workspace/config": patch
"@workspace/local": patch
"@workspace/whitelabel": patch
"@elmohq/cli": patch
---

Fix local-mode registration end-to-end and lock down the auth surface. The first `/auth/register` submission in local mode now atomically creates the default org + admin membership, so register → brand onboarding works in one pass; any subsequent signup is rejected. Demo mode rejects `/api/auth/sign-up/email` and all organization-mutation endpoints, leaving sign-in as the only way in (against a database you populated locally first). Drops the unused `DEFAULT_ORG_ID` and `DEFAULT_ORG_NAME` env vars.
