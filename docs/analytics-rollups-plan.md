# Faster analytics: a from-scratch plan

Status: proposal. Supersedes PR #216 (hourly aggregates) and PR #338 (replayable mention analysis).

## Verdict

Pre-aggregated rollup tables in Postgres, maintained by the worker, are the right foundation. The alternatives have already been tried or are ruled out by how Elmo ships:

| Option | Why not |
|---|---|
| More indexes / query rewrites | Done (migrations 0003, 0017). 90-day pages still take seconds because the cost is rows scanned per request, not plan shape. |
| ClickHouse / Tinybird | Tried Feb–Mar 2026 and removed (`dab4782`): dual-write, two stores, and no self-hosted story. |
| Materialized views, `pg_ivm`, TimescaleDB continuous aggregates | Full refresh with an exclusive lock, or extensions that `postgres:18-alpine` (the self-hosted image) and most managed hosts don't ship. |
| Write-time counters (`ON CONFLICT ... count = count + 1`) | Not idempotent under retries, and a second aggregation code path that must agree with the rebuild path. |
| Response caching | Helps repeat views only; filter combinations (model, tags, search) fragment the cache. Complementary at most. |

But the two PRs are two halves of one problem and neither knows about the other:

- PR #216 assumes `prompt_runs` and `citations` are append-only and finds work by a `created_at` watermark.
- PR #338 makes history mutable: re-analysis rewrites `brand_mentioned` and `competitors_mentioned` across every row of a brand.
- Prompt deletion already deletes raw runs and citations today (`deletePrompt` in `prompts-core.ts`), which #216's design doc says never happens.
- The model filter grew a grounded/premium dimension (`web_search_enabled AND provider IN api providers`) after #216 was written; #216's rollup grain drops `provider`, so the `::premium` filter and PR #564's per-target breakdown cannot be served from it.
- Both are stale against `main` (migrations moved 0009→0020) and PR #701 already moves mention analysis into `packages/lib`, superseding #338's module.

So: scrap both PRs, keep the ideas (sub-day UTC buckets re-bucketed to the browser timezone, delete-and-reinsert bucket rebuilds, a raw-vs-rollup equivalence script, word-boundary matching with tests), and build one derived-data pipeline where every layer is versioned and replayable from raw.

## What is slow today

Every analytics page issues several brand-wide `GROUP BY`s over the window against `prompt_runs` (wide rows, `raw_output` json) and `citations` (12.6M rows in June 2026). Specific hot spots:

- Citations page: four window scans of `citations`, one of them at (prompt, day, url) grain so that every URL in the window can be classified in JS (`getPerPromptDailyCitationPages`, `rollUpCitationUrls`). That JS classification survives any rollup unless it moves to write time.
- Overview: three scans; share of voice: three; opportunities: six (30-day and 7-day).
- `getBrandModelBreakdown` runs one `getCitationsTotalCount` per model.
- The `::premium` model filter on citations needs an `EXISTS` against `prompt_runs` per row.

## Principles

1. Raw provider payloads are the immutable truth. Everything else is derived and can be rebuilt from raw by exactly one code path.
2. Every derived layer records the version of the code and configuration that produced it, so staleness is detectable, recompute is idempotent, and a bug fix or a new feature (say, ChatGPT ads detection) applies to history by bumping a version.
3. Invalidation is explicit: whoever changes data or config marks the affected buckets dirty in the same transaction. Nothing infers work from `created_at`.
4. One bucket-rebuild primitive. No incremental counters.
5. Vanilla Postgres only. Same code for cloud and self-hosted; the worker does the work, pg-boss schedules it.

## Architecture: four layers

