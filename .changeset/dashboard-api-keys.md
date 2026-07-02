---
"@workspace/web": minor
"@workspace/lib": minor
"@workspace/api-spec": minor
---

API keys for `/api/v1` are now created per-user in the dashboard (Settings → API Keys) instead of the `ADMIN_API_KEYS` environment variable, which has been removed. A key inherits its owner's access: admins get instance-wide access, everyone else is scoped to their own brands. To upgrade, run the database migrations, sign in, create an API key under Settings → API Keys, and update any integrations or scripts with the new key.
