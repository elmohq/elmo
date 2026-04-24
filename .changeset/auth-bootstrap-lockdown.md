---
"@workspace/web": patch
"@workspace/lib": patch
"@workspace/config": patch
"@workspace/local": patch
"@workspace/whitelabel": patch
"@elmohq/cli": patch
---

Tighten auth surface across deployment modes and unify user/org/brand bootstrap. Demo mode now rejects signup and org-mutation API calls (the seeded user is the only path in). Local mode creates the organization and membership automatically on the first — and only — signup, so `/auth/register` → onboarding → brand works end to end; the register form gained a workspace name field. Whitelabel gains belt-and-suspenders `disableSignUp`. Removes the unused `DEFAULT_ORG_ID` / `DEFAULT_ORG_NAME` env vars.
