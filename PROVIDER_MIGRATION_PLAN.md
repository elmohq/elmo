# Multi-Provider Scraping Migration Plan

This plan breaks the large feature branch `jrhizor/integration-of-scraping-providers-6a2f` into
6 sequentially-mergeable PRs. Each PR is self-contained and leaves the system in a working state.

**Reference branch:** `jrhizor/integration-of-scraping-providers-6a2f`
Use it to see the target implementation for every file. `git diff main...jrhizor/integration-of-scraping-providers-6a2f -- <path>` shows exactly what each file should look like.

**Guiding principle:** additive code first, then the schema switchover, then the behavioral change, then new features.

---

## PR 1: Provider Abstraction Layer

**Purpose:** Introduce the provider types, `SCRAPE_TARGETS` config parser, model metadata, and provider registry. All new code — nothing references it yet, no behavioral changes.

**Branch:** `providers/1-abstraction-layer`

### Files to create (new)

| File | What it does |
|------|-------------|
| `packages/lib/src/providers/types.ts` | `Provider`, `ScrapeResult`, `ProviderOptions`, `TestResult`, `ModelConfig` interfaces |
| `packages/lib/src/providers/config.ts` | `parseScrapeTargets()` and `validateScrapeTargets()` — parse the `SCRAPE_TARGETS` env var format `model:provider[:version][:online]` |
| `packages/lib/src/providers/config.test.ts` | Unit tests: basic parsing, multiple entries, OpenRouter colon-heavy version slugs, `online` flag, whitespace, error cases, validation |
| `packages/lib/src/providers/models.ts` | `KNOWN_MODELS` map (chatgpt, claude, google-ai-mode, google-ai-overview, gemini, copilot, perplexity, grok), `getModelMeta()`, legacy migration helpers (`MODEL_TO_LEGACY_MODEL_GROUP`, `LEGACY_MODEL_GROUP_TO_MODEL`) |
| `packages/lib/src/providers/models.test.ts` | Unit tests for model metadata and legacy mapping helpers |
| `packages/lib/src/providers/index.ts` | Provider registry: `getProvider()`, `resolveProviderId()` ("direct" -> "direct-openai" or "direct-anthropic" based on model), `getAvailableProviders()`, `getAllProviders()`. Re-exports all types and config functions. Initially import stubs or skip provider implementations (they come in PR 2). |

### Files to modify

| File | What changes |
|------|-------------|
| `packages/config/src/env.ts` | Add `PROVIDER_KEY_MAP`, `parseResolvedProviders()`, `buildProviderKeyRequirements()`. Add `SCRAPE_TARGETS` to `COMMON_REQUIREMENTS`. Replace the 4 hardcoded provider key requirements (ANTHROPIC_API_KEY, OPENAI_API_KEY, DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD) with dynamic requirements derived from SCRAPE_TARGETS via `buildProviderKeyRequirements()`. |
| `packages/config/src/types.ts` | If any type changes are needed for the new env requirement structure |

### Notes

- `packages/lib/src/providers/index.ts` needs to export everything but the actual provider implementations (olostep, brightdata, etc.) don't exist yet. The registry map can either be empty or import placeholder stubs that throw "not implemented". The simplest approach: create index.ts with the full import list but wrap each import in a try/catch or simply add all 6 provider imports — and include the implementation files as empty stubs that will be filled in PR 2. Either approach works since nothing calls these providers yet.
- **Preferred approach:** Create index.ts with all 6 provider imports, and create minimal stub files for each provider (just exporting an object with `id`, `name`, `isConfigured: () => false`, and `run: () => { throw new Error("not implemented") }`). This way index.ts has no conditional logic and PR 2 just fills in the real implementations.
- The env.ts changes should be backward compatible: if `SCRAPE_TARGETS` is not set, `buildProviderKeyRequirements()` returns an empty array. However, `SCRAPE_TARGETS` is added as a required env var in COMMON_REQUIREMENTS, so deployments will need it going forward.

### Acceptance criteria

- `parseScrapeTargets("chatgpt:olostep:online,claude:direct:claude-sonnet-4")` returns the correct `ModelConfig[]`
- All unit tests pass
- Existing app still builds and runs (nothing references the new code yet)
- `pnpm build` succeeds across the monorepo

