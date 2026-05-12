---
"@elmohq/cli": patch
---

Add `elmo edit`, drop `elmo telemetry` and the `~/.elmo/config.json` file. `elmo edit env|compose` opens the file in `$VISUAL` / `$EDITOR` (fallback `nano`) — toggle `DISABLE_TELEMETRY` there instead of via the removed `elmo telemetry` subcommand. Telemetry state and the deployment ID now live entirely in `.env`; `elmo init` stamps the CLI version and timestamp into the `.env` and `elmo.yaml` headers, and re-running it preserves the existing `DEPLOYMENT_ID`.
