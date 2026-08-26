---
"@workspace/whitelabel": patch
"@workspace/lib": patch
---

Whitelabel sign-in no longer creates organizations from Auth0 `app_metadata`; it only grants membership in organizations that already exist, which are provisioned through the admin brands API.
