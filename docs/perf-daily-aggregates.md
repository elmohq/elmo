# Plan: Worker-maintained hourly aggregates for analytics pages

> **Status:** proposal · **Owner:** TBD · **Touches:** `packages/lib/src/db/schema.ts`, `apps/web/src/lib/postgres-read.ts`, `apps/web/src/server/{dashboard,visibility,citations,prompts}.ts`, `apps/worker/src/jobs/`

## TL;DR

The overview, visibility, citations, and prompt-detail dashboards drive ~16 analytics queries against the raw `prompt_runs` (2 M rows) and `citations` (12.6 M rows) tables. At 30-day lookbacks these are 1–5 s per page; at 90-day they range 5–35 s and occasionally spike past a minute. We have already proven that no amount of query rewriting, indexing, or planner-hinting can break the multi-second floor at large lookbacks — the cost is fundamentally the volume of rows scanned per request.

This plan replaces the per-request scan with a worker-maintained set of pre-computed **hourly** aggregate tables (the `hourly_*` table family). Every analytics query that today touches `prompt_runs` or `citations` for a chart or windowed stat will instead read a small, indexed summary table whose row count grows with `(brands × prompts × hours × models)` rather than `runs × citations-per-run`. Expected effect: every dashboard query becomes O(active_prompts × hours_in_window) lookups, dropping page wall time from "single-digit seconds with multi-second tails" to "tens-of-milliseconds, no tails."

The cost is one new minute-cadence worker job, four new tables + one state row, a one-time backfill, and a refactor of ~16 read functions to point at the new tables. No changes to the write path — the worker reads from the existing raw tables. `prompt_runs` and `citations` are append-only logs in this codebase, so we don't need invalidation on deletes.

**Why hourly and not daily:** measured against production data, hourly buckets cost only **1.01×** the row count of daily buckets across all four aggregate tables. Runs of the same `(brand, prompt, model)` combination on the same day almost always cluster in the same hour (worker batches them), so bucketing by hour adds essentially zero rows but lets every query re-bucket to the viewer's browser timezone for free at read time.

## Why we're doing this and not something else

We benchmarked five other approaches against the production data; none of them broke the floor. Recapping briefly so the trade-off is on record:

| Approach | What it does | Result |
|---|---|---|
| Better indexes (`(brand_id, prompt_id, created_at) INCLUDE …`) | Index-only scan paths for most analytics queries | Helped a lot at 7d (≤1 s), modestly at 30d, didn't move 90d below ~5 s for individual queries; concurrent runs still spike to 30 s |
| Planner hints (`SET LOCAL enable_bitmapscan = off` / `enable_indexscan = off`) | Force the cheaper plan per query | Cuts isolated query times by 5–10× in some cases; doesn't help when queries run concurrently |
| `RECENT_WRITE_FENCE` (`created_at < now() - 1 min`) | Avoid index scans bumping into pages that aren't yet in the visibility map | Fixes p99 spikes from 100 s to <1 s for the count-citations query, but doesn't reduce the typical scan cost |
| LIMIT + tiebreaker on URL/domain stats | Fetch only what the UI renders | Cuts ~50 % of payload but DB time is dominated by the aggregate scan, not by the row return |
| One mega-CTE that scans citations once | Replace 5 parallel scans with 1 scan + 5 aggregates against the materialized CTE | At 30 d slightly faster than serial, slower than parallel; at 90 d landed in the same 28–45 s band as everything else |
| TABLESAMPLE for top-K | Page-level sampling | Defeats indexed access; whole-table scans at 30+ s for what was a 1 s query |

The pattern is consistent: we are CPU- and IO-bound on materializing the same row set on every request. The only way out is to stop materializing it on every request.

Pre-aggregated tables are a one-line answer to that — keep the answer around so requests just look it up. Everything else is window-dressing.

## Goals

