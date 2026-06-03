---
"@elmohq/cli": patch
---

Pin generated `docker-compose.yml` image tags to the CLI's version (e.g. `elmohq/elmo-web:0.2.10`) instead of `latest`, so stacks stay on the version they were initialized with until the user upgrades.