---

## PR 2: Provider Implementations + Text Extraction

**Purpose:** Implement all 6 providers behind the `Provider` interface and add provider-specific text/citation extraction functions. Still purely additive — the existing system continues using the old code paths.

**Branch:** `providers/2-implementations`

### Files to create (new)

| File | What it does |
|------|-------------|
| `packages/lib/src/providers/olostep.ts` | Olostep provider: uses `olostep` SDK, supports chatgpt/google-ai-mode/google-ai-overview/gemini/copilot/perplexity/grok via parser IDs. Extracts text from `markdown_content`/`answer_markdown`/`text_content`. Extracts citations from `sources`/`links_on_page`/`inline_references`. Extracts web queries from `network_search_calls`/`search_model_queries`. |
| `packages/lib/src/providers/brightdata.ts` | BrightData provider: uses `@brightdata/sdk`, version slug = dataset ID. Triggers dataset collection, polls via snapshot API with exponential backoff (2s-10s, 60 max attempts). Normalizes answer from multiple possible field names. |
| `packages/lib/src/providers/direct-openai.ts` | Direct OpenAI: uses `@ai-sdk/openai` + `ai` SDK's `generateText`. Conditionally enables `webSearchPreview` tool based on `options.webSearch`. Default version: `gpt-5-mini`. |
| `packages/lib/src/providers/direct-anthropic.ts` | Direct Anthropic: uses `@anthropic-ai/sdk`. Conditionally enables `web_search_20250305` tool. Default version: `claude-sonnet-4-20250514`. |
| `packages/lib/src/providers/openrouter.ts` | OpenRouter: uses `@openrouter/sdk`. Version slug required (e.g., `openai/gpt-5-mini`). Appends `:online` to version slug when `webSearch` is true. |
| `packages/lib/src/providers/dataforseo.ts` | DataForSEO: uses `dataforseo-client`. Google AI Mode only. Uses existing `dfsSerpApi` helper. |

### Files to modify

| File | What changes |
|------|-------------|
| `packages/lib/src/providers/index.ts` | Replace stub imports with real provider implementations. The `providerMap` now points to working providers. |
| `packages/lib/src/text-extraction.ts` | Add provider-specific extraction functions: `extractTextFromDirectOpenAI`, `extractTextFromDirectAnthropic`, `extractTextFromDataforseo`, `extractTextFromOpenRouter`, `extractTextFromOlostep`, `extractTextFromBrightdata`. Same for citations: `extractCitationsFromDirectOpenAI`, `extractCitationsFromDirectAnthropic`, etc. Update the `extractTextContent(rawOutput, providerOrEngine)` dispatcher to handle both new provider names and old engine names (backward compat). Same for `extractCitations()`. |
| `packages/lib/src/text-extraction.test.ts` | Update tests for new dispatcher paths |
| `packages/lib/package.json` | Add dependencies: `@anthropic-ai/sdk`, `@ai-sdk/openai` (may already exist), `olostep`, `@brightdata/sdk`, `@openrouter/sdk` |
| `package.json` (root) | Add workspace dependencies if needed: `olostep`, `@brightdata/sdk`, `@openrouter/sdk` |
| `pnpm-lock.yaml` | Updated by install |
| `turbo.json` | Add any new env vars to the `globalPassThroughEnv` list (OLOSTEP_API_KEY, BRIGHTDATA_API_TOKEN, OPENROUTER_API_KEY) |

### Notes

- Each provider's `run()` method returns a normalized `ScrapeResult` with `textContent`, `rawOutput`, `webQueries`, `citations`, and optional `modelVersion`.
- The text extraction refactor adds **new** functions alongside the existing ones. The existing `extractTextFromOpenAI`, `extractTextFromAnthropic`, `extractTextFromGoogle` functions should be renamed to `extractTextFromDirectOpenAI`, `extractTextFromDirectAnthropic`, `extractTextFromDataforseo` respectively, and new functions added for `extractTextFromOlostep`, `extractTextFromBrightdata`, `extractTextFromOpenRouter`.
- The `extractTextContent(rawOutput, providerOrEngine)` dispatcher should handle BOTH old values (`"openai"`, `"anthropic"`, `"google"`) and new values (`"direct-openai"`, `"direct-anthropic"`, `"dataforseo"`, `"olostep"`, etc.) for backward compatibility with stored data. Old code still passes the old engine names.
- The existing `ai-providers.ts` remains untouched — it still works for the current worker.