1. **Page wall time at 90 d ≤ 1 s** on the overview, visibility, citations, and prompt-detail pages, including p99.
2. **No user-visible data loss.** Every metric that exists today still appears, with at most ~60 s of staleness.
3. **All charts and stats correct in the viewer's browser-local timezone.** Every query takes a `tz` argument and re-buckets the hourly aggregate at read time; no TZ-related fudge.
4. **No changes to the write path.** Workers continue inserting into `prompt_runs` and `citations` exactly as they do today.
5. **Idempotent worker.** Running the refresh twice in a row, or after a partial failure, must yield identical aggregate state.
6. **Cheap to run continuously.** Each refresh tick costs <10 s of DB work in the steady state.
7. **Continue to see "last prompt run X ago" on the overview** (no new UI affordance for the worker's refresh cadence — the aggregate's ~60 s delay is uniform and not worth surfacing).

## Non-goals

- Real-time analytics. ~60 s staleness is fine for these pages.
- Replacing `prompt_runs` / `citations` as the source of truth. They stay; aggregates derive from them.
- Admin queries (`getAdmin*`). They run against raw tables today and are infrequent; can move to aggregates in a follow-up if useful.

## Why hourly buckets

Measured against all-time production data:

| Source table | Raw rows | Daily aggregate rows | Hourly aggregate rows | Hourly / daily |
|---|---:|---:|---:|---:|
| `prompt_runs` | 2,049,446 | 390,174 | 398,458 | **1.02×** |
| `citations` (by `domain`) | 12,611,548 | 3,671,596 | 3,712,503 | **1.01×** |
| `citations` (by `url`) | 12,611,548 | 6,469,426 | 6,523,516 | **1.01×** |

Hourly buckets cost essentially zero extra storage. The reason is mechanical: when a `(brand, prompt, model)` combination runs multiple times on a single day, the worker that does the runs batches them together, so they land in the same UTC hour. A daily bucket of 5 raw runs and an hourly bucket of those same 5 runs are usually the same row.

Buying hourly granularity for ~1% extra rows lets us re-bucket at query time to **any** viewer timezone without per-tenant infrastructure. This includes half-hour offsets like IST (+5:30) and ACST (+9:30) — they're off by at most 30 minutes worth of one bucket on the chart, which is invisible at chart resolution, vs being off by an entire hour with daily aggregates.

## Schema

Four new tables prefixed `hourly_*`, all owned by the worker. None have foreign keys (the worker rebuilds the partitions for any affected `(brand_id, date)` from scratch on every tick, so referential integrity is enforced by reconstruction).

The bucket column is `hour timestamptz NOT NULL` — set to the start of the UTC hour the rows were inserted in (`date_trunc('hour', created_at)` semantics). All read queries take a `tz` parameter and re-project to the viewer's local time at query time.

### `hourly_prompt_runs`

One row per `(brand_id, prompt_id, hour, model, web_search_enabled)`. Drives every visibility-page metric, the overview's visibility chart, and the prompt-detail page's runs/mention stats.

```sql
CREATE TABLE hourly_prompt_runs (
    brand_id              text        NOT NULL,
    prompt_id             uuid        NOT NULL,
    hour                  timestamptz NOT NULL,         -- start of UTC hour
    model                 text        NOT NULL,
    web_search_enabled    boolean     NOT NULL,
    total_runs            integer     NOT NULL,
    brand_mentioned_count integer     NOT NULL,
    competitor_run_count  integer     NOT NULL,         -- runs where any competitor was mentioned
    competitor_mention_sum integer    NOT NULL,         -- sum(array_length(competitors_mentioned, 1)) — for weighted_mentions
    first_run_at          timestamptz NOT NULL,         -- min(created_at) within bucket; preserves precise timestamps
    last_run_at           timestamptz NOT NULL,         -- max(created_at) within bucket; same
    PRIMARY KEY (brand_id, hour, prompt_id, model, web_search_enabled)
);

-- Used by getPerPromptVisibilityTimeSeries / getBatchChartData / getPromptDailyStats
CREATE INDEX hourly_prompt_runs_brand_hour_prompt_idx ON hourly_prompt_runs (brand_id, hour, prompt_id);

-- Used by single-prompt detail page queries
CREATE INDEX hourly_prompt_runs_prompt_hour_idx ON hourly_prompt_runs (prompt_id, hour);
```

