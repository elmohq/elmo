---
"@workspace/worker": patch
"@workspace/web": patch
---

Re-judge history only for enabled prompts and brands, and only over the last 90 days by default (`REPROCESS_DAYS`); a prompt or brand enabled again is brought up to date then.
