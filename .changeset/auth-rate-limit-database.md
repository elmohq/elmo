---
"@workspace/lib": patch
---

Auth rate limiting is now counted in the database, so the limits on sign-in and password reset hold across restarts and multiple app instances.