We carry `first_run_at` and `last_run_at` as real `timestamptz` values inside each bucket, so `getPromptsFirstEvaluatedAt` and the overview's "Last updated X ago" affordance both keep their original precision (we just take `min` / `max` of these across the relevant buckets).

**Estimated size:** measured ~398 K rows all-time × ~70 B per row = ~28 MB. Indexes ~20 MB. Total **~48 MB**.

### `hourly_prompt_run_competitors`

One row per `(brand_id, prompt_id, hour, model, competitor_name)`. Drives the per-prompt competitor mention chart on the visibility page and the prompt-detail page's competitor-by-day series.

```sql
CREATE TABLE hourly_prompt_run_competitors (
    brand_id        text        NOT NULL,
    prompt_id       uuid        NOT NULL,
    hour            timestamptz NOT NULL,
    model           text        NOT NULL,
    competitor_name text        NOT NULL,
    mention_count   integer     NOT NULL,
    PRIMARY KEY (brand_id, hour, prompt_id, model, competitor_name)
);

CREATE INDEX hourly_prompt_run_competitors_brand_hour_idx
    ON hourly_prompt_run_competitors (brand_id, hour);
CREATE INDEX hourly_prompt_run_competitors_prompt_hour_idx
    ON hourly_prompt_run_competitors (prompt_id, hour);
```

**Estimated size:** ~398 K source-bucket rows × avg 0.3 competitors mentioned per run = ~120 K rows × 70 B = **~8 MB**.

### `hourly_citations`

One row per `(brand_id, prompt_id, hour, model, domain)`. Drives the citations-page time-series chart, the overview's citation category trends, and the prompt-detail page's citation-by-domain stats.

```sql
CREATE TABLE hourly_citations (
    brand_id  text        NOT NULL,
    prompt_id uuid        NOT NULL,
    hour      timestamptz NOT NULL,
    model     text        NOT NULL,
    domain    text        NOT NULL,
    count     integer     NOT NULL,
    PRIMARY KEY (brand_id, hour, prompt_id, model, domain)
);

-- For getCitationDomainStats and brand-level domain rollups
CREATE INDEX hourly_citations_brand_hour_domain_idx ON hourly_citations (brand_id, hour, domain);

-- For prompt-detail page (getPromptCitationStats)
CREATE INDEX hourly_citations_prompt_hour_idx ON hourly_citations (prompt_id, hour);
```

**Estimated size:** measured ~3.7 M rows × ~60 B = ~225 MB. Indexes ~110 MB. Total **~335 MB**.

### `hourly_citation_urls`

One row per `(brand_id, prompt_id, hour, model, url)`. Drives the top-URL list and the "what's changed" section on the citations page, plus the prompt-detail page's top-URL list.

```sql
CREATE TABLE hourly_citation_urls (
    brand_id          text        NOT NULL,
    prompt_id         uuid        NOT NULL,
    hour              timestamptz NOT NULL,
    model             text        NOT NULL,
    url               text        NOT NULL,
    domain            text        NOT NULL,                  -- denormalized for query convenience
    title             text,                                  -- most recent non-null title for this (url, hour)
    count             integer     NOT NULL,
    sum_citation_index integer    NOT NULL,                  -- avg = sum_citation_index / count
    PRIMARY KEY (brand_id, hour, prompt_id, model, url)
);

-- For getCitationUrlStats (top URLs across a window)
CREATE INDEX hourly_citation_urls_brand_hour_url_idx ON hourly_citation_urls (brand_id, hour, url);

-- For prompt-detail page (getPromptCitationUrlStats)
CREATE INDEX hourly_citation_urls_prompt_hour_idx ON hourly_citation_urls (prompt_id, hour);
```

**Estimated size:** measured ~6.5 M rows × ~200 B (URL strings dominate) = ~1.3 GB. Indexes ~600 MB. Total **~1.9 GB**. (This is the biggest single new object; URL strings are unavoidably long.)

### `aggregate_refresh_state`

A single-row table tracking refresh progress. The worker reads it at the start of each tick and updates it at the end. The web app also reads it to surface freshness in the UI.