| Layer | Data | Version stamp | Recomputed when |
|---|---|---|---|
| L0 raw | `prompt_runs.raw_output` | — | never (except prompt deletion) |
| L1 extraction | `prompt_runs.text_content`, `prompt_runs.web_queries`, `citations` rows | `prompt_runs.extractor_version` | extractor code changes (provider payload parsing, citation extraction, URL normalization) |
| L2 interpretation | `brand_mentioned`, `competitors_mentioned`, future derived facts (ads, sentiment, refusals) | `prompt_runs.analysis_versions` jsonb, one entry per deriver: hash of that deriver's code version plus the brand config it reads | brand or competitor config change; deriver code change; new deriver added |
| L3 rollups | bucket tables below, `cited_pages` | `pipeline_state.rollup_version`, `pipeline_state.classifier_version` | any change in L0–L2; rollup measures added; classifier lists change |

L1 is deterministic per provider payload and tenant-independent, so it is versioned once. L2 is a registry of derivers in `packages/lib`, each declaring `{ name, version, needs: "text" | "raw", derive(input, brandContext) }` and the typed columns it writes on `prompt_runs`. Facts the rollups aggregate live as typed columns (as `brand_mentioned` does today); a new feature adds a deriver, its columns, and the rollup measures it needs. Derivers that only need `text_content` reprocess a brand in minutes; derivers that need `raw_output` are a heavier pass and run at low concurrency.

## Schema

All rollup tables are keyed by a 30-minute UTC bucket, `date_bin('30 minutes', created_at, '2000-01-01')`. Citations share their run's `created_at`, so a citation's bucket is its run's bucket. Every read re-buckets with `(bucket AT TIME ZONE $tz)::date`, which is exact for every whole-hour and half-hour timezone. PR #216 measured hourly buckets at 1.01× the rows of daily on production data because a prompt's runs cluster within minutes; 30-minute buckets cost about the same and drop the half-hour-zone edge error. The width is one constant plus a rebuild if it ever needs to change.

Grain includes `(model, provider, web_search_enabled)` so the grounded/premium filter and PR #564's per-target breakdown are plain predicates. The provider→access mapping is code, so "grounded" is evaluated at read time exactly as `modelFilter` does now.

```sql
CREATE TABLE rollup_prompt_runs (
  brand_id             text        NOT NULL,
  bucket               timestamptz NOT NULL,
  prompt_id            uuid        NOT NULL,
  model                text        NOT NULL,
  provider             text        NOT NULL DEFAULT '',
  web_search_enabled   boolean     NOT NULL,
  runs                 int         NOT NULL,
  brand_mentioned_runs int         NOT NULL,
  competitor_runs      int         NOT NULL,   -- runs mentioning >= 1 competitor
  competitor_mentions  int         NOT NULL,   -- sum(cardinality(competitors_mentioned))
  first_run_at         timestamptz NOT NULL,
  last_run_at          timestamptz NOT NULL,
  PRIMARY KEY (brand_id, bucket, prompt_id, model, provider, web_search_enabled)
);
CREATE INDEX ON rollup_prompt_runs (prompt_id, bucket);

CREATE TABLE rollup_competitor_mentions (
  brand_id, bucket, prompt_id, model, provider, web_search_enabled,   -- as above
  competitor_name      text NOT NULL,
  runs                 int  NOT NULL,          -- runs mentioning this competitor
  PRIMARY KEY (brand_id, bucket, prompt_id, model, provider, web_search_enabled, competitor_name)
);
CREATE INDEX ON rollup_competitor_mentions (prompt_id, bucket);

-- One row per distinct normalized URL, tenant-independent.
CREATE TABLE cited_pages (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url                  text NOT NULL UNIQUE,   -- normalizeUrl() output
  domain               text NOT NULL,
  title                text,                   -- most recently seen non-null title
  page_type            text NOT NULL,          -- inferPageType(url, title)
  static_category      text NOT NULL,          -- classifyUrl() with empty brand/competitor sets
  classifier_version   int  NOT NULL,
  first_seen_at        timestamptz NOT NULL,
  last_seen_at         timestamptz NOT NULL
);

CREATE TABLE rollup_citation_urls (
  brand_id, bucket, prompt_id, model, provider, web_search_enabled,
  page_id              bigint NOT NULL REFERENCES cited_pages(id),
  domain               text   NOT NULL,        -- denormalized: brand/competitor override at read time
  static_category      text   NOT NULL,        -- denormalized: category totals without a join
  page_type            text   NOT NULL,
  citations            int    NOT NULL,
  position_sum         int    NOT NULL,
  position_count       int    NOT NULL,
  PRIMARY KEY (brand_id, bucket, prompt_id, model, provider, web_search_enabled, page_id)
);
CREATE INDEX ON rollup_citation_urls (prompt_id, bucket);

CREATE TABLE rollup_citation_domains (
  brand_id, bucket, prompt_id, model, provider, web_search_enabled,
  domain               text NOT NULL,
  static_category      text NOT NULL,          -- categorizeDomain() with empty brand/competitor sets
  citations            int  NOT NULL,
  PRIMARY KEY (brand_id, bucket, prompt_id, model, provider, web_search_enabled, domain)
);
CREATE INDEX ON rollup_citation_domains (prompt_id, bucket);

-- Phase 4: query fan-out.
CREATE TABLE rollup_web_queries (
  brand_id, bucket, prompt_id, model, provider, web_search_enabled,
  query                text NOT NULL,          -- lower(btrim()); sentinel rows excluded
  runs                 int  NOT NULL,
  brand_mentioned_runs int  NOT NULL,
  PRIMARY KEY (...)
);

-- Invalidation outbox.
CREATE TABLE rollup_dirty (
  brand_id   text        NOT NULL,
  bucket     timestamptz NOT NULL,
  reason     text        NOT NULL,            -- run | reprocess | backfill | reconcile | reclassify | schema
  marked_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, bucket)
);

-- Which code versions the stored data reflects; the worker compares these to
-- the constants in lib on startup.
CREATE TABLE pipeline_state (
  id                    smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  backfill_enqueued_at  timestamptz,
  backfill_completed_at timestamptz,
  rollup_version        int NOT NULL DEFAULT 0,
  classifier_version    int NOT NULL DEFAULT 0,
  last_reconcile_at     timestamptz
);

ALTER TABLE prompt_runs
  ADD COLUMN text_content      text,
  ADD COLUMN extractor_version int,
  ADD COLUMN analysis_versions jsonb NOT NULL DEFAULT '{}';
```

