---
"@elmohq/cli": patch
"@workspace/docs": patch
---

CLI: ask about anonymous telemetry during `elmo init` and add `elmo telemetry status|enable|disable`. Document exactly what is collected (install UUID, version, OS, command, IP via PostHog) and what is not (secrets, brand/prompt data, emails outside the explicit newsletter signup) in the new [Telemetry](https://docs.elmohq.com/docs/telemetry) doc.