```sql
CREATE TABLE aggregate_refresh_state (
    id                     smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_refreshed_through timestamptz NOT NULL DEFAULT 'epoch',  -- raw `created_at` watermark fully covered
    last_run_started_at    timestamptz,
    last_run_finished_at   timestamptz,
    last_run_status        text,                                  -- 'success' | 'failed' | 'in_progress'
    last_run_error         text,
    last_affected_buckets  integer                                -- (brand, date) tuples touched by the last run
);

INSERT INTO aggregate_refresh_state (id) VALUES (1);
```

### Total storage impact

~2.3 GB of new tables + indexes. We can reclaim ~1.3 GB by dropping the unused `citations_brand_created_prompt_domain_idx` (zero scans since it was created — verified). **Net storage delta: ~+1.0 GB.**

## Worker

### Scheduling

The repo already uses `pg-boss`. Add a recurring job with `singletonKey` so a tick is skipped if the previous tick is still running — exactly matching the "every minute unless one is already running" requirement, with no need for app-level locking.

```ts
boss.schedule(
    "refresh-hourly-aggregates",
    "* * * * *",                 // every minute
    {},
    { singletonKey: "refresh-hourly-aggregates" }
);
```

The `singletonKey` covers the in-flight case. The worker itself takes a Postgres advisory lock as belt-and-suspenders in case a stale pg-boss state ever lets two ticks slip through:

```ts
await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('refresh-hourly-aggregates'))`);
```

### What one tick does

The worker rebuilds full **UTC days** at a time even though buckets are hourly. A day's worth of hourly buckets for a single brand is small (24 hourly buckets × however many distinct prompt/model combos active that day) and rebuilding the whole day keeps the logic simple — no need to track per-hour watermarks.

```text
1. Begin a transaction. Acquire xact-scoped advisory lock.
2. Read aggregate_refresh_state.last_refreshed_through.
3. Compute window boundaries:
     lower_bound = max(last_refreshed_through - INTERVAL '1 hour', '-infinity')
     upper_bound = now() - INTERVAL '30 seconds'
   The 1-hour overlap absorbs late-arriving inserts (worker batches that
   complete after the previous tick read its watermark). The 30-second
   trailing edge avoids partial-page reads from in-flight writers.
4. Find affected (brand_id, date) buckets:
     SELECT DISTINCT brand_id, (created_at AT TIME ZONE 'UTC')::date AS d
     FROM (
       SELECT brand_id, created_at FROM prompt_runs WHERE created_at BETWEEN lower_bound AND upper_bound
       UNION
       SELECT brand_id, created_at FROM citations    WHERE created_at BETWEEN lower_bound AND upper_bound
     ) s
5. For each (brand_id, date) bucket:
     a. DELETE FROM hourly_prompt_runs
        WHERE brand_id=$ AND hour >= date AND hour < date + INTERVAL '1 day'
     b. INSERT INTO hourly_prompt_runs
        SELECT brand_id, prompt_id, date_trunc('hour', created_at) AS hour, model, web_search_enabled,
               count(*)::int, count(*) FILTER (WHERE brand_mentioned)::int, …
        FROM prompt_runs
        WHERE brand_id=$
          AND created_at >= date::timestamptz
          AND created_at < (date + INTERVAL '1 day')::timestamptz
        GROUP BY brand_id, prompt_id, hour, model, web_search_enabled
     c. Same DELETE+INSERT for hourly_prompt_run_competitors,
        hourly_citations, hourly_citation_urls.
   All four tables are rebuilt for the bucket atomically — readers see either
   the old state or the new state, never a partial state.
6. UPDATE aggregate_refresh_state SET last_refreshed_through=upper_bound,
                                      last_run_finished_at=now(),
                                      last_run_status='success',
                                      last_affected_buckets=N.