Why these choices:

- **`cited_pages` as a dimension.** URL strings and titles are what made #216's URL table ~1.9 GB. A `bigint` key makes fact rows fixed-width; the title lives once per URL.
- **Classification at rollup time.** `page_type` and the static category (curated lists, editorial set, page-type fallbacks) are tenant-independent, so they are computed once per URL. The tenant-dependent part (brand vs competitor domain) is a domain-membership test over two small sets, applied at read time over domain-grain rows exactly as `categorizeDomain` does today. Category totals come from `rollup_citation_urls` grouped by `(domain, static_category, page_type)`, never from per-URL rows.
- **Keyed by `prompt_id`.** Tag and search filters resolve to prompt-id lists already (`resolveFilteredPrompts`); `count(DISTINCT prompt_id)` stays exact; prompt deletion is a plain `DELETE ... WHERE prompt_id = $1`.
- **No `prompt_run_id` in rollups.** Run lists and run detail keep reading raw rows via `(prompt_id, created_at)`; those are already fast.

Storage on the June 2026 production numbers: prompt-run tables ~50 MB, domains ~350 MB, URLs ~450 MB plus `cited_pages` (one row per distinct URL, likely 1–2M rows, ~300 MB). Roughly 1.2 GB, under #216's 2.3 GB.

## Writes and invalidation

Everything that changes raw data or interpretation marks `(brand_id, bucket)` dirty in its own transaction. The mark is an `INSERT ... ON CONFLICT DO NOTHING`, so it cannot be lost and duplicates collapse.

