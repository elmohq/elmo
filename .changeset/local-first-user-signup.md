---
"@workspace/web": patch
---

Show the signup screen instead of login on a fresh local deployment. When no users exist yet, `/` and `/auth/login` now redirect to `/auth/register` so the first visitor can create an account immediately. Drops the unreachable "Already have an account? Sign in" link from the register page (which would have bounced back via the new redirect).