7. COMMIT.
```

Notes:

- The whole tick is a single transaction. If anything fails midway, the lock is released and the state row stays where it was, so the next tick re-runs the same window. (We log the error to `last_run_error` in a separate non-transactional update at the end.)
- `DELETE … WHERE brand_id=$ AND hour BETWEEN day_start AND day_end` followed by `INSERT … SELECT` is the simplest correct shape. UPSERT (`ON CONFLICT DO UPDATE`) gets weird because the natural primary key includes `model` and `web_search_enabled`, so a rerun where some `(model, web_search_enabled)` combinations disappear would leave stale rows behind. DELETE + INSERT guarantees the bucket reflects the source.
- `prompt_runs` and `citations` are append-only in this codebase (no soft-delete column, no DELETE statements anywhere in the worker or server code). That means we never have to worry about the aggregates getting stuck holding rows that no longer exist in the source — the only drift is "rows added since last tick", which the watermark + 1-hour overlap handles.
- We do **not** scan back to the beginning of time on every tick. The 1-hour overlap is sufficient for the real worker insert pattern (jobs complete within seconds). The nightly safety-net rebuild (below) handles anything that slipped past 1 hour.

### Steady-state cost per tick

For the largest brand we have today, a single (brand, date) bucket on the day with the most activity contains ~150 prompt-runs and ~5 K citations. Aggregating one bucket is ~30–80 ms of DB time. In normal operation a tick touches 1–3 buckets (today, plus one bucket on either side near midnight UTC), so ~150 ms total. Across all 80 brands, the union may include up to ~80 (brand, today) tuples per tick worst case ≈ ~5 s of DB work. Comfortably inside a 60 s window.

### Nightly full-rebuild safety net

Once a day (e.g. 03:00 UTC), a separate job rebuilds the trailing 30 days from scratch. This catches:

- Buckets affected by backfill jobs that insert with `created_at` values older than the 1-hour overlap window.
- Any mathematical drift between source and aggregate caused by a bug we haven't seen yet.

(We don't need it to handle deletes, since deletes don't happen on these tables.)

The nightly rebuild is the same code path as the per-tick refresh, just with a 30-day lower bound instead of `last_refreshed_through - 1 hour`. Cost: ~30 s of DB work, run once per day, well off-peak.

## Local-timezone handling

Every analytics query takes a `tz` parameter (the viewer's browser-reported IANA timezone, the same one the current code already passes around). The aggregate is bucketed in UTC; the query re-buckets to the viewer's TZ using Postgres's native conversion.

**Date-range filter** (lower / upper bound on the window the user selected, e.g. "last 30 days"):

```sql
WHERE hour >= ($from::date AT TIME ZONE $tz)               -- start of $from in user's TZ, expressed as UTC instant
  AND hour <  (($to::date + INTERVAL '1 day') AT TIME ZONE $tz)
```

This is the same trick the existing code uses on `created_at`. Since `hour` is `timestamptz`, the comparison is straightforward.

**Date-bucket projection** (when the chart needs `date` as the X-axis):

```sql
SELECT (hour AT TIME ZONE $tz)::date AS local_date,
       sum(total_runs)::int          AS total_runs,
       sum(brand_mentioned_count)::int AS brand_mentioned_count