- `process-prompt`: `savePromptRun` + `saveCitations` + dirty mark become one transaction. It also persists `text_content`, `extractor_version`, and `analysis_versions` for every registered deriver. After the cycle it sends `refresh-rollups` with a `singletonKey` and a few seconds of `singletonSeconds`, so freshness is seconds rather than the cron minute.
- `reprocess` (see below): after each batch, marks the distinct buckets of the rows it rewrote.
- `deletePrompt`: deletes the prompt's rollup rows in the same transaction as the raw deletes. No rebuild needed.
- Version bumps in code, detected on worker start against `pipeline_state`: `CLASSIFIER_VERSION` re-classifies `cited_pages` in batches and marks every citation bucket `reclassify`; `ROLLUP_VERSION` (a measure or dimension added) marks every bucket `schema`; `EXTRACTOR_VERSION` or a deriver version enqueues a global `reprocess`.

## Reprocessing

One pg-boss job, `reprocess`, with payload `{ brandId?: string, layers: ("extraction" | "interpretation")[], derivers?: string[] }`. It walks `prompt_runs` in id order in batches, and for each row rewrites only what is stale by comparing the stored versions to the current ones, so it is idempotent and resumable by construction:

- Extraction stale: re-run `extractTextContent`, `extractCitations`, and the web-query extractor from `raw_output`; replace the run's `citations` rows and `web_queries`; stamp `extractor_version`.
- Interpretation stale for a deriver: run that deriver against `text_content` (or `raw_output` if it declares `needs: "raw"`) and the brand's current config; write its columns; stamp its entry in `analysis_versions`.
- Prompt `system_tags` (branded/unbranded) are recomputed per brand alongside, since they read the same config.
- After each batch: dirty marks for the touched buckets.

Triggers: brand or competitor config change enqueues `{ brandId, layers: ["interpretation"] }` with a per-brand singleton and a 60-second debounce (from `updateBrandFn`, `updateCompetitors`, `addDomainToBrandFn`, `addDomainToCompetitorFn`, `createCompetitorFromDomainFn`); a version bump enqueues the global form; an admin action can enqueue either. Global passes that read `raw_output` run at low concurrency behind prompt processing, and the admin page shows stale-row counts per brand.

This is what makes retroactive fixes routine: a matcher bug fix, a new provider payload shape, or a new deriver such as ads detection is a version bump plus the rows it needs, never a one-off script.

## The refresh job

One pg-boss job, `refresh-rollups`, scheduled every minute and sent on demand. Three duties:

1. **Drain.** Claim up to N marks with `DELETE ... WHERE (brand_id, bucket) IN (SELECT ... ORDER BY bucket DESC FOR UPDATE SKIP LOCKED LIMIT N) RETURNING *`, coalesce consecutive buckets of one brand into one rebuild (up to a day), rebuild each range in its own transaction, re-insert the marks if a rebuild fails. Claiming before reading raw rows is what makes this race-free: any writer that commits after the claim inserts its own mark. Recent-first ordering means today's dashboards fill first during a backfill.
2. **Backfill.** On worker start, if `backfill_enqueued_at IS NULL`, insert one mark per distinct `(brand_id, bucket)` in `prompt_runs` (served by `idx_prompt_runs_brand_analytics`), reason `backfill`, and stamp the state row. When no `backfill` marks remain, stamp `backfill_completed_at`. No separate script, no cursor columns; a crash leaves the marks in place.
3. **Reconcile.** Nightly, mark the trailing 48 hours for every brand with runs, and compare a sample of buckets against raw. Drift goes to Sentry.

`rebuildRange(brandId, fromBucket, toBucket)`:

- Prompt-run and competitor tables: `DELETE` the range, `INSERT ... SELECT ... GROUP BY` from `prompt_runs`. Nothing to classify, so SQL is simplest.
- Citation tables: read the range's citations joined to their runs (narrow columns only), aggregate in TypeScript through a pure `aggregateCitationBucket(rows, ctx)` that reuses `normalizeUrl`, `isGoogleSurfaceUrl`, `inferPageType`, and the static half of `classifyUrl`; upsert `cited_pages`; `DELETE` the range and bulk-insert. Google surface URLs (search, shopping) stay in, flagged by `static_category = 'google'`: `rollUpCitationUrls` excludes them from the source mix at read time as it does today, and `buildGoogleModule` needs their URLs and titles from `cited_pages`.
- Whole range in one transaction with `pg_advisory_xact_lock(hashtext(brand_id))` so a manual rebuild and the scheduled one cannot interleave.

