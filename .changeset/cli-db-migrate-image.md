---
"@elmohq/cli": patch
---

Fix `elmo init` failing with `lstat <cwd>/docker: no such file or directory` when starting the stack. The generated compose file now references the published `elmohq/elmo-db-migrate` image (built and pushed multi-arch by the release workflow) instead of trying to build the migrate target from a non-existent source tree.