FROM hourly_prompt_runs
WHERE …
GROUP BY local_date
```

The `(hour AT TIME ZONE $tz)::date` expression takes the UTC hour, projects to the user's local time, and truncates to date. A run that landed at 23:30 UTC will show up under "tomorrow" for an `Asia/Tokyo` viewer and under "today" for a `Europe/London` viewer — exactly what users expect.

For the small set of stats that aren't bucketed by date (`max(last_run_at)`, top-URL counts, total citations in window) the same date-range filter applies and the result naturally reflects the user's TZ window.

**Edge case — half-hour offsets:** Postgres's `AT TIME ZONE` correctly handles `Asia/Kolkata` (+5:30), `Asia/Tehran` (+3:30), etc. A query for an Indian viewer looking at "today" will straddle two UTC hour buckets at the day boundary, but since the SUM is over both buckets it's exact. A bucket that overlaps the boundary contributes its full count to whichever side the bucket starts on, so the chart bar at the very edge of the window may be off by less than one hour's worth of activity. Invisible at chart resolution.

**Why this beats per-brand TZ aggregates:** zero schema cost (no `timezone` column on `brands`, no UI for setting it), works correctly for users in any TZ regardless of where their company is "based", and Postgres does all the conversion for free at query time.

## Surfacing freshness in the UI

We preserve **only** the existing "Last updated X ago" stat (the timestamp of the most recent prompt run for the brand) by reading `max(last_run_at) FROM hourly_prompt_runs WHERE brand_id=$ AND prompt_id = ANY($enabledIds)`. Precision is identical to today's `max(created_at) FROM prompt_runs` because we keep the real timestamp inside each bucket.

We deliberately do **not** expose the worker's refresh cadence to users. The aggregate is at most ~60 s behind the source and that delay is uniform across the dashboard, so a "stats refreshed X ago" affordance would just be one more thing for users to reason about. The `aggregate_refresh_state.last_refreshed_through` value still exists and is read by the worker and the health endpoint (see [Observability](#observability)) — it's just not in the UI.

## Query migration

Every analytics function in `apps/web/src/lib/postgres-read.ts` either gets rewritten to read from the new `hourly_*` tables, stays on raw tables intentionally, or a new helper is added. Below is the full mapping; nothing changes about each function's TypeScript signature or its returned shape.

| Function (today's source) | New source | Notes |
|---|---|---|
| `getDashboardSummary` (prompt_runs) | `hourly_prompt_runs` | `total_runs = sum(total_runs)`, `last_updated = max(last_run_at)`, `total_prompts = count(distinct prompt_id)` |
| `getPerPromptVisibilityTimeSeries` (prompt_runs) | `hourly_prompt_runs` | group by `(prompt_id, (hour AT TIME ZONE $tz)::date)` |
| `getVisibilityDailyAggregate` (prompt_runs + LVCF in SQL) | `hourly_prompt_runs` + same LVCF CTE | LVCF logic unchanged; the CTE that produces per-(prompt, date) observations now sources from the hourly aggregate, with `(hour AT TIME ZONE $tz)::date AS obs_date` |
| `getCitationsTotalCount` (citations) | `hourly_citations` | `count = sum(count)` |
| `getCitationDomainStats` (citations) | `hourly_citations` | drop the `LIMIT 500` cap (the underlying table is small enough that returning everything is fine) |
| `getCitationUrlStats` (citations) | `hourly_citation_urls` | sum(count), avg = sum(sum_citation_index)/sum(count); top-N is `ORDER BY sum(count) DESC LIMIT N` |
| `getPerPromptDailyCitationStats` (citations) | `hourly_citations` | group by `(prompt_id, (hour AT TIME ZONE $tz)::date, domain)` |
| `getDailyCitationStats` (citations) | `hourly_citations` | group by `(hour AT TIME ZONE $tz)::date, domain` |
| `getPromptsSummary` (prompt_runs) | `hourly_prompt_runs` | metrics derived from sum() over the hourly aggregate |
| `getBatchChartData` (prompt_runs) | `hourly_prompt_runs` + `hourly_prompt_run_competitors` | brand series from the first table, competitor series from the second |
| `getBatchVisibilityData` (prompt_runs) | `hourly_prompt_runs` | drop the unnest |
| `getPromptsFirstEvaluatedAt` (prompt_runs) | `hourly_prompt_runs` | `min(first_run_at)` per prompt — preserves the precise timestamp because we kept it in the bucket row |
| `getPromptDailyStats` (prompt_runs, single prompt) | `hourly_prompt_runs` | by prompt_id; uses `(prompt_id, hour)` index |
| `getPromptCompetitorDailyStats` (prompt_runs, single prompt) | `hourly_prompt_run_competitors` | by prompt_id |
| `getPromptCitationStats` (citations, single prompt) | `hourly_citations` | by prompt_id |
| `getPromptCitationUrlStats` (citations, single prompt) | `hourly_citation_urls` | by prompt_id |
| `getPromptMentionSummary` (prompt_runs, single prompt) | `hourly_prompt_runs` | sum() over the per-prompt buckets |
| `getPromptTopCompetitorMentions` (prompt_runs, single prompt) | `hourly_prompt_run_competitors` | order by mention_count |
| `getPromptWebQueriesForMapping` / `getPromptWebQueryCounts` (prompt_runs, web_queries array) | **No change — keep on raw tables** | `web_queries` is a `text[]` and would explode the aggregate row count; these queries are scoped to one prompt, low traffic |
| `getCitationCategoryTotals` (proposed in earlier PR work) | `hourly_citations` + JS `categorizeDomain` | brand/competitor identity is per-tenant, so we keep categorization in JS at request time — see "Categorization" below |
| `getAdmin*` | **No change for now** | Move in a follow-up if useful |

### Per-query rewrites in detail

The migration is mostly mechanical: replace the FROM clause, swap `created_at` for `hour` in the date-range filter, change `count(*) FILTER (WHERE x)` into `sum(x_count)`, and re-bucket on `(hour AT TIME ZONE $tz)::date`. A representative example, `getPerPromptVisibilityTimeSeries`:

**Today (raw):**
```sql
SELECT prompt_id,
       (created_at AT TIME ZONE $tz)::date AS date,
       count(*)::int AS total_runs,
       count(*) FILTER (WHERE brand_mentioned)::int AS brand_mentioned_count