Prerequisite: `domain-categories.ts`, `domain-categories.server.ts`, `editorial-domains.ts`, and the pure parts of `citation-rollup.ts` move from `apps/web` to `packages/lib` so the worker can import them.

Steady-state cost: a brand-bucket is at most a few thousand runs and tens of thousands of citations, tens to a few hundred milliseconds. The initial cloud backfill is on the order of 50–100K brand-buckets; with coalescing and recent-first ordering the last 90 days for every brand complete within roughly half an hour, and the tail finishes in the background.

## Reads

New module `rollup-read.ts` exposing the same signatures as the brand-wide functions in `postgres-read.ts`, so `analytics-core.ts`, the server functions, `/api/v1`, and the MCP tools do not change shape.

| Today | Source after |
|---|---|
| `getDashboardSummary`, `getPerPromptVisibilityTimeSeries`, `getVisibilityDailyAggregate` (LVCF CTE unchanged), `getPromptsSummary`, `getPerPromptRunStats`, `getBrandMentionTotals`, `getPerPromptDailyMentions`, `getBrandMentionRateByModel`, `getBatchChartData`, `getPromptMentionSummary` | `rollup_prompt_runs` |
| `getPerPromptDailyCompetitorMentions`, `getPromptTopCompetitorMentions` | `rollup_competitor_mentions` |
| `getCitationsTotalCount`, `getCitationDomainStats`, `getCitationDomainPromptCounts`, `getDailyCitationStats`, `getPerPromptDailyCitationStats` | `rollup_citation_domains` |
| `getCitationUrlStats`, `getPromptCitationUrlStats`, `getPerPromptCitationPages`, `getPerPromptDailyCitationPages` (becomes a `(prompt, day, domain, static_category, page_type)` group-by; no per-URL rows leave the database) | `rollup_citation_urls` + `cited_pages` for the top-N join |
| `getFanoutBreakdown`, `getFanoutModelTotals`, `getFanoutPromptTotals`, `getPromptWebQueryCounts` | raw until Phase 4, then `rollup_web_queries` |
| `getPromptRuns`, `countPromptRuns`, `findRunDetail`, `getPromptsFirstEvaluatedAt`, `getBrandEarliestRunDate`, admin stats | raw (single-prompt indexes or infrequent) |

