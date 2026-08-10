---
"@workspace/worker": patch
"@workspace/lib": patch
---

Waiting out a busy scraping provider's queue no longer abandons requests it has already charged for, and a prompt whose runs all fail now backs off instead of being retried immediately.
