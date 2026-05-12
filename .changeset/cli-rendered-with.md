---
"@elmohq/cli": patch
---

`elmo init` now stamps the CLI version and timestamp into the `.env` and `elmo.yaml` headers, and re-running it on an existing config asks for confirmation and preserves the existing `DEPLOYMENT_ID` so telemetry identity stays stable. `~/.elmo/config.json` is no longer written — telemetry state and the deployment ID now live entirely in `.env`. The `elmo telemetry` subcommand is removed; use `elmo edit env` (new — opens `.env`/`elmo.yaml` in `$VISUAL` / `$EDITOR`, falling back to `nano`) to toggle `DISABLE_TELEMETRY` and restart with `elmo compose up -d`.
