---
"@workspace/lib": patch
"@workspace/web": patch
---

Fix 403 "Invalid origin" on demo/cloud sign-in when `APP_URL` includes a trailing slash or path. All trusted origins (including the configured app URL and any deployment-supplied values) are now normalized to `new URL(...).origin` before Better Auth compares them against the browser's `Origin` header. A new optional `TRUSTED_ORIGINS` env var (comma-separated) lets deployments with multiple public hostnames — e.g. a Railway preview domain alongside a custom domain — accept all of them without code changes.
