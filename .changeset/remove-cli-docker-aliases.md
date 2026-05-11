---
"@elmohq/cli": patch
"@workspace/docs": patch
---

Remove `elmo start`, `elmo stop`, `elmo logs`, and `elmo build` aliases — use `elmo compose <args>` directly (e.g. `elmo compose up -d`, `elmo compose down`, `elmo compose logs -f`, `elmo compose build`).
