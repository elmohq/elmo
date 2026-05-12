---
"@elmohq/cli": patch
---

`elmo init` now stamps the CLI version and timestamp into the `.env` and `elmo.yaml` headers. `~/.elmo/config.json` is no longer written — telemetry state and the deployment ID now live entirely in `.env`.
