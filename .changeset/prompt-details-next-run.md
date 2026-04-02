---
"@workspace/web": patch
---

Show the next scheduled evaluation time on the Prompt Details page when a future `process-prompt` job exists in the queue. Adds a small helper script to schedule a demo job for local screenshots, a Playwright-based capture script for real-app before/after images, and fixes E2E seeding so importing `seed.ts` does not run the seeder.
