---
"@elmohq/cli": patch
---

New deployments now run Postgres 18. Existing ones stay on their current major, and `elmo upgrade` points to the dump/restore steps for moving.
