---
"@elmohq/cli": patch
"@workspace/lib": patch
"@workspace/worker": patch
"@workspace/docs": patch
---

Add telemetry opt-out prompt during `elmo init` and new `elmo telemetry status|enable|disable` subcommand. Worker telemetry now uses a random `deployment_id` UUID stored in `system_settings` instead of a hash of `DATABASE_URL`. See [Telemetry](https://elmohq.com/docs/telemetry) for what's collected.