### Acceptance criteria

- Each provider's `isConfigured()` returns true/false based on env vars
- Text extraction works for both old engine names and new provider names
- `pnpm build` succeeds
- Existing worker still works using old `ai-providers.ts` (nothing calls the new providers yet)

---

## PR 3: Database Migration + Schema Switchover

**Purpose:** Migrate the database schema (rename `modelGroup`→`model`, `model`→`version`, add `provider` column) and update ALL code that references these columns. This is a mechanical rename across the codebase. The worker continues using the old dispatch logic (calls `runWithOpenAI`/etc. directly) but writes to the new column names.

**Branch:** `providers/3-schema-switchover`

### Files to create (new)

| File | What it does |
|------|-------------|
| `packages/lib/src/db/migrations/0007_provider_engines.sql` | The migration SQL — see reference branch for exact content. Renames columns, converts enum to text, migrates values (openai→chatgpt, anthropic→claude, google→google-ai-mode), backfills provider column, adds `enabled_models` to brands, creates indexes. |
| `packages/lib/src/db/migrations/meta/0007_snapshot.json` | Drizzle snapshot for migration 0007. Copy from reference branch. |

### Files to modify — Database

| File | What changes |
|------|-------------|
| `packages/lib/src/db/migrations/meta/_journal.json` | Add entry for migration 0007 |
| `packages/lib/src/db/schema.ts` | Remove `modelGroupsEnum`. In `promptRuns`: rename `modelGroup` to `model` (text), rename `model` to `version` (text), add `provider` (text, nullable). In `citations`: rename `modelGroup` to `model` (text). In `brands`: add `enabledModels` (text array, nullable). Update all index definitions to use new column names. Remove `progress` from reports if the branch does. |

### Files to modify — Web app (query layer)

These are all mechanical `modelGroup`→`model` renames in function parameters and SQL queries.

| File | What changes |
|------|-------------|
| `apps/web/src/lib/postgres-read.ts` | Rename `modelGroupFilter()`→`modelFilter()`. Change all raw SQL from `"modelGroup"` to `model`. Rename function parameters from `modelGroup` to `model` throughout. Update `WebQueryMapping` and `WebQueryCount` interfaces. |
| `apps/web/src/server/prompts.ts` | Rename `modelGroup` parameter to `model` in `getPromptsSummaryFn`, `getPromptStatsFn`, `getPromptChartDataFn`, `getPromptWebQueryFn`. Update the web query aggregation to iterate dynamic model keys instead of hardcoded `["openai", "anthropic", "google"]`. Change `promptRuns.modelGroup` → `promptRuns.model` in select queries. |
| `apps/web/src/server/citations.ts` | Rename `modelGroup` parameter to `model` in `getCitationsFn`. Update pass-through calls. |
| `apps/web/src/server/visibility.ts` | Rename `modelGroup` parameter to `model` in `getBatchChartDataFn`, `getFilteredVisibilityFn`. Update pass-through calls. |
| `apps/web/src/server/admin.ts` | In `getWorkflowDataFn`: change `promptRuns.modelGroup` → `promptRuns.model` in queries. Change `lastRunsByModelGroup` → `lastRunsByModel`. Iterate dynamic model list from `parseScrapeTargets()` instead of hardcoded `["openai", "anthropic", "google"]`. |

### Files to modify — Web app (hooks / components)