FROM prompt_runs
WHERE brand_id = $1 AND created_at IN range AND prompt_id = ANY($promptIds)
GROUP BY prompt_id, date;
```

**Proposed (hourly aggregate):**
```sql
SELECT prompt_id,
       (hour AT TIME ZONE $tz)::date AS date,
       sum(total_runs)::int          AS total_runs,
       sum(brand_mentioned_count)::int AS brand_mentioned_count
FROM hourly_prompt_runs
WHERE brand_id = $1
  AND hour >= ($from::date AT TIME ZONE $tz)
  AND hour <  (($to::date + interval '1 day') AT TIME ZONE $tz)
  AND prompt_id = ANY($promptIds)
  AND ($model::text IS NULL OR model = $model)
  AND ($webSearchEnabled::boolean IS NULL OR web_search_enabled = $webSearchEnabled)
GROUP BY prompt_id, date;
```

Same shape of result, ~5–500× fewer source rows, and the chart bucketing is exactly correct in the user's TZ.

## Categorization (citations only)

Domain → category (`brand` / `competitor` / `social_media` / `google` / `institutional` / `other`) is currently done in JS at request time in `domain-categories.ts`. We keep doing it that way — the aggregate tables store `domain` (raw), and the categorization function runs on the small result set after the query, exactly like today.

Why not store category directly? The brand/competitor portion of the categorization is per-tenant (depends on the brand's `website` / `additional_domains` and its competitors' `domains` lists), so the `domain → category` mapping changes whenever a tenant edits their domains. Storing it pre-categorized would require invalidating and re-aggregating every affected tenant's history on every domain edit. JS-side categorization at query time avoids this entirely.

## Backfill

One-time job to populate the four tables from existing data. Safe to run while the system is live (it only inserts; no source rows are touched).

```text
For each brand_id (in order of total citation count, descending):
    For each date in [brand's earliest run, today], batched into 7-day chunks:
        Run the same aggregate-rebuild SQL the worker uses, but for the
        whole 7-day chunk in one transaction.
```

Estimated runtime: at ~50 ms per (brand, date) bucket and ~80 brands × ~200 active days per brand on average × 1 day per bucket ≈ 16 K bucket-equivalents, so roughly **15–20 minutes** off-peak. Progress is reported to logs and to `aggregate_refresh_state`.

After the backfill completes:

1. Set `aggregate_refresh_state.last_refreshed_through = now()`.
2. Enable the recurring worker job.
3. Deploy the `postgres-read.ts` rewrites that point at the new tables.

## Edge cases and invariants

| Scenario | What happens | Why it's OK |
|---|---|---|
| **Brand has no aggregates yet** (newly added or backfill in progress) | Reads return zero rows; UI shows the existing empty state | Correct behavior already exists for brands with no runs |
| **Worker job dies mid-tick** | Transaction rolls back, lock releases, next tick re-runs the same window | Idempotency is the whole point of the rebuild-the-bucket pattern |
| **Two ticks try to run at once** | pg-boss singletonKey blocks the second; advisory lock blocks it again at DB level | Belt and suspenders |
| **Worker is down for hours** | Aggregates lag by however long the worker is down. First tick after recovery scans `last_refreshed_through - 1 h` to `now()`, re-aggregates every affected bucket | If the gap exceeds a day, the nightly rebuild catches anything missed |
| **Backfill job inserts rows with `created_at` more than 1 h in the past** | Per-tick refresh misses them. Next nightly rebuild picks them up | If we ever have a backfill job that needs immediate visibility, run a manual rebuild on the affected window |
| **Schema-incompatible source change** (column renamed/dropped) | Worker fails its tick, status moves to `failed`, monitoring alerts | Same response we'd want for any worker-job failure |
| **Backfill not finished but worker enabled** | Worker runs against current rows but historical aggregates are sparse | Backfill should complete before exposing aggregates to readers |
| **User in `Asia/Kolkata` (+5:30) viewing a chart** | `(hour AT TIME ZONE 'Asia/Kolkata')::date` correctly bins each UTC hour into the local date, including the half-hour offset | Postgres's `AT TIME ZONE` handles half-hour TZs natively; the chart bar at the very edge of the window may be off by less than one hour's worth of activity, invisible at chart resolution |

## Rollout

1. **Schema migration** that creates the four `hourly_*` tables and the state row, with no FKs and no triggers. Drops the unused `citations_brand_created_prompt_domain_idx` to free 1.3 GB.
2. **Backfill job** (one-shot CLI script). Run during off-peak. ~15–20 min.
3. **Worker job** (`apps/worker/src/jobs/refresh-hourly-aggregates.ts`) — scheduled every minute via `pg-boss` `boss.schedule(...)`. Verify it converges (`last_refreshed_through` keeps moving forward).
4. **Cutover read paths.** Refactor each function in `postgres-read.ts` listed above. Each function still has its current TypeScript signature, so call sites don't change.
5. **Repoint the overview "Last updated" footer** at `max(last_run_at) FROM hourly_prompt_runs` (no other UI changes — we don't surface the worker's refresh cadence to users).
6. **Smoke** the dashboards on a high-volume brand at 7 d / 30 d / 90 d / 1 y. Compare numbers against the pre-cutover values (we expect ~60 s of staleness, otherwise identical).
7. **Remove dead code.** After 1–2 weeks of stable operation, delete the now-unused raw-table query implementations from postgres-read.ts.

The schema migration, backfill, and worker can all ship before the read-path cutover, so we can verify the aggregates are correct (by querying both raw and aggregate and diffing) before any user-visible change.

## Observability

- `aggregate_refresh_state` is the single source of truth for "is the worker healthy". Add a small `/api/health/aggregates` endpoint that returns `{ last_refreshed_through, last_run_status, lag_seconds }` so an external monitor can alert if `lag_seconds > 300`.
- Worker emits structured logs per tick: `{ event: "refresh-hourly-aggregates.tick", buckets: N, ms: M, status }`. Errors are logged with the failing bucket so a partial failure can be investigated.
- One Grafana / Datadog panel: `lag_seconds` over time. We expect it to oscillate around ~30 s.

## Future enhancements (out of scope for v1)

- **Move admin queries to aggregates.** Same pattern, slight schema additions (no `prompt_id` filter; brand-level aggregates).
- **Pre-compute domain category** in `hourly_citation_urls` once we add a triggers-based invalidation when a brand edits its `website` / `additional_domains` or competitors. Saves the JS categorization pass on every request. ~5–10 % savings on citations page render time.
- **Materialized "what's changed" deltas** maintained by the worker — store top-N URL/domain count diffs between yesterday and today, instead of computing on read.
- **Warm cache of the citations response** with a short TTL — lets us shave the remaining HTTP round trip for repeat views inside a minute.

## Open questions

1. Do we want the backfill script to run brand-by-brand and produce a runbook ("brand X is migrated") so a partial backfill can power the read path for early-migrated brands? Or treat backfill as all-or-nothing?
