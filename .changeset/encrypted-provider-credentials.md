---
"@elmohq/cli": patch
---

Added an `ELMO_ENCRYPTION_KEY` to new and upgraded deployments, which lets Elmo store provider credentials encrypted in the database instead of only in `.env`.