| File | What changes |
|------|-------------|
| `apps/web/src/hooks/use-batch-chart-data.tsx` | Rename `modelGroup` to `model` in `BatchChartDataFilters` interface and usage |
| `apps/web/src/hooks/use-citations.tsx` | Rename `modelGroup` to `model` in `CitationFilters` interface and usage |
| `apps/web/src/hooks/use-filtered-visibility.tsx` | Rename `modelGroup` to `model` in `FilteredVisibilityFilters` interface and usage |
| `apps/web/src/hooks/use-prompt-chart-data.tsx` | Rename `modelGroup` to `model` in `PromptChartDataFilters` interface and usage. Change type from `"openai" \| "anthropic" \| "google"` to `string`. |
| `apps/web/src/hooks/use-prompts-summary.tsx` | Rename `modelGroup` to `model` in `PromptsSummaryFilters` interface and usage |
| `apps/web/src/components/prompt-chart-print.tsx` | Update `PromptRunData` interface: remove `modelGroup`, keep `model` (text), add `provider` (string \| null), add `version` (string) |
| `apps/web/src/components/prompts-display.tsx` | Rename `modelGroupParam` → `modelParam`, pass `model` instead of `modelGroup` to hooks. Add `enabledModels: null` to fallback brand object. |
| `apps/web/src/components/chart-actions-footer.tsx` | Rename `modelGroup` parameter to `model` in `fetchWebQuery` |
| `apps/web/src/routes/_authed/admin/workflows.tsx` | Rename `LastRunByModelGroup` → `LastRunByModel`, `ModelGroupStatus` → `ModelStatus`, `lastRunsByModelGroup` → `lastRunsByModel`. Replace hardcoded column headers with dynamic `Object.keys()`. Replace hardcoded overdue checks with `Object.values().some()`. |
| `apps/web/src/routes/_authed/app/$brand/prompts/$promptId.tsx` | In responses tab: change "Model Group" → "Model", "Model" → "Version". Change `run.modelGroup` → `run.model`, `run.model` → `run.version`. Update `extractTextContent` call to pass `run.provider ?? run.model` instead of `run.modelGroup`. |
| `apps/web/src/routes/_authed/app/$brand/citations.tsx` | Rename `modelGroup` → `model` if referencing it in filter state |
| `apps/web/src/routes/_authed/reports/render/$reportId.tsx` | Update `PromptRunResult` interface: remove `modelGroup`, add `model`+`version`. Update `fullPromptRunData` construction. |

### Files to modify — Worker (naming only, keep old dispatch)

| File | What changes |
|------|-------------|
| `apps/worker/src/jobs/process-prompt.ts` | **Naming changes only.** Update `savePromptRun()` to accept `model`, `provider`, `version` instead of `modelGroup`, `model`. In `runModelIteration`, write `model: 'chatgpt'` (instead of `modelGroup: 'openai'`), `version: AI_MODELS.OPENAI.MODEL`, `provider: 'direct'`, etc. Keep calling `runWithOpenAI`, `runWithAnthropic`, `runWithDataForSEO` from `ai-providers.ts`. Keep iterating the hardcoded three model groups. In `saveCitations`, pass `model` instead of `modelGroup`. |
| `apps/worker/src/jobs/schedule-maintenance.ts` | Change `promptRuns.modelGroup` → `promptRuns.model` in queries. Change hardcoded `["openai", "anthropic", "google"]` to use `parseScrapeTargets()` to get model list (import from providers). |
| `apps/worker/src/report-worker.ts` | Update the `PromptRunResult` interface: `modelGroup` → `model`, add `provider`, `model` → `version`. Update the code that constructs run results. Keep the inline `runWithOpenAI`/`runWithAnthropic`/`runWithDataForSEO` functions for now — they'll be replaced in PR 4. |

### Files to modify — E2E / Other

| File | What changes |
|------|-------------|
| `e2e/seed.ts` | Update seed data to use `model`/`version`/`provider` column names instead of `modelGroup`/`model`. Update values: `'openai'`→`'chatgpt'`, `'anthropic'`→`'claude'`, `'google'`→`'google-ai-mode'`. |

### Notes

- This is the largest PR by file count, but each individual change is a mechanical rename. A reviewer can verify it systematically.
- The migration is **destructive** (renames columns, drops enum type). Test against a database copy first.
- The worker remains functionally identical — same API calls, same dispatch logic. Only the values written to DB change to match the new schema.
- `ai-providers.ts` continues to function and is still imported by the worker.

### Acceptance criteria

- Migration runs successfully against a test database
- `pnpm build` succeeds
- Existing data queries return correct results with new column names
- Worker processes prompts and writes correct model/version/provider values
- Admin workflows page shows correct model status (dynamic, not hardcoded)
- No TypeScript errors anywhere

---

## PR 4: Worker Provider Integration + Integration Tests

