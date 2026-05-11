---
"@workspace/web": patch
---

Show the signup screen instead of login on a fresh local deployment. When no users exist yet, `/` and `/auth/login` now redirect to `/auth/register` so the first visitor can create an account immediately.
