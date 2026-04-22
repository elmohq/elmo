# PR 5: Web Admin UI + Dynamic LLM Settings

This is the only remaining piece of `PROVIDER_MIGRATION_PLAN.md` after PR 4
(branch `providers/4-worker-integration`) lands. After this PR, the migration
plan is fully complete and the file itself can be deleted.

## Goal

Replace hardcoded `{chatgpt, claude, google-ai-mode}` UI assumptions with a
data-driven view that reflects whatever is in `SCRAPE_TARGETS`. Give admins a
way to see active models, test per-model connectivity, and let brand admins
toggle `brand.enabledModels`.

## Branch

`providers/5-admin-ui` (off `main`, after PR 4 has merged).

## Files to create

| File | What it does |
|------|--------------|
| `apps/web/src/routes/_authed/admin/providers.tsx` | New admin page. Shows active `SCRAPE_TARGETS` entries (model, provider, version, webSearch), all registered providers and their `isConfigured()` status, and per-model "Test" buttons that call `testProviderFn` and render success/latency/error/sample output. Follow the layout conventions of `apps/web/src/routes/_authed/admin/workflows.tsx`. |

## Files to modify

| File | What changes |
|------|--------------|
| `apps/web/src/server/admin.ts` | Add `getProviderStatusFn` — returns `{ activeTargets: ModelConfig[], providers: { id, name, configured }[] }` by calling `parseScrapeTargets(process.env.SCRAPE_TARGETS)` + `getAllProviders()`. Add `testProviderFn({ target: string })` — parses the single target, calls `getProvider(cfg.provider).run(cfg.model, "What is 2+2?", { webSearch: cfg.webSearch, version: cfg.version })` wrapped in try/catch + `Date.now()` timing; returns `{ success, latencyMs, error?, sampleOutput? }`. Reuse the existing `TestResult` shape in `packages/lib/src/providers/types.ts`. |
| `apps/web/src/routes/_authed/app/$brand/settings/llms.tsx` | Today hardcodes three cards (lines 28, 42, 56) for chatgpt / claude / google-ai-mode. Refactor: fetch active models via `getProviderStatusFn`, render one card per entry using `getModelMeta(model)` from `@workspace/lib/providers` for labels/icons. Replace the implicit "enable/disable" state with `brand.enabledModels` (string[] nullable). Null or empty = all enabled; array = opt-in list. Persist via a new `updateBrandEnabledModelsFn` in `apps/web/src/server/brands.ts` (or wherever brand mutations live — check siblings). |
| `apps/web/src/components/app-sidebar.tsx` | Add a "Providers" nav item under the admin section, linking to `/admin/providers`. Use `IconPlugConnected` from `@tabler/icons-react` to match the existing icon style. |
| `apps/web/src/routeTree.gen.ts` | Regenerated — run whatever the routes-gen command is (`pnpm --filter web build` or a dedicated script; check `apps/web/package.json`). Do not hand-edit. |

## Files to verify (may or may not need changes)

- `apps/web/src/server/admin.ts` `getWorkflowDataFn` (around line 580) — confirm it already iterates `parseScrapeTargets` for the dynamic model list (it should after PR 3). If anything still hardcodes `["chatgpt","claude","google-ai-mode"]`, fix it here.
- Any component that reads `brand.enabledModels` — there likely are none today since the field is unused. Grep before writing to be sure.

## Acceptance criteria

- Admin `/admin/providers` route renders and shows the current `SCRAPE_TARGETS` configuration.
- Clicking "Test" on any model invokes a real provider call and shows pass/fail + latency + a sample.
- Brand admins at `/app/$brand/settings/llms` see one card per active model (dynamic, not hardcoded).
- Toggling a model on the settings page persists via `brand.enabledModels` and is honored by `selectTargetsForBrand` in the worker (PR 4 already wired this).
- `pnpm turbo build` succeeds. No residual `["chatgpt","claude","google-ai-mode"]` literals anywhere in `apps/web/src`.

## Out of scope

- Per-target run counts (was plan step #6, deferred indefinitely).
- Any backfill of `brand.enabledModels` for existing rows — null means "all," so existing brands keep current behavior.
- Editing `SCRAPE_TARGETS` from the UI (it's an env var; changing it still requires a redeploy).

## After this PR merges

Delete `PROVIDER_MIGRATION_PLAN.md` and `PROVIDER_MIGRATION_PR5.md` (this file). The migration is done.
