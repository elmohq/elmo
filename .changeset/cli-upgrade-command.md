---
"@elmohq/cli": patch
---

Add `elmo upgrade` to migrate a local deployment to a new CLI version. Pins docker images to the CLI's version, runs any registered migrations, and rolls the stack. Warns when the CLI itself is behind the published release.