Also fixed in passing: the per-model citation count N+1 becomes one grouped query; the citations model filter loses its `EXISTS`; the `all` lookback (#708) becomes genuinely unbounded everywhere, since a whole-history window over rollups is cheap.

Instant windows: the dashboard asks in calendar days in the viewer's timezone, which the buckets answer exactly. The `/api/v1` brand analytics endpoints accept arbitrary ISO instants (`analytics-range.ts`), and a bucket cannot be split at, say, 10:17. Decision: `start` and `end` are aligned down to the half hour. Phase 2 documents this in the OpenAPI spec and `analytics-range.ts` performs the alignment, so the response echoes the window that was actually answered.

Cutover gate: while `pipeline_state.backfill_completed_at IS NULL`, reads fall back to the raw functions (checked once per request, cached in-process for a minute). Self-hosters upgrading get correct pages during their backfill; cloud runs Phase 1 to completion before Phase 2 deploys. The fallback and the raw functions are deleted one release later; the raw SQL survives only as the oracle in the integration test.

## Phases

**Phase 1: rollups, dark.** Migration (tables, columns), lib move of classification code, `aggregateCitationBucket` with unit tests, `rebuildRange`, `refresh-rollups` job, write-path transaction and marks, startup backfill, reconcile, version detection against `pipeline_state`. Nothing reads the tables. No changeset.

**Phase 2: read cutover.** `rollup-read.ts`, the mapping above, the backfill gate, fix the N+1, resolve `all`. Before merging on cloud: run a raw-vs-rollup equivalence and timing script (the idea from #216's `bench-aggregate-vs-raw.ts`) against production for every page × lookback × timezone. Changeset: faster analytics pages.

**Phase 3: replayable extraction and interpretation.** Build on PR #701's `lib/mentions.ts`: the deriver registry, word-boundary matching with #338's tests as the first version bump (applied to history via `reprocess`), `EXTRACTOR_VERSION` and per-deriver versions, the `reprocess` job and its triggers, run detail reading `text_content`, stale-row counts on the admin page. Changeset: editing aliases or competitors updates historical data.

**Phase 4: the rest.** `rollup_web_queries` for the fan-out page; drop the raw fallback and old SQL; admin stats; data retention (#50). Retention trades replayability for storage: purged history keeps its rollups but can no longer be reprocessed, so the rebuild must refuse buckets older than the retention horizon, and retention should be a per-deployment opt-in.

Phases 1 and 3 can proceed in parallel after the migration lands; Phase 2 depends on Phase 1.

## Salvage from the two PRs

| Keep | From | Drop |
|---|---|---|
| Sub-day UTC buckets, `AT TIME ZONE` re-bucketing, `first_run_at`/`last_run_at` for "last updated" | #216 | `created_at` watermark, backfill script and cursor columns, `aggregate_refresh_state`, grain without `provider`, title column per URL row |
| Delete-and-reinsert bucket rebuild as the single primitive | #216 | one transaction per tick (becomes one per range) |
| Equivalence + timing script | #216 | — |
| `text_content`, `analyzed_at` idea (becomes versioned stamps), lazy extraction, debounced per-brand re-analysis, word-boundary tests | #338 | `mention-analysis.ts` (PR #701 already places this in lib), eager `backfill-text-content` job (would read the whole `raw_output` history; extract lazily instead), single-purpose `reanalyze-brand` (becomes `reprocess`) |

## Verification

- Unit: `aggregateCitationBucket`, deriver registry and version stamping, matcher behavior, dirty-mark coalescing.
- Integration (Vitest with `DATABASE_URL`): seed raw rows, rebuild, assert every rollup-backed read equals the raw oracle across windows, timezones (including a half-hour zone), model filters and prompt subsets; prompt deletion; `reprocess` with a bumped version rewrites only stale rows and invalidates their buckets; a concurrent insert during a rebuild still produces a mark.
- Production shadow run of the equivalence script before the Phase 2 merge.
- Operations: dirty backlog size, oldest-mark age, and stale-row counts per version as health metrics; reconcile drift to Sentry.

## Implementation notes

Where the code differs from the schema and job sketches above:

- `prompt_runs.analysis_versions` is a jsonb map of deriver name to stamp (`<version>:<config hash>`), and `pipeline_state` also records `extractor_version` and `deriver_versions` so a worker restart can tell a real version bump from first initialization.
- `cited_pages.static_category` and the citation rollups store `google` for Google search and shopping surfaces; it is outside `CITATION_CATEGORIES`, and readers drop those rows from the source mix the way `rollUpCitationUrls` always has.
- `rollup_competitor_mentions.runs` counts distinct runs, matching the raw top-competitor query.
- The nightly reconcile is its own queue, `reconcile-rollups`; the write path nudges `refresh-rollups` with a 10-second singleton window after every successful prompt cycle.
- `reprocess` continues itself with a cursor after four minutes of work and re-derives `prompts.system_tags` per brand when interpretation ran. Filling `text_content` lazily during an interpretation pass does not stamp `extractor_version`, so an extraction pass still revisits those rows.
- While `pipeline_state.backfill_completed_at` is null, `analytics-read.ts` serves every read from the raw tables; the raw functions and the fallback are removed once every deployment has backfilled.

## Decisions

1. Everything derived is reprocessable from raw, and bug fixes and new derivers apply to history through version bumps. Word-boundary matching therefore applies to existing runs.
2. 30-minute buckets.
3. `all` lookback becomes genuinely unbounded once reads move to rollups.
4. Competitor ids are not stable across a bulk save (`updateCompetitors` deletes and reinserts); tracked in #709. Rollups key competitor mentions by name, which survives that.
5. `/api/v1` instant windows are aligned down to the half hour and documented as such.
