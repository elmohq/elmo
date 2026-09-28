---
"@workspace/web": patch
"@workspace/worker": patch
"@workspace/lib": patch
---

Brands can hold up to 10,000 prompts: the prompts settings page shows fifty at a time with search, tag and status filters, saves only the rows you changed, and imports pasted `prompt;tag1;tag2` lines through a Review step and an all-or-nothing Commit that adds prompts as disabled unless you choose enabled. Disabled prompts queue no work, mass-enabled prompts start spread over the cadence, and `RUNS_PER_PROMPT` now defaults to 1.