**Purpose:** Switch the worker from hardcoded `runWithOpenAI`/`runWithAnthropic`/`runWithDataForSEO` calls to the provider abstraction. Drive model selection from `SCRAPE_TARGETS` instead of hardcoded model groups. Add brand-level `enabledModels` filtering. Add integration test script. **This is the PR to iterate on until data retrieval looks good.**

**Branch:** `providers/4-worker-integration`

### Files to create (new)

| File | What it does |
|------|-------------|
| `apps/web/scripts/test-providers.ts` | Standalone integration test script. Parses `SCRAPE_TARGETS`, tests all or specific providers/models, validates: text content (min 50 chars), citation extraction, raw output re-extraction, latency. Supports `--provider`, `--model`, `--ping` flags. Color-coded output. |
| `.github/workflows/publish.yaml` | CI workflow for provider integration tests (runs as part of release process, optional for PRs) |

### Files to modify

| File | What changes |
|------|-------------|
| `apps/worker/src/jobs/process-prompt.ts` | **Full refactor to use providers.** Import `Provider`, `ProviderOptions`, `parseScrapeTargets`, `resolveProviderId`, `getProvider` from `@workspace/lib/providers`. Replace the three hardcoded model group loops with: `parseScrapeTargets(process.env.SCRAPE_TARGETS)` → iterate `ModelConfig[]` → `resolveProviderId()` → `getProvider()` → `provider.run(model, prompt, options)`. Add brand-level `enabledModels` filtering: if `brand.enabledModels` is set, filter `allModels` to only those models. Update `runModelIteration` to accept `providerImpl: Provider` and `providerOptions: ProviderOptions` instead of separate model group params. Use `result.citations` from the provider's ScrapeResult directly instead of calling `extractCitations()` separately. Remove `modelGroup` parameter from `savePromptRun`/`saveCitations`. |
| `apps/worker/src/report-worker.ts` | Replace inline `runWithOpenAI`/`runWithAnthropic`/`runWithDataForSEO` functions with provider abstraction calls. Import providers, parse SCRAPE_TARGETS, use provider.run(). Remove direct Anthropic/OpenAI/DataForSEO SDK imports. This removes ~130 lines of duplicated API call code. |
| `packages/lib/src/ai-providers.ts` | Gut this file — either remove it entirely or reduce to a thin re-export facade that maps old function names to new provider calls. The worker and report-worker no longer need it. Check if anything else imports from it; if not, delete it. |

### Notes

- This is where you iterate until data retrieval is correct. Run the integration test script against real providers:
  ```bash
  SCRAPE_TARGETS="chatgpt:olostep:online,google-ai-mode:olostep:online" \
  OLOSTEP_API_KEY=... \
  npx tsx apps/web/scripts/test-providers.ts
  ```
- The integration test validates:
  - Text content is extracted and is at least 50 characters
  - Citations are extracted (for providers that return them)
  - `rawOutput` can be re-extracted by the text extraction functions (round-trip test)
  - Latency is recorded
- Keep iterating on provider implementations (from PR 2) if extraction is wrong — fix them in this PR.

### Acceptance criteria

- Worker uses `parseScrapeTargets()` to determine which models to run
- Each model dispatches through the provider abstraction
- `brand.enabledModels` filtering works (null = all models, array = only listed models)
- Integration test script passes for at least one provider
- `ai-providers.ts` is cleaned up or removed
- `pnpm build` succeeds

---

## PR 5: Web Admin UI + Dynamic LLM Settings

**Purpose:** Add the admin providers page (view active models, test connectivity) and make the LLM settings page data-driven instead of hardcoded for OpenAI/Anthropic/Google.

**Branch:** `providers/5-admin-ui`

### Files to create (new)

| File | What it does |
|------|-------------|
| `apps/web/src/routes/_authed/admin/providers.tsx` | Admin providers page. Shows: active models from SCRAPE_TARGETS (model, provider, version, web search flag), all available providers and their config status, per-model connectivity testing (calls `testProviderFn`), test all / test individual, real-time results with loading states. |

### Files to modify

