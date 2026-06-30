---
"@elmohq/cli": patch
---

Add `elmo upgrade` to move a local deployment to the version supported by the installed CLI: runs any registered migrations, re-pins the Docker image tags, and restarts the stack (only if it was running before). Warns when the CLI itself is behind the latest published release.
