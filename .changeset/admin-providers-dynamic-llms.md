---
"@workspace/web": patch
"@workspace/lib": patch
"@workspace/worker": patch
---

Admin `/admin/providers` page shows the active `SCRAPE_TARGETS`, per-provider credential status, and a per-target smoke-test button. Brand `settings/llms` now renders one card per active model and writes to `brand.enabledModels` (matching the `null` / `[]` / opt-in semantics enforced by the worker). Whitelabel deployments get a warning badge for any SCRAPE_TARGETS model missing from the report-run map.