| File | What changes |
|------|-------------|
| `apps/web/src/routes/_authed/app/$brand/settings/llms.tsx` | Refactor to be data-driven. No longer hardcode OpenAI/Anthropic/Google toggle cards. Read active models from server (via `getProviderStatusFn`). Brand admins enable/disable specific models via `enabledModels` array. Dynamic icon mapping per model. Visual indicators for web search capability. |
| `apps/web/src/server/admin.ts` | Add `getProviderStatusFn()` — returns active models and available providers. Add `testProviderFn()` — tests a specific model:provider:version combination by calling `provider.run("What is 2+2?", ...)` and returning success/latency/error/sample output. |
| `apps/web/src/components/app-sidebar.tsx` | Add "Providers" nav item under admin section with `IconPlugConnected` icon. |
| `apps/web/src/routeTree.gen.ts` | Regenerated to include providers route (run `pnpm --filter web generate-routes` or equivalent) |

### Acceptance criteria

- Admin can see all configured models and their providers
- Admin can test connectivity for each model/provider combination
- Brand admins see a dynamic list of models (not hardcoded)
- Brand admins can enable/disable specific models for their brand
- `pnpm build` succeeds

---

## PR 6: CLI Multi-Provider Setup + Documentation

**Purpose:** Refactor the CLI setup flow to ask which scraping provider to use and generate `SCRAPE_TARGETS` automatically. Add deployment documentation for the provider system.

**Branch:** `providers/6-cli-and-docs`

### Files to modify

| File | What changes |
|------|-------------|
| `apps/cli/src/index.ts` | New multi-provider setup flow. Present provider choices: Olostep (recommended), Direct APIs (OpenAI + Anthropic), BrightData, Custom/Manual. For each choice, prompt for relevant API keys and auto-generate SCRAPE_TARGETS. Set SCRAPE_TARGETS in the `.env` file. Remove the old individual-provider key prompts. |
| `e2e/cli-driver.ts` | Update E2E test driver for new CLI flow if needed |

### Files to create (new)

| File | What it does |
|------|-------------|
| `packages/docs/content/docs/deployment/providers.mdx` | Provider documentation: Quick Start with Olostep, SCRAPE_TARGETS format, pricing comparison tables, model coverage per provider, web search configuration, brand-level overrides. |

### Files to modify (docs)

| File | What changes |
|------|-------------|
| `packages/docs/content/docs/deployment/configuration.mdx` | Add SCRAPE_TARGETS to required env vars section |
| `packages/docs/content/docs/deployment/meta.json` | Add providers page to nav |
| `packages/docs/content/docs/contributing/architecture.mdx` | Add Provider architecture section |
| `.changeset/providers-integration.md` | Changeset: minor for lib, worker, web, cli. Documents breaking change (SCRAPE_TARGETS required). |

### Acceptance criteria

- CLI setup generates correct SCRAPE_TARGETS for each provider choice
- Documentation is complete and accurate
- Changeset describes the breaking change
- `pnpm build` succeeds

---

## Summary

```
PR 1: Provider Abstraction Layer          ~8 files    purely additive
PR 2: Provider Implementations            ~9 files    purely additive
PR 3: Database Migration + Naming         ~25 files   mechanical rename (breaking)
PR 4: Worker Integration + Tests          ~4 files    behavioral change, iterate here
PR 5: Web Admin UI                        ~5 files    new features
PR 6: CLI + Docs                          ~7 files    user-facing changes
```

### Dependency graph

```
PR 1 ──> PR 2 ──> PR 3 ──> PR 4 ──> PR 5
                                 ──> PR 6
```

PRs 5 and 6 are independent of each other (both depend on PR 4).

### For each implementation session

Point the implementing agent at:
1. This plan (for what to do)
2. The reference branch `jrhizor/integration-of-scraping-providers-6a2f` (for what the code should look like)
3. The specific PR section in this plan

The agent should:
- Create a new branch from the latest merged state (main, or the previous PR's branch)
- Implement exactly the files listed for that PR
- Verify builds pass (`pnpm build`)
- Run relevant tests (`pnpm test` in affected packages)
- Create the PR

### Key risks

- **PR 3 is the largest** — it touches many files but each change is a mechanical rename. Review by verifying the pattern: `modelGroup` → `model`, `model` → `version`, add `provider` everywhere.
- **PR 4 is where things can break** — this is where provider dispatch actually runs. Integration tests should be run against real APIs before merging.
- **Migration safety** — PR 3's migration renames columns and drops an enum. Test against a database copy. The migration backfills the `provider` column for existing data.
