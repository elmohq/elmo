---
"@workspace/web": minor
"@workspace/lib": minor
"@workspace/api-spec": minor
---

You can now create personal API keys for `/api/v1` from **Settings → API Keys**, scoped to the brands of the organizations you belong to (optionally restricted to specific brands when you create the key). The existing `ADMIN_API_KEYS` environment variable is unchanged and continues to provide full admin access. This adds a new database table, so a database migration is required on upgrade.
