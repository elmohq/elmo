---
"@elmohq/cli": patch
---

Clearer `elmo edit` help: the usage line now reads `elmo edit <env|compose>` so the two targets are obvious from `elmo -h`, and the description says what the command lets you change ("change API keys, scrape targets, or the Docker Compose YAML") instead of describing how it opens the file.
