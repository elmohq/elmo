---
"@workspace/worker": patch
---

Re-judge history only for enabled prompts and brands, and only over the last 90 days by default (`REPROCESS_DAYS`); a prompt or brand enabled again has that window brought up to date then.
